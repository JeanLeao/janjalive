import { StageSelectionPublisher } from './stage-selection-publisher';
import { LiveAnnotations } from '../collaboration/live-annotations';
import type { CollaborationMessage } from '@screen-room/protocol';
import { useRoomInteractions } from './useRoomInteractions';
import type { Reaction } from '@screen-room/protocol';
import { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { canSendStageSelection, followReducer, followDisplayStatus, followTarget, initialFollowState } from './follow-presenter';
import {
  type QualitySelection,
  DEFAULT_QUALITY, normalizeQuality, resolveQuality, downgradeQuality,
} from '@screen-room/protocol';
import type {
  ConnectionState,
  DiagnosticEntry,
  NetworkMetrics,
  RemoteStreamEntry,
  RoomParticipant,
} from '../types';
import { DiagnosticsLogger } from '../diagnostics/diagnostics-logger';
import { SignalingClient } from '../signaling/signaling-client';
import { PeerManager } from '../webrtc/peer-manager';
import { fetchIceConfiguration } from '../webrtc/ice-config';
import { StatsCollector } from '../stats/stats-collector';
import {
  captureDisplayMedia,
  applyCaptureQuality,
  formatSharingErrorMessage,
  setStreamAudioMuted,
  stopAllTracks,
} from '../media/display-media';

type CaptureState = 'idle' | 'requesting' | 'preview' | 'publishing' | 'sharing' | 'pausing' | 'paused' | 'resuming' | 'stopping' | 'switch-requesting' | 'switch-preview' | 'switch-publishing' | 'switch-restoring';

interface CaptureSwitch {
  previous: MediaStream;
  wasPaused: boolean;
  enabled: Map<MediaStreamTrack, boolean>;
  muted: boolean;
  detached: Promise<boolean>;
  pending: MediaStream | null;
  removePendingListener?: () => void;
}

export interface UseRoomSessionOptions {
  roomId: string;
  displayName?: string;
  enabled?: boolean;
}

export function useRoomSession({ roomId, displayName, enabled = true }: UseRoomSessionOptions) {
  const annotations = useMemo(() => new LiveAnnotations(), [roomId]);
  const serverClockOffsetRef = useRef(0);
  const collaborationReadyRef = useRef(false);
  const localPeerRef = useRef('');
  const collaborationSeqRef = useRef(0);
  const pointingSeqRef = useRef(0);
  const spectatorDrawingSeqRef = useRef(0);
  const clearCollaborativeSeqRef = useRef(0);
  const [pointingEnabled, setPointingEnabled] = useState<boolean>(true);
  const pointingEnabledRef = useRef<boolean>(true);
  const [drawingEnabled, setDrawingEnabled] = useState<boolean>(false);
  const drawingEnabledRef = useRef<boolean>(false);
  const interactions = useRoomInteractions(roomId);
  const interactionsRef = useRef(interactions);
  interactionsRef.current = interactions;
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('connecting');
  const [participantCount, setParticipantCount] = useState<number>(1);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [hasAudioTrack, setHasAudioTrack] = useState<boolean>(false);
  const [remoteConnectionStates, setRemoteConnectionStates] = useState<Record<string, RTCPeerConnectionState>>({});
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamEntry[]>([]);
  const [quality, setQuality] = useState<QualitySelection>(DEFAULT_QUALITY);
  const [qualityPending, setQualityPending] = useState(false);
  const [qualityNotice, setQualityNotice] = useState<string | null>(null);
  const qualityOperationRef = useRef<object | null>(null);
  const [networkStats, setNetworkStats] = useState<NetworkMetrics | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const participantsRef = useRef<RoomParticipant[]>([]);
  participantsRef.current = participants;
  const [featuredStreamId, setFeaturedStreamId] = useState<string | null>(null);
  const [currentNickname, setCurrentNickname] = useState<string>('');
  const [follow, dispatchFollow] = useReducer(followReducer, initialFollowState);
  const followRef = useRef(follow);
  followRef.current = follow;
  const featuredStreamIdRef = useRef<string | null>(null);
  featuredStreamIdRef.current = featuredStreamId;
  const followExpiryTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (displayName) {
      setCurrentNickname(displayName);
    }
  }, [displayName]);

  const endedHandlerRef = useRef<{ track: MediaStreamTrack; handler: () => void } | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const captureStateRef = useRef<CaptureState>('idle');
  const transition = useCallback((state: CaptureState) => {
    captureStateRef.current = state;
    setCaptureState(state);
  }, []);
  const captureGenerationRef = useRef(0);
  const switchRef = useRef<CaptureSwitch | null>(null);
  const [pendingStream, setPendingStream] = useState<MediaStream | null>(null);
  const sharingIdRef = useRef<string | undefined>(undefined);
  const loggerRef = useRef<DiagnosticsLogger | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const signalingRoomRef = useRef<string | null>(null);
  const peerManagerRef = useRef<PeerManager | null>(null);
  const statsCollectorRef = useRef<StatsCollector | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const qualityRef = useRef<QualitySelection>(DEFAULT_QUALITY);
  const remoteStreamsRef = useRef<RemoteStreamEntry[]>([]);
  const nicknameRef = useRef<string | undefined>(displayName?.trim() || undefined);
  const reconnectTokenRef = useRef<string | undefined>(undefined);

  const stageSelectionPublisher = useMemo(() => new StageSelectionPublisher({
    canSend: () => canSendStageSelection({
      connected: signalingRef.current?.getState() === 'connected',
      roomReady: collaborationReadyRef.current && signalingRoomRef.current === roomId,
      sharing: Boolean(sharingIdRef.current),
    }),
    isValidTarget: (id) => id === localPeerRef.current
      ? Boolean(sharingIdRef.current)
      : participantsRef.current.some(p => p.peerId === id && p.isSharing),
    send: (targetPeerId) => signalingRef.current?.send({ type: 'select-stage', targetPeerId }) ?? false,
  }), [roomId]);

  remoteStreamsRef.current = remoteStreams;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  }, []);

  // Initialize session on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!enabled) {
      setConnectionStatus('connected');
      return;
    }

    const logger = new DiagnosticsLogger();
    loggerRef.current = logger;
    const unsubscribeLogger = logger.subscribe(setDiagnostics);

    const peerId = `p_${crypto.randomUUID().replace(/-/g, '')}`;
    localPeerRef.current = peerId;
    const initialNick = nicknameRef.current;
    logger.log('session-init', { roomId, peerId, displayName: initialNick || 'Anonymous' });

    setRemoteConnectionStates({});
    setFeaturedStreamId(null);
    dispatchFollow({ type: 'reset' });
    setErrorMessage(null);
    setParticipants([
      {
        peerId,
        nickname: initialNick,
        isLocal: true,
        isSharing: false,
      },
    ]);

    let isDisposed = false;

    const iceConfiguration = fetchIceConfiguration(undefined, logger);

    // Create PeerManager
    const peerManager = new PeerManager({
      rtcConfigReady: iceConfiguration,
      refreshRtcConfig: () => fetchIceConfiguration(undefined, logger),
      localPeerId: peerId,
      rtcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      onSendSignal: (target, data) => {
        return signalingRef.current?.relaySignal(target, data) ?? false;
      },
      onPeerState: (id, state) => { if (!isDisposed) setRemoteConnectionStates((prev) => ({ ...prev, [id]: state })); },
      onRemoteStreamAdd: (remotePeerId, stream) => {
        setRemoteStreams((prev) => {
          const filtered = prev.filter((item) => item.peerId !== remotePeerId);
          return [...filtered, { peerId: remotePeerId, stream }];
        });
        setFeaturedStreamId((current) => {
          // If no stream is currently featured, spotlight this incoming stream
          if (!current) return remotePeerId;
          // If something is already in spotlight, preserve existing focus without hijacking
          return current;
        });
      },
      onRemoteStreamRemove: (remotePeerId) => {
        setRemoteStreams((prev) => {
          const remaining = prev.filter((item) => item.peerId !== remotePeerId);
          setFeaturedStreamId((current) => {
            if (current === remotePeerId) {
              if (remaining.length > 0) return remaining[0].peerId;
              if (localStreamRef.current) return 'local';
              return null;
            }
            return current;
          });
          return remaining;
        });
      },
      logger,
    });
    peerManagerRef.current = peerManager;

    // Create StatsCollector with auto-downgrade handler
    const statsCollector = new StatsCollector({
      peerManager,
      onStats: (metrics) => {
        if (!isDisposed) setNetworkStats(metrics);
      },
      onDegradation: (lossPercent) => {
        if (!localStreamRef.current) return;
        const curQuality = qualityRef.current;
        if (curQuality.profile === 'economy') return;
        const nextQuality = downgradeQuality(curQuality);
        qualityRef.current = nextQuality;
        logger.log('quality-downgrade', { from: JSON.stringify(curQuality), to: JSON.stringify(nextQuality), loss: lossPercent });
        setQuality(nextQuality);
        peerManager.applyQuality(nextQuality);
        showToast('Rede instável: qualidade de transmissão reduzida automaticamente.');
      },
      logger,
    });
    statsCollectorRef.current = statsCollector;

    // F29: a followed presenter that dropped involuntarily keeps its slot for the server grace period.
    const followExpiryTimers = followExpiryTimersRef.current;
    const clearFollowExpiry = (presenterId: string) => {
      const timer = followExpiryTimers.get(presenterId);
      if (timer) clearTimeout(timer);
      followExpiryTimers.delete(presenterId);
    };
    const presenterLeft = (presenterId: string, reconnectGraceMs?: number) => {
      clearFollowExpiry(presenterId);
      dispatchFollow({ type: 'presenter-left', presenterId, reserved: Boolean(reconnectGraceMs) });
      if (reconnectGraceMs && followRef.current.presenterId === presenterId) {
        followExpiryTimers.set(presenterId, setTimeout(() => {
          followExpiryTimers.delete(presenterId);
          if (!isDisposed) dispatchFollow({ type: 'presenter-expired', presenterId });
        }, reconnectGraceMs + 1000));
      }
    };
    const presenterBack = (presenterId: string) => {
      clearFollowExpiry(presenterId);
      dispatchFollow({ type: 'presenter-back', presenterId });
    };

    // Create SignalingClient
    const signaling = new SignalingClient({
      onStateChange: (state) => {
        if (isDisposed) return;
        setConnectionStatus(state);
        if (state !== 'connected') {
          stageSelectionPublisher.cancel();
          interactionsRef.current.resetConnection();
          collaborationReadyRef.current = false;
          annotations.reset();
        }
        if (state === 'disconnected') peerManager.closeAll();
        if (state === 'connected') {
          signaling.join(roomId, peerId, nicknameRef.current, reconnectTokenRef.current);
        }
      },
      onMessage: (message) => {
        if (isDisposed) return;
        interactionsRef.current.receive(message);
        if (message.type === 'collaboration') {
          if (collaborationReadyRef.current && message.roomId === roomId) annotations.receive(message, Math.max(0, Date.now() - serverClockOffsetRef.current - message.timestamp));
        }
        if (message.type === 'peers') {
          serverClockOffsetRef.current = message.serverTime === undefined ? 0 : Date.now() - message.serverTime;
          annotations.reset();
          collaborationReadyRef.current = true;
          for (const p of message.participants || []) if (p.peerId !== peerId) annotations.setCapture(p.peerId, p.sharing?.active ? p.sharing.streamId : undefined);
          annotations.setCapture(peerId, sharingIdRef.current);
          const snapshot: Record<string, { targetPeerId: string | null; seq: number }> = {};
          for (const p of message.participants || []) if (p.peerId !== peerId && p.selection) snapshot[p.peerId] = p.selection;
          dispatchFollow({ type: 'snapshot', selections: snapshot });
          const followed = followRef.current.presenterId;
          if (followed) {
            if ((message.participants || []).some((p) => p.peerId === followed)) {
              presenterBack(followed);
            } else {
              const reserved = message.reservedPeers?.find((r) => r.peerId === followed);
              if (reserved) {
                presenterLeft(followed, reserved.reconnectGraceMs);
              } else {
                presenterLeft(followed, undefined);
              }
            }
          }
          if (message.reconnectToken) {
            reconnectTokenRef.current = message.reconnectToken;
          }
          peerManager.setParticipants((message.participants?.map((p) => p.peerId) || message.peers).filter((id) => id !== peerId));
          for (const p of message.participants || []) if (p.peerId !== peerId && p.sharing) peerManager.setRemoteSharing(p.peerId, p.sharing.active);
          signaling.updateSharing({ active: Boolean(sharingIdRef.current), paused: Boolean(sharingIdRef.current) && captureStateRef.current !== 'sharing', streamId: sharingIdRef.current, pointingEnabled: Boolean(sharingIdRef.current) ? pointingEnabledRef.current : undefined, drawingEnabled: Boolean(sharingIdRef.current) ? drawingEnabledRef.current : undefined, hasAudio: Boolean(localStreamRef.current?.getAudioTracks().length), audioMuted: switchRef.current?.muted ?? (localStreamRef.current?.getAudioTracks().some((track) => !track.enabled) || false) });
          setParticipantCount(Math.max(1, message.count));
          setParticipants((prev) => {
            const local = prev.find((p) => p.isLocal) || {
              peerId,
              nickname: nicknameRef.current,
              isLocal: true,
              isSharing: false,
            };
            const remoteList: RoomParticipant[] = (message.participants || [])
              .filter((p) => p.peerId !== peerId)
              .map((p) => ({
                peerId: p.peerId,
                nickname: p.nickname,
                isLocal: false,
                isSharing: Boolean(p.sharing?.active),
                isPaused: Boolean(p.sharing?.paused),
                pointingEnabled: p.sharing?.active ? p.sharing.pointingEnabled !== false : undefined,
                drawingEnabled: p.sharing?.active ? p.sharing.drawingEnabled === true : false,
                hasAudio: p.sharing?.hasAudio,
                streamId: p.sharing?.streamId,
              }));

            if (!message.participants && message.peers) {
              message.peers.forEach((pId) => {
                if (pId !== peerId) {
                  remoteList.push({
                    peerId: pId,
                    nickname: undefined,
                    isLocal: false,
                    isSharing: false,
                  });
                }
              });
            }
            return [local, ...remoteList];
          });

        } else if (message.type === 'stage-selected') {
          if (message.peerId === peerId) stageSelectionPublisher.acknowledge(message.targetPeerId, message.seq);
          dispatchFollow({ type: 'selection', presenterId: message.peerId, targetPeerId: message.targetPeerId, seq: message.seq });
        } else if (message.type === 'peer-joined') {
          presenterBack(message.peerId);
          peerManager.addParticipant(message.peerId);
          setParticipantCount(Math.max(1, message.count));
          setParticipants((prev) => {
            const exists = prev.some((p) => p.peerId === message.peerId);
            if (exists) {
              return prev.map((p) =>
                p.peerId === message.peerId ? { ...p, nickname: message.nickname || p.nickname } : p
              );
            }
            return [
              ...prev,
              {
                peerId: message.peerId,
                nickname: message.nickname,
                isLocal: false,
                isSharing: false,
              },
            ];
          });

          if (message.nickname) {
            showToast(`${message.nickname} entrou na sala.`);
          } else {
            showToast('Visitante entrou na sala.');
          }

        } else if (message.type === 'peer-left') {
          stageSelectionPublisher.invalidate(message.peerId);
          annotations.removePeer(message.peerId);
          presenterLeft(message.peerId, message.reconnectGraceMs);
          setParticipantCount(Math.max(1, message.count));
          setParticipants((prev) => {
            const leaving = prev.find((p) => p.peerId === message.peerId);
            if (leaving) {
              const name = leaving.nickname || 'Visitante';
              showToast(`${name} saiu da sala.`);
            }
            return prev.filter((p) => p.peerId !== message.peerId);
          });
          peerManager.removePeer(message.peerId);
        } else if (message.type === 'peer-updated') {
          setParticipants((prev) => {
            return prev.map((p) =>
              p.peerId === message.peerId
                ? { ...p, nickname: message.nickname || undefined }
                : p
            );
          });
          if (message.nickname) {
            showToast(`Participante alterou o nome para ${message.nickname}.`);
          } else {
            showToast('Participante removeu o nickname.');
          }
        } else if (message.type === 'sharing-updated') {
          if (!message.active) stageSelectionPublisher.invalidate(message.peerId);
          annotations.setCapture(message.peerId, message.active ? message.streamId : undefined);
          if (message.active && message.pointingEnabled === false) annotations.clearPointers(message.peerId);
          if (message.active && message.drawingEnabled === false) annotations.clearCollaborativeDrawings(message.peerId);
          peerManager.setRemoteSharing(message.peerId, message.active);
          setParticipants((prev) => prev.map((p) => p.peerId === message.peerId ? { ...p, isSharing: message.active, streamId: message.streamId, isPaused: Boolean(message.paused), pointingEnabled: message.active ? message.pointingEnabled !== false : undefined, drawingEnabled: message.active ? message.drawingEnabled === true : false, hasAudio: message.hasAudio } : p));
        } else if (message.type === 'signal') {
          const { from, data } = message;
          if (data.type === 'reset' && from < peerId) {
            peerManager.resetPeer(from);
          } else if (data.type === 'reset-request' && peerId < from) {
            if (signaling.relaySignal(from, { type: 'reset' })) peerManager.resetPeer(from);
          } else {
            void peerManager.handleSignal(from, data);
          }
        } else if (message.type === 'error') {
          logger.log('signal-server-error', { message: message.message });
          if (!message.message.includes('não encontrado')) {
            setErrorMessage(message.message);
            showToast(message.message);
          }
        }
      },
      onError: (err) => {
        if (!isDisposed) {
          setErrorMessage(err.message || 'Erro de conexão no signaling');
        }
      },
      logger,
    });
    signalingRef.current = signaling;
    signalingRoomRef.current = roomId;

    // Load ICE configuration asynchronously
    iceConfiguration.then((config) => {
      if (!isDisposed) {
        peerManager.setRtcConfig(config);
        signaling.connect();
        statsCollector.start();
      }
    });

    return () => {
      isDisposed = true;
      stageSelectionPublisher.cancel();
      for (const timer of followExpiryTimers.values()) clearTimeout(timer);
      followExpiryTimers.clear();
      dispatchFollow({ type: 'reset' });
      signalingRoomRef.current = null;
      collaborationReadyRef.current = false;
      annotations.reset();
      signalingRef.current = null;
      interactionsRef.current.resetConnection();
      captureGenerationRef.current++;
      qualityOperationRef.current = null;
      setQualityPending(false);
      setQualityNotice(null);
      if (endedHandlerRef.current) {
        const { track, handler } = endedHandlerRef.current;
        track.removeEventListener('ended', handler);
        endedHandlerRef.current = null;
      }
      transition('idle');
      sharingIdRef.current = undefined;
      pointingEnabledRef.current = true;
      setPointingEnabled(true);
      annotations.setCapture(localPeerRef.current);
      switchRef.current?.removePendingListener?.();
      stopAllTracks(switchRef.current?.pending ?? null);
      stopAllTracks(switchRef.current?.previous ?? null);
      switchRef.current = null;
      setPendingStream(null);
      stopAllTracks(localStreamRef.current);
      localStreamRef.current = null;
      setLocalStream(null);
      setIsSharing(false);
      reconnectTokenRef.current = undefined;
      unsubscribeLogger();
      statsCollector.stop();
      peerManager.dispose();
      signaling.disconnect();
    };
  }, [roomId, showToast, enabled, annotations, stageSelectionPublisher]);

  const stopSharing = useCallback(() => {
    stageSelectionPublisher.cancel();
    qualityOperationRef.current = null;
    setQualityPending(false);
    setQualityNotice(null);
    const generation = ++captureGenerationRef.current;
    if (endedHandlerRef.current) {
      const { track, handler } = endedHandlerRef.current;
      track.removeEventListener('ended', handler);
      endedHandlerRef.current = null;
    }
    switchRef.current?.removePendingListener?.();
    stopAllTracks(switchRef.current?.pending ?? null);
    stopAllTracks(switchRef.current?.previous ?? null);
    switchRef.current = null;
    setPendingStream(null);
    transition('stopping');
    signalingRef.current?.updateSharing({ active: false, hasAudio: false, audioMuted: false });
    sharingIdRef.current = undefined;
    pointingEnabledRef.current = true;
    setPointingEnabled(true);
    drawingEnabledRef.current = false;
    setDrawingEnabled(false);
    annotations.setCapture(localPeerRef.current);
    if (localStreamRef.current) {
      stopAllTracks(localStreamRef.current);
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setIsSharing(false);
    setIsAudioMuted(false);
    setHasAudioTrack(false);

    setFeaturedStreamId((current) => {
      if (current === 'local') {
        return remoteStreamsRef.current.length > 0 ? remoteStreamsRef.current[0].peerId : null;
      }
      return current;
    });

    // End capture immediately; do not allow a new capture to overtake sender cleanup.
    const detached = peerManagerRef.current?.detachLocalStream() ?? Promise.resolve();
    void detached.catch(() => {
      if (generation === captureGenerationRef.current) setErrorMessage('A captura foi encerrada; houve falha ao limpar a conexão.');
    }).finally(() => {
      if (generation === captureGenerationRef.current) transition('idle');
    });
    loggerRef.current?.log('screen-stopped');
  }, [annotations, stageSelectionPublisher]);

  const startSharing = useCallback(async () => {
    if (captureStateRef.current !== 'idle') return;
    setQualityNotice(null);
    transition('requesting');
    const generation = ++captureGenerationRef.current;
    const requestedAt = performance.now();
    setErrorMessage(null);
    try {
      loggerRef.current?.log('screen-capture-request', { quality: JSON.stringify(qualityRef.current) });
      const stream = await captureDisplayMedia(qualityRef.current, captured => {
        if (generation !== captureGenerationRef.current) stopAllTracks(captured);
        else localStreamRef.current = captured;
      });
      if (generation !== captureGenerationRef.current) { stopAllTracks(stream); return; }
      localStreamRef.current = stream;
      const applied = await applyCaptureQuality(stream.getVideoTracks()[0], qualityRef.current);
      if (generation !== captureGenerationRef.current) { stopAllTracks(stream); return; }
      if (!stream.getVideoTracks().some(track => track.readyState === 'live')) { stopAllTracks(stream); throw new Error('Captura sem vídeo disponível.'); }
      if (!applied) setQualityNotice('O navegador não aplicou todos os limites. Confira a captura observada; você pode continuar ou escolher outro perfil.');
      transition('preview');
      localStreamRef.current = stream;
      setLocalStream(stream);

      const hasAudio = stream.getAudioTracks().length > 0;
      setHasAudioTrack(hasAudio);
      setIsAudioMuted(false);

      loggerRef.current?.log('screen-captured', {
        requested: JSON.stringify(qualityRef.current),
        settings: JSON.stringify(stream.getVideoTracks()[0]?.getSettings?.() ?? {}),
        contentHint: stream.getVideoTracks()[0]?.contentHint,
        captureDurationMs: Math.round(performance.now() - requestedAt),
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      });

      // Listen for browser native stop button
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const handler = () => { if (localStreamRef.current === stream && !switchRef.current) stopSharing(); };
        endedHandlerRef.current = { track: videoTrack, handler };
        videoTrack.addEventListener('ended', handler, { once: true });
      }
    } catch (err: any) {
      if (generation !== captureGenerationRef.current) return;
      if (localStreamRef.current) stopSharing();
      else transition('idle');
      const msg = formatSharingErrorMessage(err);
      setErrorMessage(msg);
      showToast(msg);
      loggerRef.current?.log('screen-capture-error', { error: err?.name, message: err?.message });
    }
  }, [stopSharing, showToast]);

  const publishCapture = useCallback(async () => {
    const state = captureStateRef.current;
    const stream = localStreamRef.current;
    if (qualityOperationRef.current || !stream || (state !== 'preview' && state !== 'paused')) return;
    if (!stream.getVideoTracks().some(track => track.readyState === 'live')) { stopSharing(); return; }
    const generation = captureGenerationRef.current;
    transition(state === 'preview' ? 'publishing' : 'resuming');
    if (state === 'preview') {
      // Preview must not reserve the spotlight before publication is confirmed.
      setFeaturedStreamId((current) => current || 'local');
      sharingIdRef.current = crypto.randomUUID();
      pointingEnabledRef.current = true;
      setPointingEnabled(true);
      drawingEnabledRef.current = false;
      setDrawingEnabled(false);
      annotations.setCapture(localPeerRef.current, sharingIdRef.current);
      signalingRef.current?.updateSharing({ active: true, paused: false, streamId: sharingIdRef.current, pointingEnabled: pointingEnabledRef.current, drawingEnabled: false, hasAudio: stream.getAudioTracks().length > 0, audioMuted: stream.getAudioTracks().some(track => !track.enabled) });
    }
    try {
      await peerManagerRef.current?.attachLocalStream(stream);
      if (generation !== captureGenerationRef.current || localStreamRef.current !== stream) return;
      transition('sharing');
      sharingIdRef.current ||= crypto.randomUUID();
      setIsSharing(true);
      signalingRef.current?.updateSharing({ active: true, paused: false, streamId: sharingIdRef.current, pointingEnabled: pointingEnabledRef.current, drawingEnabled: drawingEnabledRef.current, hasAudio: stream.getAudioTracks().length > 0, audioMuted: stream.getAudioTracks().some(track => !track.enabled) });
      if (state === 'preview') {
        const stageId = featuredStreamIdRef.current;
        const targetPeerId = !stageId || stageId === 'local' ? localPeerRef.current : stageId;
        stageSelectionPublisher.select(targetPeerId);
      }
    } catch {
      if (generation !== captureGenerationRef.current) return;
      stopSharing();
      setErrorMessage('Não foi possível publicar a captura. Compartilhamento encerrado.');
    }
  }, [stopSharing, annotations, stageSelectionPublisher]);

  const pauseSharing = useCallback(async () => {
    if (!['sharing', 'publishing', 'resuming'].includes(captureStateRef.current)) return;
    const generation = ++captureGenerationRef.current;
    transition('pausing');
    try {
      await peerManagerRef.current?.detachLocalStream();
      if (generation !== captureGenerationRef.current) return;
      transition('paused');
      setIsSharing(true);
      sharingIdRef.current ||= crypto.randomUUID();
      const stream = localStreamRef.current;
      signalingRef.current?.updateSharing({ active: true, paused: true, streamId: sharingIdRef.current, pointingEnabled: pointingEnabledRef.current, drawingEnabled: drawingEnabledRef.current, hasAudio: Boolean(stream?.getAudioTracks().length), audioMuted: stream?.getAudioTracks().some(track => !track.enabled) || false });
    } catch {
      if (generation !== captureGenerationRef.current) return;
      stopSharing();
      setErrorMessage('Falha ao pausar. A captura foi encerrada por segurança.');
    }
  }, [stopSharing]);

  const cancelSwitch = useCallback(async () => {
    const change = switchRef.current;
    if (!change || captureStateRef.current === 'switch-restoring') return;
    // Once publication starts, cancellation means stop: never restore over an in-flight attach.
    if (captureStateRef.current === 'switch-publishing') { stopSharing(); return; }
    const generation = ++captureGenerationRef.current;
    transition('switch-restoring');
    change.removePendingListener?.();
    stopAllTracks(change.pending);
    change.pending = null;
    setPendingStream(null);
    if (!await change.detached || generation !== captureGenerationRef.current) return;
    const stream = change.previous;
    if (!stream.getVideoTracks().some(track => track.readyState === 'live')) {
      stopSharing();
      setErrorMessage('A origem anterior foi encerrada. Compartilhe uma tela novamente.');
      return;
    }
    for (const [track, enabled] of change.enabled) if (track.readyState === 'live') track.enabled = enabled;
    try {
      if (!change.wasPaused) await peerManagerRef.current?.attachLocalStream(stream);
      if (generation !== captureGenerationRef.current) return;
      if (!stream.getVideoTracks().some(track => track.readyState === 'live')) { stopSharing(); return; }
      switchRef.current = null;
      transition(change.wasPaused ? 'paused' : 'sharing');
      signalingRef.current?.updateSharing({ active: true, paused: change.wasPaused, streamId: sharingIdRef.current, pointingEnabled: pointingEnabledRef.current, hasAudio: stream.getAudioTracks().some(track => track.readyState === 'live'), audioMuted: change.muted });
    } catch {
      if (generation !== captureGenerationRef.current) return;
      stopSharing();
      setErrorMessage('Falha ao restaurar a origem anterior. Compartilhamento encerrado por segurança.');
    }
  }, [stopSharing]);

  const switchCapture = useCallback(async () => {
    const state = captureStateRef.current;
    const previous = localStreamRef.current;
    if (!previous || (state !== 'sharing' && state !== 'paused')) return;
    const generation = ++captureGenerationRef.current;
    const change: CaptureSwitch = {
      previous, wasPaused: state === 'paused', muted: isAudioMuted,
      enabled: new Map(previous.getTracks().map(track => [track, track.enabled])),
      detached: Promise.resolve(false), pending: null,
    };
    switchRef.current = change;
    transition('switch-requesting');
    setErrorMessage(null);
    // Synchronous suppression protects both kinds while replaceTrack(null) is pending.
    for (const track of previous.getTracks()) track.enabled = false;
    change.detached = (peerManagerRef.current?.detachLocalStream() ?? Promise.resolve()).then(() => true, () => {
      if (switchRef.current === change) {
        stopSharing();
        setErrorMessage('Falha ao suspender a transmissão. Capturas encerradas por segurança.');
      }
      return false;
    });
    // No await before this call: preserve the click's transient user activation.
    const selection = captureDisplayMedia(qualityRef.current, captured => {
      if (generation !== captureGenerationRef.current) stopAllTracks(captured);
      else change.pending = captured;
    });
    signalingRef.current?.updateSharing({ active: true, paused: true, streamId: sharingIdRef.current, pointingEnabled: pointingEnabledRef.current, hasAudio: previous.getAudioTracks().length > 0, audioMuted: change.muted });
    try {
      const stream = await selection;
      if (generation !== captureGenerationRef.current) { stopAllTracks(stream); return; }
      change.pending = stream;
      await applyCaptureQuality(stream.getVideoTracks()[0], qualityRef.current);
      if (generation !== captureGenerationRef.current) { stopAllTracks(stream); return; }
      change.pending = stream;
      const video = stream.getVideoTracks()[0];
      if (!video || video.readyState !== 'live') throw new Error('Captura sem vídeo disponível.');
      setStreamAudioMuted(stream, change.muted);
      const ended = () => { if (switchRef.current === change) void cancelSwitch(); };
      video.addEventListener('ended', ended, { once: true });
      change.removePendingListener = () => video.removeEventListener('ended', ended);
      if (!await change.detached || generation !== captureGenerationRef.current) return;
      setPendingStream(stream);
      transition('switch-preview');
    } catch (error) {
      if (generation !== captureGenerationRef.current) return;
      setErrorMessage(formatSharingErrorMessage(error));
      await cancelSwitch();
    }
  }, [isAudioMuted, cancelSwitch, stopSharing]);

  const confirmSwitch = useCallback(async () => {
    const change = switchRef.current;
    const stream = change?.pending;
    if (qualityOperationRef.current || !change || !stream || captureStateRef.current !== 'switch-preview') return;
    if (!stream.getVideoTracks().some(track => track.readyState === 'live')) { void cancelSwitch(); return; }
    const generation = captureGenerationRef.current;
    transition('switch-publishing');
    try {
      await peerManagerRef.current?.attachLocalStream(stream);
      if (generation !== captureGenerationRef.current) return;
      if (!stream.getVideoTracks().some(track => track.readyState === 'live')) { stopSharing(); return; }
      if (endedHandlerRef.current) {
        const { track, handler } = endedHandlerRef.current;
        track.removeEventListener('ended', handler);
      }
      change.removePendingListener?.();
      const track = stream.getVideoTracks()[0];
      const handler = () => { if (localStreamRef.current === stream && !switchRef.current) stopSharing(); };
      track.addEventListener('ended', handler, { once: true });
      endedHandlerRef.current = { track, handler };
      localStreamRef.current = stream;
      setLocalStream(stream);
      stopAllTracks(change.previous);
      switchRef.current = null;
      setPendingStream(null);
      setHasAudioTrack(stream.getAudioTracks().some(track => track.readyState === 'live'));
      setIsAudioMuted(change.muted);
      sharingIdRef.current = crypto.randomUUID();
      pointingEnabledRef.current = true;
      setPointingEnabled(true);
      drawingEnabledRef.current = false;
      setDrawingEnabled(false);
      annotations.setCapture(localPeerRef.current, sharingIdRef.current);
      transition('sharing');
      signalingRef.current?.updateSharing({ active: true, paused: false, streamId: sharingIdRef.current, pointingEnabled: true, drawingEnabled: false, hasAudio: stream.getAudioTracks().some(track => track.readyState === 'live'), audioMuted: change.muted });
    } catch {
      if (generation !== captureGenerationRef.current) return;
      stopSharing();
      setErrorMessage('Falha ao publicar a nova origem. Compartilhamento encerrado por segurança.');
    }
  }, [cancelSwitch, stopSharing, annotations]);

  const selectFeaturedStream = useCallback((streamId: string) => {
    // Only this explicit UI action publishes a choice. Remote follow and automatic fallback
    // call setFeaturedStreamId directly, so following another presenter cannot create a relay chain.
    if (streamId === featuredStreamIdRef.current) return;
    // Demo streams are supplied by the route while the real room session is disabled.
    if (!enabled) {
      featuredStreamIdRef.current = streamId;
      setFeaturedStreamId(streamId);
      return;
    }
    const targetPeerId = streamId === 'local' ? localPeerRef.current : streamId;
    if (streamId !== 'local' && !participantsRef.current.some(p => p.peerId === streamId && p.isSharing)) return;
    if (streamId === 'local' && !sharingIdRef.current) return;
    dispatchFollow({ type: 'manual-select' });
    featuredStreamIdRef.current = streamId;
    setFeaturedStreamId(streamId);
    stageSelectionPublisher.select(targetPeerId);
  }, [enabled, stageSelectionPublisher]);

  const updateNickname = useCallback(
    (nickname: string) => {
      const trimmed = nickname.trim().slice(0, 32);
      if (trimmed === (currentNickname || '')) {
        return;
      }
      nicknameRef.current = trimmed || undefined;
      setCurrentNickname(trimmed);
      if (typeof window !== 'undefined') {
        if (trimmed) {
          sessionStorage.setItem('screen_room_display_name', trimmed);
        } else {
          sessionStorage.removeItem('screen_room_display_name');
        }
      }
      setParticipants((prev) =>
        prev.map((p) => (p.isLocal ? { ...p, nickname: trimmed || undefined } : p))
      );
      signalingRef.current?.updateNickname(trimmed);
      loggerRef.current?.log('nickname-updated', { nickname: trimmed || 'Visitor' });
      if (trimmed) {
        showToast(`Seu nickname foi alterado para ${trimmed}.`);
      } else {
        showToast('Nickname removido. Você está identificado como visitante.');
      }
    },
    [currentNickname, showToast]
  );

  useEffect(() => {
    const nickname = displayName?.trim() || undefined;
    if (nicknameRef.current === nickname) return;
    nicknameRef.current = nickname;
    signalingRef.current?.updateNickname(nickname || '');
    setParticipants((prev) => prev.map((p) => p.isLocal ? { ...p, nickname } : p));
  }, [displayName]);

  const participantsWithSharing = useMemo(() => {
    return participants.map((p) => ({
      ...p,
      streamId: p.isLocal ? sharingIdRef.current : p.streamId,
      pointingEnabled: p.isLocal ? pointingEnabled : p.pointingEnabled,
      drawingEnabled: p.isLocal ? drawingEnabled : p.drawingEnabled,
      isPaused: p.isLocal ? captureState !== 'sharing' : p.isPaused,
      isSharing: p.isLocal
        ? isSharing
        : p.isSharing || remoteStreams.some((r) => r.peerId === p.peerId),
    }));
  }, [participants, isSharing, remoteStreams, captureState, pointingEnabled, drawingEnabled]);

  // Applies the followed presenter's selection (or, once, their own stream) to the local highlight.
  useEffect(() => {
    const target = followTarget(follow, {
      localPeerId: localPeerRef.current,
      isSharing: (peerId) => peerId === localPeerRef.current
        ? isSharing
        : participantsWithSharing.some((p) => p.peerId === peerId && p.isSharing),
    });
    if (!target) return;
    if (target.consumesFallback) dispatchFollow({ type: 'fallback-done' });
    if (featuredStreamId !== target.stageId) setFeaturedStreamId(target.stageId);
  }, [follow, participantsWithSharing, isSharing, featuredStreamId]);

  const followPresenter = useCallback((presenterId: string) => {
    if (presenterId === localPeerRef.current) return;
    dispatchFollow({ type: 'follow', presenterId });
  }, []);
  const resumeFollowing = useCallback(() => dispatchFollow({ type: 'resume' }), []);
  const stopFollowing = useCallback(() => dispatchFollow({ type: 'stop' }), []);

  const togglePointingPermission = useCallback(() => {
    if (!sharingIdRef.current || switchRef.current) return;
    const nextEnabled = !pointingEnabledRef.current;
    pointingEnabledRef.current = nextEnabled;
    setPointingEnabled(nextEnabled);
    if (!nextEnabled) annotations.clearPointers(localPeerRef.current);
    const stream = localStreamRef.current;
    signalingRef.current?.updateSharing({
      active: true,
      paused: captureStateRef.current !== 'sharing',
      streamId: sharingIdRef.current,
      pointingEnabled: nextEnabled,
      drawingEnabled: drawingEnabledRef.current,
      hasAudio: Boolean(stream?.getAudioTracks().length),
      audioMuted: stream?.getAudioTracks().some((track) => !track.enabled) || false,
    });
    loggerRef.current?.log('pointing-permission', { enabled: nextEnabled });
    showToast(nextEnabled ? 'Apontamentos rápidos ativados.' : 'Apontamentos rápidos desativados.');
  }, [annotations, showToast]);

  const toggleDrawingPermission = useCallback(() => {
    if (!sharingIdRef.current || switchRef.current) return;
    const nextEnabled = !drawingEnabledRef.current;
    drawingEnabledRef.current = nextEnabled;
    setDrawingEnabled(nextEnabled);
    if (!nextEnabled) annotations.clearCollaborativeDrawings(localPeerRef.current);
    const stream = localStreamRef.current;
    signalingRef.current?.updateSharing({
      active: true,
      paused: captureStateRef.current !== 'sharing',
      streamId: sharingIdRef.current,
      pointingEnabled: pointingEnabledRef.current,
      drawingEnabled: nextEnabled,
      hasAudio: Boolean(stream?.getAudioTracks().length),
      audioMuted: stream?.getAudioTracks().some((track) => !track.enabled) || false,
    });
    loggerRef.current?.log('drawing-permission', { enabled: nextEnabled });
    showToast(nextEnabled ? 'Desenho colaborativo ativado.' : 'Desenho colaborativo desativado.');
  }, [annotations, showToast]);

  const clearCollaborativeDrawings = useCallback(() => {
    if (!sharingIdRef.current || switchRef.current) return;
    annotations.clearCollaborativeDrawings(localPeerRef.current);
    const outgoing = {
      type: 'clear-collaborative-drawings' as const,
      streamId: sharingIdRef.current,
      eventId: crypto.randomUUID(),
      seq: ++clearCollaborativeSeqRef.current,
    };
    signalingRef.current?.send(outgoing);
    showToast('Desenhos dos espectadores limpos.');
  }, [annotations, showToast]);

  const toggleAudioMute = useCallback(() => {
    if (!localStreamRef.current || switchRef.current) return;
    const nextMuted = !isAudioMuted;
    setStreamAudioMuted(localStreamRef.current, nextMuted);
    setIsAudioMuted(nextMuted);
    if (sharingIdRef.current) signalingRef.current?.updateSharing({ active: true, paused: captureStateRef.current !== 'sharing', streamId: sharingIdRef.current, pointingEnabled: pointingEnabledRef.current, drawingEnabled: drawingEnabledRef.current, hasAudio: true, audioMuted: nextMuted });
    loggerRef.current?.log('screen-audio', { muted: nextMuted });
    showToast(nextMuted ? 'Áudio da tela mutado.' : 'Áudio da tela reativado.');
  }, [isAudioMuted, showToast]);

  const changeQuality = useCallback(
    async (selection: QualitySelection) => {
      if (['publishing', 'resuming', 'switch-publishing', 'switch-restoring'].includes(captureStateRef.current)) return;
      const operation = {};
      const generation = captureGenerationRef.current;
      qualityOperationRef.current = operation;
      setQualityPending(true);
      setQualityNotice(null);
      const newQuality = normalizeQuality(selection);
      qualityRef.current = newQuality;
      setQuality(newQuality);
      const streams = new Set([localStreamRef.current, switchRef.current?.pending]);
      const senderUpdate = peerManagerRef.current?.applyQuality(newQuality).catch(() => false);
      const results = await Promise.all([...streams].filter(Boolean).map(stream =>
        applyCaptureQuality(stream!.getVideoTracks()[0], newQuality)));
      const verified = await senderUpdate;
      if (qualityOperationRef.current !== operation) return;
      qualityOperationRef.current = null;
      setQualityPending(false);
      if (generation !== captureGenerationRef.current || qualityRef.current !== newQuality) return;
      const profile = resolveQuality(newQuality);
      loggerRef.current?.log('quality-selection', { ...newQuality, verified: verified && results.every(Boolean), captures: JSON.stringify([...streams].filter(Boolean).map(stream => stream!.getVideoTracks()[0]?.getSettings?.() ?? {})) });
      setQualityNotice(verified !== false && results.every(Boolean) ? null : 'O navegador não aplicou todos os limites. Confira a captura observada; você pode continuar ou escolher outro perfil.');
      if (!['preview', 'switch-preview'].includes(captureStateRef.current)) showToast(verified !== false && results.every(Boolean)
        ? `Limites atualizados: ${profile.label}, ${newQuality.fps} FPS.`
        : `Selecionado: ${profile.label}, ${newQuality.fps} FPS. O navegador pode limitar a aplicação; consulte o diagnóstico.`);
    },
    [showToast],
  );

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const sendCollaboration = (event: CollaborationMessage): boolean => {
    if (!collaborationReadyRef.current || signalingRoomRef.current !== roomId) return false;
    if (event.type === 'point') {
      const target = participantsRef.current.find((p) => !p.isLocal && p.peerId === event.targetPeerId);
      if (!target?.isSharing || target.isPaused || target.streamId !== event.streamId || target.pointingEnabled === false) return false;
      const outgoing = { ...event, seq: ++pointingSeqRef.current };
      if (!signalingRef.current?.send(outgoing)) return false;
      annotations.apply(event.targetPeerId, {
        ...outgoing,
        senderPeerId: localPeerRef.current,
        ...(nicknameRef.current ? { senderNickname: nicknameRef.current } : {}),
      });
      return true;
    }
    if (event.type === 'spectator-drawing') {
      const target = participantsRef.current.find((p) => !p.isLocal && p.peerId === event.targetPeerId);
      if (!target?.isSharing || target.isPaused || target.streamId !== event.streamId || target.drawingEnabled !== true) return false;
      const outgoing = { ...event, seq: ++spectatorDrawingSeqRef.current };
      if (!signalingRef.current?.send(outgoing)) return false;
      annotations.apply(event.targetPeerId, {
        ...outgoing,
        senderPeerId: localPeerRef.current,
        ...(nicknameRef.current ? { senderNickname: nicknameRef.current } : {}),
      });
      return true;
    }
    if (event.type === 'clear-collaborative-drawings') {
      if (event.streamId !== sharingIdRef.current) return false;
      const outgoing = { ...event, seq: ++clearCollaborativeSeqRef.current };
      if (!signalingRef.current?.send(outgoing)) return false;
      annotations.apply(localPeerRef.current, outgoing);
      return true;
    }
    if (event.streamId !== sharingIdRef.current ||
        (event.type !== 'clear-annotations' && captureStateRef.current !== 'sharing')) return false;
    const outgoing = { ...event, seq: ++collaborationSeqRef.current };
    if (!signalingRef.current?.send(outgoing)) return false;
    annotations.apply(localPeerRef.current, outgoing);
    return true;
  };

  return {
    onVideoPresented: (peerId: string, stream: MediaStream) => {
      if (remoteStreams.some(entry => entry.peerId === peerId && entry.stream === stream)) {
        loggerRef.current?.log('first-frame-presented', { peer: peerId, stream: stream.id, evidence: 'video-frame-callback' });
      }
    },
    annotations, sendCollaboration,
    collaborationAvailable: connectionStatus === 'connected' && collaborationReadyRef.current,
    pointingEnabled,
    togglePointingPermission,
    drawingEnabled,
    toggleDrawingPermission,
    clearCollaborativeDrawings,
    chatMessages: interactions.messages,
    reactions: interactions.reactions,
    interactionError: interactions.error,
    chatPending: interactions.pending,
    sendChat: (text: string) => interactions.sendChat(signalingRoomRef.current === roomId ? signalingRef.current : null, text),
    sendReaction: (reaction: Reaction) => interactions.sendReaction(signalingRoomRef.current === roomId ? signalingRef.current : null, reaction),
    questions: interactions.questions,
    highlightedQuestionId: interactions.highlightedQuestionId,
    qaError: interactions.qaError,
    qaPending: interactions.qaPending,
    qaSubmitPending: interactions.qaSubmitPending,
    submitQuestion: (text: string) => interactions.submitQuestion(signalingRoomRef.current === roomId ? signalingRef.current : null, text),
    withdrawQuestion: (questionId: string) => interactions.withdrawQuestion(signalingRoomRef.current === roomId ? signalingRef.current : null, questionId),
    answerQuestionText: (questionId: string, answerText: string) =>
      interactions.answerQuestionText(signalingRoomRef.current === roomId ? signalingRef.current : null, questionId, answerText),
    updateQuestionStatus: (questionId: string, action: 'answer-verbal' | 'reopen' | 'highlight' | 'unhighlight') =>
      interactions.updateQuestionStatus(signalingRoomRef.current === roomId ? signalingRef.current : null, questionId, action),
    captureState,
    pendingStream,
    switchCapture,
    cancelSwitch,
    confirmSwitch,
    publishCapture,
    pauseSharing,
    remoteConnectionStates,
    retryPeer: (id: string) => peerManagerRef.current?.recoverPeer(id),
    connectionStatus,
    participantCount,
    participants: participantsWithSharing.map(p => ({ ...p, handOrder: interactions.hands.find(h => h.peerId === p.peerId)?.order ?? null })),
    handReady: interactions.hands.some(h => h.peerId === localPeerRef.current),
    toggleHand: () => interactions.toggleHand(signalingRoomRef.current === roomId ? signalingRef.current : null, localPeerRef.current),
    localStream,
    isSharing,
    isAudioMuted,
    hasAudioTrack,
    remoteStreams,
    featuredStreamId,
    selectFeaturedStream,
    followPresenterId: follow.presenterId,
    followStatus: followDisplayStatus(follow, {
      localPeerId: localPeerRef.current,
      isSharing: (id) => {
        if (id === localPeerRef.current) return isSharing && Boolean(localStream?.getVideoTracks().some(track => track.readyState === 'live'));
        const participant = participantsWithSharing.find(p => p.peerId === id);
        return Boolean(participant?.isSharing && (participant.isPaused || remoteStreams.some(entry =>
          entry.peerId === id && entry.stream.getVideoTracks().some(track => track.readyState === 'live'))));
      },
    }, connectionStatus === 'connected' && collaborationReadyRef.current),
    followPresenter,
    resumeFollowing,
    stopFollowing,
    updateNickname,
    currentNickname,
    quality,
    qualityPending,
    qualityNotice,
    networkStats,
    diagnostics,
    errorMessage,
    toastMessage,
    startSharing,
    stopSharing,
    toggleAudioMute,
    changeQuality,
    clearError,
  };
}
