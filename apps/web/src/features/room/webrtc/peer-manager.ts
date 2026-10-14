import { QUALITY_PROFILES, type QualityProfileKey } from '@screen-room/protocol';
import type { DiagnosticsLogger } from '../diagnostics/diagnostics-logger';

export interface ManagedPeer {
  id: string;
  createdAt: number;
  generation: string;
  remoteGeneration?: string;
  pc: RTCPeerConnection;
  videoSender?: RTCRtpSender | null;
  audioSender?: RTCRtpSender | null;
  pendingIceCandidates: RTCIceCandidateInit[];
  candidateNegotiations: Map<RTCIceCandidateInit, string | undefined>;
  signalChain: Promise<void>;
  negotiationPending: boolean;
  offerScheduled: boolean;
  ignoreOffer: boolean;
  negotiationId?: string;
  remoteNegotiationId?: string;
  ignoredNegotiations: Set<string>;
  negotiationTimer?: ReturnType<typeof setTimeout>;
  recoveryAttempts: number;
  recovering: boolean;
  remoteStream?: MediaStream;
  recoveryTimer?: ReturnType<typeof setTimeout>;
}

export interface PeerManagerOptions {
  rtcConfigReady?: Promise<RTCConfiguration>;
  refreshRtcConfig?: () => Promise<RTCConfiguration>;
  localPeerId?: string;
  rtcConfig: RTCConfiguration;
  onSendSignal: (target: string, data: any) => boolean | void;
  onRemoteStreamAdd: (peerId: string, stream: MediaStream) => void;
  onPeerState?: (peerId: string, state: RTCPeerConnectionState) => void;
  onRemoteStreamRemove: (peerId: string) => void;
  logger?: DiagnosticsLogger;
}

export class PeerManager {
  private disposed = false;
  private lifecycle = 0;
  private peerVersions = new Map<string, number>();
  private retiredGenerations = new Set<string>();
  private participants = new Set<string>();
  private sharing = new Map<string, boolean>();

  setParticipants(ids: string[]): void {
    const next = new Set(ids);
    for (const id of this.participants) if (!next.has(id)) this.removePeer(id);
    this.participants = next;
    if (this.localStream) for (const id of next) void this.createAndSendOffer(id);
  }

  addParticipant(id: string): void {
    this.participants.add(id);
    if (this.localStream) void this.createAndSendOffer(id);
  }

  setRemoteSharing(id: string, active: boolean): void {
    this.sharing.set(id, active);
    const stream = this.peers.get(id)?.remoteStream;
    if (!active) this.options.onRemoteStreamRemove(id);
    else if (stream) this.options.onRemoteStreamAdd(id, stream);
  }

  private peers = new Map<string, ManagedPeer>();
  private localStream: MediaStream | null = null;
  private currentQuality: QualityProfileKey = 'balanced';
  private readonly configReady: Promise<void>;
  private readonly options: PeerManagerOptions;

  constructor(options: PeerManagerOptions) {
    this.options = options;
    this.configReady = options.rtcConfigReady?.then((config) => this.setRtcConfig(config)) || Promise.resolve();
  }

  setRtcConfig(config: RTCConfiguration): void {
    this.options.rtcConfig = config;
    for (const peer of this.peers.values()) {
      try { peer.pc.setConfiguration?.(config); }
      catch (err: any) { this.options.logger?.log('rtc-config-error', { peer: peer.id, message: err?.message }); }
    }
  }

  getPeers(): Map<string, ManagedPeer> {
    return this.peers;
  }

  getPeer(peerId: string): ManagedPeer | undefined {
    return this.peers.get(peerId);
  }

