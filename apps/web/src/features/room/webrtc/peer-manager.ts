import { QUALITY_PROFILES, type QualityProfileKey } from '@screen-room/protocol';
import type { DiagnosticsLogger } from '../diagnostics/diagnostics-logger';

export interface ManagedPeer {
  id: string;
  pc: RTCPeerConnection;
  videoSender?: RTCRtpSender | null;
  audioSender?: RTCRtpSender | null;
  pendingIceCandidates: RTCIceCandidateInit[];
  signalChain: Promise<void>;
}

export interface PeerManagerOptions {
  rtcConfig: RTCConfiguration;
  onSendSignal: (target: string, data: any) => void;
  onRemoteStreamAdd: (peerId: string, stream: MediaStream) => void;
  onRemoteStreamRemove: (peerId: string) => void;
  logger?: DiagnosticsLogger;
}

export class PeerManager {
  private peers = new Map<string, ManagedPeer>();
  private localStream: MediaStream | null = null;
  private currentQuality: QualityProfileKey = 'balanced';
  private readonly options: PeerManagerOptions;

  constructor(options: PeerManagerOptions) {
    this.options = options;
  }

  setRtcConfig(config: RTCConfiguration): void {
    this.options.rtcConfig = config;
  }

  getPeers(): Map<string, ManagedPeer> {
    return this.peers;
  }

  getPeer(peerId: string): ManagedPeer | undefined {
    return this.peers.get(peerId);
  }

  getOrCreatePeer(peerId: string): ManagedPeer | null {
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

    const pc = new RTCPeerConnection(this.options.rtcConfig);
    const peer: ManagedPeer = {
      id: peerId,
      pc,
      pendingIceCandidates: [],
      signalChain: Promise.resolve(),
    };

    this.peers.set(peerId, peer);
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

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.options.logger?.log('ice-local', { peer: peerId, type: candidate.type || '-' });
        this.options.onSendSignal(peerId, { type: 'ice', candidate });
      }
    };

    pc.ontrack = (event) => {
      this.options.logger?.log('remote-track', {
        peer: peerId,
        streams: event.streams.length,
        kind: event.track.kind,
      });
      if (event.streams[0]) {
        this.options.onRemoteStreamAdd(peerId, event.streams[0]);
      }
    };

    pc.onsignalingstatechange = () => {
      this.options.logger?.log('pc-signaling', { peer: peerId, state: pc.signalingState });
    };

    pc.oniceconnectionstatechange = () => {
      this.options.logger?.log('pc-ice', { peer: peerId, state: pc.iceConnectionState });
    };

    pc.onconnectionstatechange = () => {
      this.options.logger?.log('pc-connection', { peer: peerId, state: pc.connectionState });
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(peerId);
      }
    };

    return peer;
  }

  async createAndSendOffer(peerId: string): Promise<void> {
    const peer = this.getOrCreatePeer(peerId);
    if (!peer) {
      this.options.logger?.log('offer-abort', { peer: peerId, reason: 'peer-connection-unavailable' });
      return;
    }

    peer.signalChain = peer.signalChain.then(async () => {
      if (!this.localStream || peer.pc.signalingState !== 'stable') {
        this.options.logger?.log('offer-skip', {
          peer: peerId,
          hasStream: Boolean(this.localStream),
          signalingState: peer.pc.signalingState,
        });
        return;
      }

      try {
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        await this.applyQualityToPeer(peer);
        this.options.logger?.log('offer-created', { peer: peerId });
        this.options.onSendSignal(peerId, {
          type: 'offer',
          sdp: peer.pc.localDescription,
        });
      } catch (err: any) {
        this.options.logger?.log('offer-error', { peer: peerId, message: err?.message });
      }
    });

    await peer.signalChain;
  }

  async handleOffer(from: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.getOrCreatePeer(from);
    if (!peer) return;

    peer.signalChain = peer.signalChain.then(async () => {
      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        this.options.logger?.log('offer-received', { from });
        await this.flushPendingIce(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.options.logger?.log('answer-created', { to: from });
        this.options.onSendSignal(from, {
          type: 'answer',
          sdp: peer.pc.localDescription,
        });
      } catch (err: any) {
        this.options.logger?.log('handle-offer-error', { from, message: err?.message });
      }
    });

    await peer.signalChain;
  }

  async handleAnswer(from: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.getOrCreatePeer(from);
    if (!peer) return;

    peer.signalChain = peer.signalChain.then(async () => {
      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        this.options.logger?.log('answer-received', { from });
        await this.flushPendingIce(peer);
      } catch (err: any) {
        this.options.logger?.log('handle-answer-error', { from, message: err?.message });
      }
    });

    await peer.signalChain;
  }

  async handleRemoteIce(from: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.getOrCreatePeer(from);
    if (!peer) return;

    peer.signalChain = peer.signalChain.then(async () => {
      try {
        if (!peer.pc.remoteDescription) {
          peer.pendingIceCandidates.push(candidate);
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
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    for (const peer of this.peers.values()) {
      if (peer.videoSender && videoTrack) {
        await peer.videoSender.replaceTrack(videoTrack);
      } else if (videoTrack) {
        peer.videoSender = peer.pc.addTrack(videoTrack, stream);
      }

      if (peer.audioSender && audioTrack) {
        await peer.audioSender.replaceTrack(audioTrack);
      } else if (audioTrack) {
        peer.audioSender = peer.pc.addTrack(audioTrack, stream);
      }
    }

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
    for (const peer of this.peers.values()) {
      if (peer.videoSender) {
        try {
          await peer.videoSender.replaceTrack(null);
        } catch (err: any) {
          this.options.logger?.log('replace-null-track-error', { peer: peer.id, message: err?.message });
        }
      }
      if (peer.audioSender) {
        try {
          await peer.audioSender.replaceTrack(null);
        } catch (err: any) {
          this.options.logger?.log('replace-null-track-error', { peer: peer.id, message: err?.message });
        }
      }
    }
  }

  async applyQuality(qualityKey: QualityProfileKey): Promise<void> {
    this.currentQuality = qualityKey;
    for (const peer of this.peers.values()) {
      await this.applyQualityToPeer(peer);
    }
    const profile = QUALITY_PROFILES[qualityKey];
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
    if (!peer) return;

    try {
      peer.pc.close();
    } catch {
      // ignore
    }

    this.peers.delete(peerId);
    this.options.onRemoteStreamRemove(peerId);
    this.options.logger?.log('pc-closed', { peer: peerId });
  }

  closeAll(): void {
    for (const peerId of [...this.peers.keys()]) {
      this.removePeer(peerId);
    }
  }
}
