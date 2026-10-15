import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  type QualityProfileKey,
  QUALITY_PROFILES,
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
  formatSharingErrorMessage,
  setStreamAudioMuted,
  stopAllTracks,
} from '../media/display-media';

type CaptureState = 'idle' | 'requesting' | 'preview' | 'publishing' | 'sharing' | 'pausing' | 'paused' | 'resuming' | 'stopping';

export interface UseRoomSessionOptions {
  roomId: string;
  displayName?: string;
  enabled?: boolean;
}

export function useRoomSession({ roomId, displayName, enabled = true }: UseRoomSessionOptions) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('connecting');
  const [participantCount, setParticipantCount] = useState<number>(1);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [hasAudioTrack, setHasAudioTrack] = useState<boolean>(false);
  const [remoteConnectionStates, setRemoteConnectionStates] = useState<Record<string, RTCPeerConnectionState>>({});
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamEntry[]>([]);
  const [quality, setQuality] = useState<QualityProfileKey>('balanced');
  const [networkStats, setNetworkStats] = useState<NetworkMetrics | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [featuredStreamId, setFeaturedStreamId] = useState<string | null>(null);
  const [currentNickname, setCurrentNickname] = useState<string>('');

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
  const sharingIdRef = useRef<string | undefined>(undefined);
  const loggerRef = useRef<DiagnosticsLogger | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerManagerRef = useRef<PeerManager | null>(null);
  const statsCollectorRef = useRef<StatsCollector | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const qualityRef = useRef<QualityProfileKey>('balanced');
  const remoteStreamsRef = useRef<RemoteStreamEntry[]>([]);
  const nicknameRef = useRef<string | undefined>(displayName?.trim() || undefined);
  const reconnectTokenRef = useRef<string | undefined>(undefined);

  qualityRef.current = quality;
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
    const initialNick = nicknameRef.current;
    logger.log('session-init', { roomId, peerId, displayName: initialNick || 'Anonymous' });

    setRemoteConnectionStates({});
    setFeaturedStreamId(null);
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
        if (curQuality === 'economy') return;
        const nextQuality: QualityProfileKey = curQuality === 'high' ? 'balanced' : 'economy';
        logger.log('quality-downgrade', { from: curQuality, to: nextQuality, loss: lossPercent });
        setQuality(nextQuality);
        peerManager.applyQuality(nextQuality);
        showToast('Rede instável: qualidade de transmissão reduzida automaticamente.');
      },
      logger,
    });
    statsCollectorRef.current = statsCollector;

    // Create SignalingClient
    const signaling = new SignalingClient({
      onStateChange: (state) => {
        if (isDisposed) return;
        setConnectionStatus(state);
        if (state === 'disconnected') peerManager.closeAll();
        if (state === 'connected') {
          signaling.join(roomId, peerId, nicknameRef.current, reconnectTokenRef.current);
        }
      },
      onMessage: (message) => {
        if (isDisposed) return;
        if (message.type === 'peers') {
          if (message.reconnectToken) {
            reconnectTokenRef.current = message.reconnectToken;
          }
          peerManager.setParticipants((message.participants?.map((p) => p.peerId) || message.peers).filter((id) => id !== peerId));
          for (const p of message.participants || []) if (p.peerId !== peerId && p.sharing) peerManager.setRemoteSharing(p.peerId, p.sharing.active);
          signaling.updateSharing({ active: Boolean(sharingIdRef.current), paused: Boolean(sharingIdRef.current) && captureStateRef.current !== 'sharing', streamId: sharingIdRef.current, hasAudio: Boolean(localStreamRef.current?.getAudioTracks().length), audioMuted: localStreamRef.current?.getAudioTracks().some((track) => !track.enabled) || false });
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

        } else if (message.type === 'peer-joined') {
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
          peerManager.setRemoteSharing(message.peerId, message.active);
          setParticipants((prev) => prev.map((p) => p.peerId === message.peerId ? { ...p, isSharing: message.active, isPaused: Boolean(message.paused) } : p));
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
      captureGenerationRef.current++;
      if (endedHandlerRef.current) {
        const { track, handler } = endedHandlerRef.current;
        track.removeEventListener('ended', handler);
        endedHandlerRef.current = null;
      }
      transition('idle');
      sharingIdRef.current = undefined;
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
  }, [roomId, showToast, enabled]);

  const stopSharing = useCallback(() => {
    const generation = ++captureGenerationRef.current;
    if (endedHandlerRef.current) {
      const { track, handler } = endedHandlerRef.current;
      track.removeEventListener('ended', handler);
      endedHandlerRef.current = null;
    }
    transition('stopping');
    signalingRef.current?.updateSharing({ active: false, hasAudio: false, audioMuted: false });
    sharingIdRef.current = undefined;
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
  }, []);

  const startSharing = useCallback(async () => {
    if (captureStateRef.current !== 'idle') return;
    transition('requesting');
    const generation = ++captureGenerationRef.current;
    const requestedAt = performance.now();
    setErrorMessage(null);
    try {
      loggerRef.current?.log('screen-capture-request', { quality: qualityRef.current });
      const stream = await captureDisplayMedia(qualityRef.current);
      if (generation !== captureGenerationRef.current) { stopAllTracks(stream); return; }
      if (!stream.getVideoTracks().some(track => track.readyState === 'live')) { stopAllTracks(stream); throw new Error('Captura sem vídeo disponível.'); }
      transition('preview');
      localStreamRef.current = stream;
      setLocalStream(stream);

      const hasAudio = stream.getAudioTracks().length > 0;
      setHasAudioTrack(hasAudio);
      setIsAudioMuted(false);

      loggerRef.current?.log('screen-captured', {
        captureDurationMs: Math.round(performance.now() - requestedAt),
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      });

      // Listen for browser native stop button
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const handler = () => { if (localStreamRef.current === stream) stopSharing(); };
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
    if (!stream || (state !== 'preview' && state !== 'paused')) return;
    if (!stream.getVideoTracks().some(track => track.readyState === 'live')) { stopSharing(); return; }
    const generation = captureGenerationRef.current;
    transition(state === 'preview' ? 'publishing' : 'resuming');
    if (state === 'preview') {
      // Preview must not reserve the spotlight before publication is confirmed.
      setFeaturedStreamId((current) => current || 'local');
      sharingIdRef.current = crypto.randomUUID();
      signalingRef.current?.updateSharing({ active: true, paused: false, streamId: sharingIdRef.current, hasAudio: stream.getAudioTracks().length > 0, audioMuted: stream.getAudioTracks().some(track => !track.enabled) });
    }
    try {
      await peerManagerRef.current?.attachLocalStream(stream);
      if (generation !== captureGenerationRef.current || localStreamRef.current !== stream) return;
      transition('sharing');
      sharingIdRef.current ||= crypto.randomUUID();
      setIsSharing(true);
      signalingRef.current?.updateSharing({ active: true, paused: false, streamId: sharingIdRef.current, hasAudio: stream.getAudioTracks().length > 0, audioMuted: stream.getAudioTracks().some(track => !track.enabled) });
    } catch {
      if (generation !== captureGenerationRef.current) return;
      stopSharing();
      setErrorMessage('Não foi possível publicar a captura. Compartilhamento encerrado.');
    }
  }, [stopSharing]);

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
      signalingRef.current?.updateSharing({ active: true, paused: true, streamId: sharingIdRef.current, hasAudio: Boolean(stream?.getAudioTracks().length), audioMuted: stream?.getAudioTracks().some(track => !track.enabled) || false });
    } catch {
      if (generation !== captureGenerationRef.current) return;
      stopSharing();
      setErrorMessage('Falha ao pausar. A captura foi encerrada por segurança.');
    }
  }, [stopSharing]);

  const selectFeaturedStream = useCallback((streamId: string) => {
    setFeaturedStreamId(streamId);
  }, []);

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
      isPaused: p.isLocal ? captureState !== 'sharing' : p.isPaused,
      isSharing: p.isLocal
        ? isSharing
        : p.isSharing || remoteStreams.some((r) => r.peerId === p.peerId),
    }));
  }, [participants, isSharing, remoteStreams, captureState]);

  const toggleAudioMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const nextMuted = !isAudioMuted;
    setStreamAudioMuted(localStreamRef.current, nextMuted);
    setIsAudioMuted(nextMuted);
    if (sharingIdRef.current) signalingRef.current?.updateSharing({ active: true, paused: captureStateRef.current !== 'sharing', streamId: sharingIdRef.current, hasAudio: true, audioMuted: nextMuted });
    loggerRef.current?.log('screen-audio', { muted: nextMuted });
    showToast(nextMuted ? 'Áudio da tela mutado.' : 'Áudio da tela reativado.');
  }, [isAudioMuted, showToast]);

  const changeQuality = useCallback(
    async (newQuality: QualityProfileKey) => {
      setQuality(newQuality);
      if (peerManagerRef.current) {
        await peerManagerRef.current.applyQuality(newQuality);
      }
      const profile = QUALITY_PROFILES[newQuality];
      showToast(`Qualidade alterada para ${profile.label}.`);
    },
    [showToast],
  );

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    captureState,
    publishCapture,
    pauseSharing,
    remoteConnectionStates,
    retryPeer: (id: string) => peerManagerRef.current?.recoverPeer(id),
    connectionStatus,
    participantCount,
    participants: participantsWithSharing,
    localStream,
    isSharing,
    isAudioMuted,
    hasAudioTrack,
    remoteStreams,
    featuredStreamId,
    selectFeaturedStream,
    updateNickname,
    currentNickname,
    quality,
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
