import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  type QualityProfileKey,
  isOfferSignal,
  isAnswerSignal,
  isIceSignal,
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

  const loggerRef = useRef<DiagnosticsLogger | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerManagerRef = useRef<PeerManager | null>(null);
  const statsCollectorRef = useRef<StatsCollector | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const qualityRef = useRef<QualityProfileKey>('balanced');
  const remoteStreamsRef = useRef<RemoteStreamEntry[]>([]);
  const nicknameRef = useRef<string | undefined>(displayName?.trim() || undefined);
  const reconnectTokenRef = useRef<string | undefined>(undefined);

  localStreamRef.current = localStream;
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
    const initialNick = displayName?.trim() || undefined;
    logger.log('session-init', { roomId, peerId, displayName: initialNick || 'Anonymous' });

    setParticipants([
      {
        peerId,
        nickname: initialNick,
        isLocal: true,
        isSharing: false,
      },
    ]);

    let isDisposed = false;

    // Create PeerManager
    const peerManager = new PeerManager({
      rtcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      onSendSignal: (target, data) => {
        signalingRef.current?.relaySignal(target, data);
      },
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
                isSharing: false,
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

          // Recover WebRTC screen share negotiation upon reconnect
          if (localStreamRef.current) {
            const targetPeers = message.participants
              ? message.participants.map((p) => p.peerId).filter((id) => id !== peerId)
              : (message.peers || []).filter((id) => id !== peerId);

            targetPeers.forEach((targetId) => {
              peerManager.createAndSendOffer(targetId).catch((err) => {
                logger.log('offer-error', { peer: targetId, message: err?.message });
              });
            });
          }
        } else if (message.type === 'peer-joined') {
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

          if (localStreamRef.current) {
            peerManager.createAndSendOffer(message.peerId).catch((err) => {
              logger.log('offer-error', { peer: message.peerId, message: err?.message });
            });
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
        } else if (message.type === 'signal') {
          const { from, data } = message;
          if (isOfferSignal(data)) {
            peerManager.handleOffer(from, data.sdp as RTCSessionDescriptionInit);
          } else if (isAnswerSignal(data)) {
            peerManager.handleAnswer(from, data.sdp as RTCSessionDescriptionInit);
          } else if (isIceSignal(data)) {
            peerManager.handleRemoteIce(from, data.candidate as RTCIceCandidateInit);
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
    fetchIceConfiguration(undefined, logger).then((config) => {
      if (!isDisposed) {
        peerManager.setRtcConfig(config);
      }
    });

    // Start signaling connection
    signaling.connect();

    return () => {
      isDisposed = true;
      reconnectTokenRef.current = undefined;
      unsubscribeLogger();
      stopAllTracks(localStreamRef.current);
      statsCollector.stop();
      peerManager.closeAll();
      signaling.disconnect();
    };
  }, [roomId, displayName, showToast, enabled]);

  const stopSharing = useCallback(() => {
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

    peerManagerRef.current?.detachLocalStream().catch(console.error);
    statsCollectorRef.current?.stop();
    loggerRef.current?.log('screen-stopped');
  }, []);

  const startSharing = useCallback(async () => {
    setErrorMessage(null);
    try {
      loggerRef.current?.log('screen-capture-request', { quality: qualityRef.current });
      const stream = await captureDisplayMedia(qualityRef.current);
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsSharing(true);

      // Preserve existing spotlight if another participant is already presenting;
      // otherwise, feature the newly started local stream.
      setFeaturedStreamId((current) => current || 'local');

      const hasAudio = stream.getAudioTracks().length > 0;
      setHasAudioTrack(hasAudio);
      setIsAudioMuted(false);

      loggerRef.current?.log('screen-captured', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      });

      // Listen for browser native stop button
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          stopSharing();
        });
      }

      // Attach to peer manager and start stats
      if (peerManagerRef.current) {
        await peerManagerRef.current.attachLocalStream(stream);
      }
      statsCollectorRef.current?.start();

      showToast(
        hasAudio
          ? 'Compartilhando tela com áudio.'
          : 'Compartilhando somente tela. Para áudio, escolha uma aba com som.',
      );
    } catch (err: any) {
      const msg = formatSharingErrorMessage(err);
      setErrorMessage(msg);
      showToast(msg);
      loggerRef.current?.log('screen-capture-error', { error: err?.name, message: err?.message });
    }
  }, [stopSharing, showToast]);

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

  const participantsWithSharing = useMemo(() => {
    return participants.map((p) => ({
      ...p,
      isSharing: p.isLocal
        ? isSharing
        : remoteStreams.some((r) => r.peerId === p.peerId),
    }));
  }, [participants, isSharing, remoteStreams]);

  const toggleAudioMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const nextMuted = !isAudioMuted;
    setStreamAudioMuted(localStreamRef.current, nextMuted);
    setIsAudioMuted(nextMuted);
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