  getOrCreatePeer(peerId: string): ManagedPeer | null {
    if (this.disposed) return null;
    const existing = this.peers.get(peerId);
    if (existing?.pc && existing.pc.connectionState !== 'closed') {
      return existing;
    }

    if (existing) {
      this.removePeer(peerId);
    }

    if (typeof RTCPeerConnection !== 'function') {
      this.options.logger?.log('pc-unavailable', { peer: peerId });
      return null;
    }

    let pc: RTCPeerConnection;
    try { pc = new RTCPeerConnection(this.options.rtcConfig); }
    catch (err: any) {
      this.options.logger?.log('pc-create-error', { peer: peerId, message: err?.message });
      return null;
    }
    const peer: ManagedPeer = {
      id: peerId,
      createdAt: performance.now(),
      generation: crypto.randomUUID(),
      pc,
      pendingIceCandidates: [],
      candidateNegotiations: new Map(),
      signalChain: Promise.resolve(),
      negotiationPending: false,
      offerScheduled: false,
      ignoreOffer: false,
      ignoredNegotiations: new Set(),
      recoveryAttempts: 0,
      recovering: false,
    };

    this.peers.set(peerId, peer);
    this.options.onPeerState?.(peerId, 'new');
    this.options.logger?.log('pc-created', { peer: peerId, hasStream: Boolean(this.localStream) });

    // If local tracks exist, attach them
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (videoTrack) {
        try {
          peer.videoSender = pc.addTrack(videoTrack, this.localStream);
        } catch (err: any) {
          this.options.logger?.log('add-track-error', { peer: peerId, message: err?.message });
        }
      }
      if (audioTrack) {
        try {
          peer.audioSender = pc.addTrack(audioTrack, this.localStream);
        } catch (err: any) {
          this.options.logger?.log('add-track-error', { peer: peerId, message: err?.message });
        }
      }
    }

    if (!this.localStream && this.sharing.get(peerId)) {
      pc.addTransceiver?.('video', { direction: 'recvonly' });
      pc.addTransceiver?.('audio', { direction: 'recvonly' });
    }

    pc.onnegotiationneeded = () => { if (this.peers.get(peerId) === peer) void this.createAndSendOffer(peerId); };
    pc.onicecandidate = ({ candidate }) => {
      if (this.peers.get(peerId) !== peer) return;
      if (candidate) {
        this.options.logger?.log('ice-local', { peer: peerId, type: candidate.type || '-' });
        this.options.onSendSignal(peerId, { type: 'ice', candidate, negotiationId: peer.negotiationId, generation: peer.generation, targetGeneration: peer.remoteGeneration });
      }
    };

    pc.ontrack = (event) => {
      this.options.logger?.log('remote-track', {
        peer: peerId,
        streams: event.streams.length,
        kind: event.track.kind,
      });
      if (this.peers.get(peerId) !== peer) return;
      peer.remoteStream = event.streams[0] || peer.remoteStream || new MediaStream();
      if (!peer.remoteStream.getTracks().includes(event.track)) peer.remoteStream.addTrack(event.track);
      if (this.sharing.get(peerId) !== false) this.options.onRemoteStreamAdd(peerId, peer.remoteStream);
    };

    pc.onsignalingstatechange = () => {
      if (this.peers.get(peerId) !== peer) return;
      if (pc.signalingState === 'stable' && peer.negotiationPending) void this.createAndSendOffer(peerId);
      this.options.logger?.log('pc-signaling', { peer: peerId, state: pc.signalingState });
    };

    pc.oniceconnectionstatechange = () => {
      if (this.peers.get(peerId) !== peer) return;
      this.options.logger?.log('pc-ice', { peer: peerId, state: pc.iceConnectionState });
    };

    pc.onconnectionstatechange = () => {
      if (this.peers.get(peerId) === peer) this.options.onPeerState?.(peerId, pc.connectionState);
      this.options.logger?.log('pc-connection', { peer: peerId, state: pc.connectionState, elapsedMs: Math.round(performance.now() - peer.createdAt) });
      if (this.peers.get(peerId) !== peer) return;
      if (pc.connectionState === 'connected') {
        peer.recoveryAttempts = 0;
        if (peer.negotiationTimer) clearTimeout(peer.negotiationTimer);
      }
      if (peer.recoveryTimer) clearTimeout(peer.recoveryTimer);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        peer.recoveryTimer = setTimeout(() => {
          if (this.peers.get(peerId) !== peer) return;
          this.recoverPeer(peerId);
        }, pc.connectionState === 'failed' ? 0 : 5000);
      }
    };

    return peer;
  }

  async handleSignal(from: string, data: any): Promise<void> {
    const lifecycle = this.lifecycle;
    await this.configReady;
    if (this.disposed || lifecycle !== this.lifecycle) return;
    if (!['offer', 'answer', 'ice'].includes(data?.type)) return;
    if (this.options.localPeerId && !this.participants.has(from)) return;
    if (data.generation && this.retiredGenerations.has(data.generation)) return;
    let peer = this.peers.get(from);
    if (data.targetGeneration && data.targetGeneration !== peer?.generation) return;
    if (!peer && data.type === 'answer') return;
    peer ||= this.getOrCreatePeer(from) || undefined;
    if (!peer) return;
    if (data.generation) {
      if (peer.remoteGeneration && peer.remoteGeneration !== data.generation) return;
      peer.remoteGeneration = data.generation;
    }
    if (data.type === 'offer') await this.handleOffer(from, data.sdp, data.negotiationId);
    else if (data.type === 'answer') await this.handleAnswer(from, data.sdp, data.negotiationId);
    else if (data.type === 'ice') await this.handleRemoteIce(from, data.candidate, data.negotiationId);
  }

  recoverPeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer || peer.recovering) return;
    peer.recovering = true;
    void this.recoverWithConfiguration(id)
      .catch((err: any) => this.options.logger?.log('recovery-error', { peer: id, message: err?.message }))
      .finally(() => { peer.recovering = false; });
  }

  private async recoverWithConfiguration(id: string): Promise<void> {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.options.logger?.log('recovery-start', { peer: id, attempt: peer.recoveryAttempts + 1 });
    if (this.options.refreshRtcConfig) {
      try { this.setRtcConfig(await this.options.refreshRtcConfig()); }
      catch (err: any) { this.options.logger?.log('recovery-config-error', { message: err?.message }); }
      if (this.peers.get(id) !== peer) return;
    }
    if (++peer.recoveryAttempts <= 2) {
      peer.pc.restartIce?.();
      if (peer.pc.signalingState !== 'stable') {
        peer.signalChain = peer.signalChain.catch(() => {}).then(async () => {
          if (this.peers.get(id) === peer) await peer.pc.setLocalDescription({ type: 'rollback' });
        });
      }
      void this.createAndSendOffer(id);
    } else if ((this.options.localPeerId || '') < id) {
      if (this.options.onSendSignal(id, { type: 'reset' }) !== false) this.resetPeer(id);
    } else this.options.onSendSignal(id, { type: 'reset-request' });
  }

  resetPeer(id: string): void {
    const active = this.sharing.get(id);
    this.removePeer(id);
    this.participants.add(id);
    if (active !== undefined) this.sharing.set(id, active);
    if (this.localStream || active) void this.createAndSendOffer(id);
  }

  async createAndSendOffer(peerId: string): Promise<void> {
    const lifecycle = this.lifecycle;
    const version = this.peerVersions.get(peerId) || 0;
    await this.configReady;
    if (this.disposed || lifecycle !== this.lifecycle || version !== (this.peerVersions.get(peerId) || 0)) return;
    const peer = this.getOrCreatePeer(peerId);
    if (!peer) {
      this.options.logger?.log('offer-abort', { peer: peerId, reason: 'peer-connection-unavailable' });
      return;
    }

    if (peer.offerScheduled) return peer.signalChain;
    peer.offerScheduled = true;
    peer.signalChain = peer.signalChain.catch(() => {}).then(async () => {
      try {
        if (this.peers.get(peerId) !== peer) return;
        if ((!this.localStream && !peer.pc.remoteDescription && !this.sharing.get(peerId)) || peer.pc.signalingState !== 'stable') {
          this.options.logger?.log('offer-skip', { peer: peerId, signalingState: peer.pc.signalingState });
          return;
        }

        peer.negotiationPending = false;
        peer.negotiationId = crypto.randomUUID();
        const offer = await peer.pc.createOffer();
        if (this.peers.get(peerId) !== peer) return;
        await peer.pc.setLocalDescription(offer);
        if (this.peers.get(peerId) !== peer) return;
        await this.applyQualityToPeer(peer);
        this.options.logger?.log('offer-created', { peer: peerId, negotiationId: peer.negotiationId, elapsedMs: Math.round(performance.now() - peer.createdAt) });
        const sent = this.options.onSendSignal(peerId, {
          type: 'offer',
          generation: peer.generation,
          targetGeneration: peer.remoteGeneration,
          negotiationId: peer.negotiationId,
          sdp: peer.pc.localDescription,
        });
        if (peer.negotiationTimer) clearTimeout(peer.negotiationTimer);
        peer.negotiationTimer = setTimeout(() => {
          if (this.peers.get(peerId) === peer && (peer.pc.connectionState !== 'connected' || peer.pc.signalingState !== 'stable')) this.recoverPeer(peerId);
        }, 10000);
        (peer.negotiationTimer as any).unref?.();
        if (sent === false) {
          await peer.pc.setLocalDescription({ type: 'rollback' });
          peer.negotiationPending = true;
          if (peer.negotiationTimer) clearTimeout(peer.negotiationTimer);
        }
      } catch (err: any) {
        this.options.logger?.log('offer-error', { peer: peerId, message: err?.message });
      } finally {
        peer.offerScheduled = false;
      }
    });

    await peer.signalChain;
  }

  async handleOffer(from: string, sdp: RTCSessionDescriptionInit, negotiationId?: string): Promise<void> {
    const peer = this.getOrCreatePeer(from);
    if (!peer) return;

    peer.signalChain = peer.signalChain.catch(() => {}).then(async () => {
      try {
        if (this.peers.get(from) !== peer) return;
        const collision = peer.pc.signalingState !== 'stable';
        peer.ignoreOffer = collision && (this.options.localPeerId || '') < from;
        if (peer.ignoreOffer) {
          if (negotiationId) peer.ignoredNegotiations.add(negotiationId);
          peer.pendingIceCandidates.length = 0;
          peer.candidateNegotiations.clear();
          return;
        }
        peer.remoteNegotiationId = negotiationId;
        peer.negotiationId = negotiationId;
        // setRemoteDescription performs the polite rollback atomically, avoiding a
        // transient stable state that could launch another local offer.
        if (collision) this.options.logger?.log('offer-rollback', { peer: from });
        await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        this.options.logger?.log('offer-received', { from });
        await this.flushPendingIce(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        if (this.peers.get(from) !== peer) return;
        this.options.logger?.log('answer-created', { to: from });
        this.options.onSendSignal(from, {
          type: 'answer',
          generation: peer.generation,
          targetGeneration: peer.remoteGeneration,
          negotiationId,
          sdp: peer.pc.localDescription,
        });
      } catch (err: any) {
        this.options.logger?.log('handle-offer-error', { from, message: err?.message });
      }
    });

    await peer.signalChain;
  }

  async handleAnswer(from: string, sdp: RTCSessionDescriptionInit, negotiationId?: string): Promise<void> {
    const peer = this.peers.get(from);
    if (!peer) return;

    peer.signalChain = peer.signalChain.catch(() => {}).then(async () => {
      try {
        if (this.peers.get(from) !== peer || peer.pc.signalingState !== 'have-local-offer' || (negotiationId && negotiationId !== peer.negotiationId)) return;
        await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        peer.remoteNegotiationId = negotiationId;
        this.options.logger?.log('answer-received', { from, elapsedMs: Math.round(performance.now() - peer.createdAt) });
        await this.flushPendingIce(peer);
      } catch (err: any) {
        this.options.logger?.log('handle-answer-error', { from, message: err?.message });
      }
    });

    await peer.signalChain;
  }

  async handleRemoteIce(from: string, candidate: RTCIceCandidateInit, negotiationId?: string): Promise<void> {
    const peer = this.getOrCreatePeer(from);
    if (!peer) return;

    peer.signalChain = peer.signalChain.catch(() => {}).then(async () => {
      try {
        if (this.peers.get(from) !== peer || (negotiationId ? peer.ignoredNegotiations.has(negotiationId) : peer.ignoreOffer)) return;
        if (!peer.pc.remoteDescription || (negotiationId && negotiationId !== peer.remoteNegotiationId)) {
          if (peer.pendingIceCandidates.length >= 256) return;
          peer.pendingIceCandidates.push(candidate);
          peer.candidateNegotiations.set(candidate, negotiationId);
          this.options.logger?.log('ice-queued', { from, queued: peer.pendingIceCandidates.length });
          return;
        }

        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
        this.options.logger?.log('ice-remote', { from });
      } catch (err: any) {
        this.options.logger?.log('handle-ice-error', { from, message: err?.message });
      }
    });

    await peer.signalChain;
  }

  private async flushPendingIce(peer: ManagedPeer): Promise<void> {
    const pending = peer.pendingIceCandidates.splice(0);
    for (const candidate of pending) {
      const id = peer.candidateNegotiations.get(candidate);
      peer.candidateNegotiations.delete(candidate);
      if (id && id !== peer.remoteNegotiationId) continue;
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err: any) {
        this.options.logger?.log('ice-flush-candidate-error', { peer: peer.id, message: err?.message });
      }
    }
    if (pending.length > 0) {
      this.options.logger?.log('ice-flushed', { from: peer.id, count: pending.length });
    }
  }

  async attachLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    await this.configReady;
    if (this.localStream !== stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    for (const id of this.participants) this.getOrCreatePeer(id);
    await Promise.all([...this.peers.values()].map((peer) => {
      peer.signalChain = peer.signalChain.catch(() => {}).then(async () => {
        if (this.peers.get(peer.id) !== peer || this.localStream !== stream) return;
        if (peer.videoSender && videoTrack) {
          await peer.videoSender.replaceTrack(videoTrack);
        } else if (videoTrack) {
          peer.videoSender = peer.pc.addTrack(videoTrack, stream);
        }

        if (peer.audioSender) {
          await peer.audioSender.replaceTrack(audioTrack || null);
        } else if (audioTrack) {
          peer.audioSender = peer.pc.addTrack(audioTrack, stream);
        }
        peer.negotiationPending = true;
      }).catch((err) => this.options.logger?.log('attach-error', { peer: peer.id, message: err?.message }));
      return peer.signalChain;
    }));

    await this.applyQuality(this.currentQuality);

    // Trigger offer to all peers in stable state
    await Promise.all(
      [...this.peers.keys()].map((peerId) =>
        this.createAndSendOffer(peerId).catch((err) => {
          this.options.logger?.log('offer-error', { peer: peerId, message: err?.message });
        }),
      ),
    );
  }

  async detachLocalStream(): Promise<void> {
    this.localStream = null;
    await Promise.all([...this.peers.values()].map((peer) => {
      peer.signalChain = peer.signalChain.catch(() => {}).then(async () => {
        if (this.peers.get(peer.id) !== peer) return;
        await Promise.all([peer.videoSender, peer.audioSender].map(async (sender) => {
          try { await sender?.replaceTrack(null); }
          catch (err: any) { this.options.logger?.log('replace-null-track-error', { peer: peer.id, message: err?.message }); }
        }));
      });
      return peer.signalChain;
    }));
  }

  async applyQuality(qualityKey: QualityProfileKey): Promise<void> {
    this.currentQuality = qualityKey;
    for (const peer of this.peers.values()) {
      await this.applyQualityToPeer(peer);
    }
    const profile = QUALITY_PROFILES[qualityKey];
    try {
      const track = this.localStream?.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() || {};
      const bounded = (value: number, range?: { min?: number; max?: number }) => ({
        ideal: Math.max(range?.min ?? 0, Math.min(value, range?.max ?? value)),
      });
      await track?.applyConstraints?.({
        frameRate: bounded(profile.maxFramerate, capabilities.frameRate),
        width: bounded(profile.width, capabilities.width),
        height: bounded(profile.height, capabilities.height),
      });
    } catch (err: any) {
      this.options.logger?.log('capture-quality-error', { message: err?.message });
    }
    this.options.logger?.log('quality-applied', {
      profile: qualityKey,
      bitrate: profile.maxBitrate,
      fps: profile.maxFramerate,
    });
  }

  private async applyQualityToPeer(peer: ManagedPeer): Promise<void> {
    const profile = QUALITY_PROFILES[this.currentQuality];
    const sender = peer.videoSender || peer.pc.getSenders().find((item) => item.track?.kind === 'video');
    if (!sender?.getParameters || !sender.setParameters) return;

    try {
      const parameters = sender.getParameters();
      parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
      parameters.encodings[0].maxBitrate = profile.maxBitrate;
      parameters.encodings[0].maxFramerate = profile.maxFramerate;
      await sender.setParameters(parameters);
    } catch (err: any) {
      this.options.logger?.log('quality-apply-skip', { peer: peer.id, message: err?.message });
    }
  }

  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    this.peerVersions.set(peerId, (this.peerVersions.get(peerId) || 0) + 1);
    this.participants.delete(peerId);
    this.sharing.delete(peerId);
    if (!peer) return;

    if (peer.remoteGeneration) this.retiredGenerations.add(peer.remoteGeneration);
    this.peers.delete(peerId);
    if (peer.recoveryTimer) clearTimeout(peer.recoveryTimer);
    if (peer.negotiationTimer) clearTimeout(peer.negotiationTimer);
    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.onsignalingstatechange = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.oniceconnectionstatechange = null;
    try {
      peer.pc.close();
    } catch {
      // ignore
    }

    this.options.onPeerState?.(peerId, 'closed');
    this.options.onRemoteStreamRemove(peerId);
    this.options.logger?.log('pc-closed', { peer: peerId });
  }

  dispose(): void {
    this.disposed = true;
    this.localStream = null;
    this.closeAll();
  }

  closeAll(): void {
    this.lifecycle++;
    for (const peerId of [...this.peers.keys()]) {
      this.removePeer(peerId);
    }
    this.participants.clear();
    this.sharing.clear();
  }
}
