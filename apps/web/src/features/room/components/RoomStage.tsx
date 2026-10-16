import { COLLABORATION_LIMITS } from '@screen-room/protocol';
import { AnnotationOverlay, type AnnotationChannel, type AnnotationTool } from './AnnotationOverlay';
import React, { useRef, useState, useEffect } from 'react';
import {
  Box,
  Text,
  Button,
  UnstyledButton,
  Tooltip,
} from '@mantine/core';
import type { RemoteStreamEntry, RoomParticipant } from '../types';
import { usePictureInPicture } from '../hooks/usePictureInPicture';
import { useVideoZoom } from '../hooks/useVideoZoom';
import { useMediaStreamVideo } from '../hooks/useMediaStreamVideo';
import {
  formatDisplayName,
  getAvatarColor,
  getInitials,
} from '../utils/avatar';
import {
  IconScreen,
  IconCinema,
  IconPictureInPicture,
  IconPlus,
  IconMinus,
  IconReset,
  IconMaximize,
  IconMinimize,
  IconSignal,
  IconLink,
} from './Icons';

export interface RoomStageProps {
  annotations?: AnnotationChannel;
  onTogglePointingPermission?: () => void;
  interactions?: React.ReactNode;
  /** Acesso contextual às interações quando o header está oculto (Cinema ou tela cheia). */
  interactionAccess?: React.ReactNode;
  isCinema?: boolean;
  onToggleCinema?: () => void;
  remoteConnectionStates?: Record<string, RTCPeerConnectionState>;
  onRetryPeer?: (peerId: string) => void;
  localStream: MediaStream | null;
  isSharing: boolean;
  remoteStreams: RemoteStreamEntry[];
  featuredStreamId: string | null;
  onSelectFeaturedStream: (streamId: string) => void;
  participants: RoomParticipant[];
  onStartSharing: () => void;
  onCopyInvite: () => void;
  canShareScreen?: boolean | null;
}

interface StreamItem {
  id: string; // 'local' or peerId
  stream: MediaStream | null;
  paused?: boolean;
  isLocal: boolean;
  displayName: string;
  hasAudio: boolean;
}

export function RoomStage({
  annotations,
  onTogglePointingPermission,
  interactions,
  interactionAccess,
  isCinema = false,
  onToggleCinema,
  remoteConnectionStates = {},
  onRetryPeer,
  localStream,
  isSharing,
  remoteStreams,
  featuredStreamId,
  onSelectFeaturedStream,
  participants,
  onStartSharing,
  onCopyInvite,
  canShareScreen,
}: RoomStageProps) {
  const [showStreams, setShowStreams] = useState(false);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!stageContainerRef.current && document.fullscreenElement === stageContainerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!stageContainerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await stageContainerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
  };

  // Build stream items list
  const streamItems: StreamItem[] = [];

  if (isSharing && localStream) {
    const localPart = participants.find((p) => p.isLocal);
    streamItems.push({
      paused: participants.find(p => p.isLocal)?.isPaused,
      id: 'local',
      stream: localStream,
      isLocal: true,
      displayName: formatDisplayName(localPart?.nickname, true),
      hasAudio: localStream.getAudioTracks().length > 0,
    });
  }

  for (const remote of remoteStreams) {
    const remotePart = participants.find((p) => p.peerId === remote.peerId);
    streamItems.push({
      paused: remotePart?.isPaused,
      id: remote.peerId,
      stream: remote.stream,
      isLocal: false,
      displayName: formatDisplayName(remotePart?.nickname, false),
      hasAudio: remotePart?.hasAudio ?? remote.stream.getAudioTracks().some(track => track.readyState === 'live'),
    });
  }

  for (const participant of participants) {
    if (!participant.isLocal && participant.isSharing && participant.isPaused && !streamItems.some(item => item.id === participant.peerId)) {
      streamItems.push({ id: participant.peerId, stream: null, paused: true, isLocal: false,
        displayName: formatDisplayName(participant.nickname, false), hasAudio: false });
    }
  }

  // Active presentation spotlight
  const activeStream =
    streamItems.find((s) => s.id === featuredStreamId) ||
    streamItems[0] ||
    null;

  const secondaryStreams = activeStream
    ? streamItems.filter((s) => s.id !== activeStream.id)
    : [];

  const watchingParticipants = participants.filter((p) => !p.isSharing);
  const showAccess = isCinema || isFullscreen;

  // Empty state if no stream is active
  if (!activeStream) {
    return (
      <Box
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          backgroundColor: '#080a0f',
          position: 'relative',
        }}
      >
        {interactions}
        {isCinema && <Box style={{ position: 'absolute', top: 16, right: 16, zIndex: 25 }}>{interactionAccess}</Box>}
        {isCinema && <Button onClick={onToggleCinema} mb="md">Sair do Modo Cinema</Button>}
        <Box
          style={{
            maxWidth: '440px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Box
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              backgroundColor: '#161b22',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8c959f',
              marginBottom: '1.5rem',
            }}
          >
            <IconScreen size={40} />
          </Box>

          <Text size="xl" fw={700} c="#ffffff" mb="xs">
            {participants.some((p) => !p.isLocal && p.isSharing) ? 'Conectando à transmissão' : 'Nenhuma transmissão ativa'}
          </Text>

          <Text size="sm" c="#8c959f" mb="xl" style={{ lineHeight: 1.5 }}>
            Quando alguém compartilhar a tela, ela aparecerá aqui automaticamente.
          </Text>

          {participants.filter((p) => !p.isLocal && p.isSharing && remoteConnectionStates[p.peerId] === 'failed').map((p) => (
            <Button key={p.peerId} onClick={() => onRetryPeer?.(p.peerId)}>Tentar novamente</Button>
          ))}
          <Box
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              justifyContent: 'center',
              width: '100%',
              maxWidth: '400px',
            }}
          >
            {canShareScreen === true && (
              <Button
                leftSection={<IconScreen size={16} />}
                onClick={onStartSharing}
                style={{
                  backgroundColor: '#2563eb',
                  fontWeight: 600,
                  height: '42px',
                  padding: '0 1.25rem',
                  flex: '1 1 160px',
                }}
              >
                Compartilhar tela
              </Button>
            )}

            <Button
              variant="default"
              leftSection={<IconLink size={16} />}
              onClick={onCopyInvite}
              style={{
                backgroundColor: '#161b22',
                borderColor: 'rgba(255, 255, 255, 0.12)',
                color: '#e6edf3',
                height: '42px',
                padding: '0 1.25rem',
                flex: '1 1 160px',
              }}
            >
              Copiar convite
            </Button>
          </Box>
        </Box>
      </Box>
    );
  }

  // Active streaming stage
  return (
    <Box
      ref={stageContainerRef}
      className="stage-main-container"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'row',
        position: 'relative',
        backgroundColor: '#05070a',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      {interactions}
      <style>{`
        .stage-main-container { --stage-control-size: 36px; }
        .stage-main-container :focus-visible { outline: 2px solid #58a6ff; outline-offset: 3px; }
        .stage-view-controls {
          position: absolute;
          bottom: max(16px, env(safe-area-inset-bottom, 0px), var(--stage-dock-clearance, 0px));
          right: max(16px, env(safe-area-inset-right, 0px));
          max-width: calc(100% - max(16px, env(safe-area-inset-left, 0px)) - max(16px, env(safe-area-inset-right, 0px)));
          z-index: 20;
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          align-items: center;
          gap: 4px;
          padding: 4px;
          background: rgba(13, 17, 23, .9);
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
        }
        .stage-view-controls button { min-width: var(--stage-control-size); min-height: var(--stage-control-size); }
        @media (max-width: 768px), (pointer: coarse) {
          .stage-main-container { --stage-control-size: 44px; }
        }
        @media (max-width: 560px) {
          .stage-quality-pill-compact { display: none !important; }
          .stage-top-right-access { top: 60px !important; }
        }
        @media (max-width: 768px) {
          .stage-main-container {
            flex-direction: column !important;
          }
          .secondary-streams-panel {
            order: -1 !important;
            width: 100% !important;
            max-height: 105px !important;
            flex-direction: row !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            border-left: none !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-top: none !important;
            padding: 0.5rem 0.75rem !important;
            gap: 0.6rem !important;
            flex-shrink: 0 !important;
            background-color: #0d1117 !important;
            z-index: 15 !important;
          }
          .secondary-streams-header {
            display: none !important;
          }
          .secondary-preview-btn {
            width: 120px !important;
            min-width: 120px !important;
            flex-shrink: 0 !important;
          }
          .secondary-preview-video-box {
            height: 60px !important;
          }
          .watching-participants-box {
            display: none !important;
          }
        }
      `}</style>
      {/* Main Spotlight Canvas */}
      <Box
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          backgroundColor: '#000000',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {/* Spotlight Video Element */}
        <SpotlightVideoPlayer
          key={activeStream.id}
          annotations={annotations}
          localPeerId={participants.find((p) => p.isLocal)?.peerId}
          annotationPeerId={participants.find(p => activeStream.isLocal ? p.isLocal : p.peerId === activeStream.id)?.peerId}
          annotationStreamId={participants.find(p => activeStream.isLocal ? p.isLocal : p.peerId === activeStream.id)?.streamId}
          pointingEnabled={participants.find(p => activeStream.isLocal ? p.isLocal : p.peerId === activeStream.id)?.pointingEnabled !== false}
          onTogglePointingPermission={activeStream.isLocal ? onTogglePointingPermission : undefined}
          stream={activeStream.paused ? null : activeStream.stream}
          isLocal={activeStream.isLocal}
          connectionState={remoteConnectionStates[activeStream.id]}
          onRetry={() => onRetryPeer?.(activeStream.id)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isCinema={isCinema}
          onToggleCinema={onToggleCinema}
          streamCount={secondaryStreams.length}
          showStreams={showStreams}
          onToggleStreams={() => setShowStreams(value => !value)}
        />

        {/* Top-Left Streamer Badge */}
        <Box
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'rgba(13, 17, 23, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '5px 12px 5px 6px',
            borderRadius: '20px',
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          <Box
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: getAvatarColor(activeStream.displayName).bg,
              color: getAvatarColor(activeStream.displayName).text,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            {getInitials(activeStream.displayName)}
          </Box>
          <Text size="xs" fw={600} c="#fff">
            {activeStream.displayName} · {activeStream.paused ? 'Pausado' : 'Transmitindo'}
          </Text>
          <Box
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: activeStream.paused ? '#eab308' : '#22c55e',
            }}
          />
        </Box>

        {/* Top-Right: contextual interaction access (Cinema/fullscreen) + Quality / Live Pill */}
        <Box
          className={showAccess ? 'stage-top-right stage-top-right-access' : 'stage-top-right'}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 26,
          }}
        >
          {showAccess && interactionAccess}
          <Box
            className={showAccess ? 'stage-quality-pill stage-quality-pill-compact' : 'stage-quality-pill'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(13, 17, 23, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '5px 10px',
              borderRadius: '16px',
            }}
          >
            <IconSignal size={13} style={{ color: '#22c55e' }} />
            <Text size="xs" fw={500} c="#8c959f">
              {activeStream.hasAudio ? 'Tela com áudio' : 'Tela'}
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Multi-Stream Previews (Sidebar on desktop / horizontal carousel on mobile) */}
      {secondaryStreams.length > 0 && (!isCinema || showStreams) && (
        <Box
          className="secondary-streams-panel"
          style={{
            width: '240px',
            backgroundColor: '#0d1117',
            borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            padding: '1rem',
            gap: '0.85rem',
            overflowY: 'auto',
            zIndex: 5,
          }}
        >
          <Text size="xs" fw={700} c="#8c959f" className="secondary-streams-header" style={{ letterSpacing: '0.05em' }}>
            OUTRAS TRANSMISSÕES ({secondaryStreams.length})
          </Text>

          {secondaryStreams.map((sec) => (
            <PreviewCard
              key={sec.id}
              streamItem={sec}
              onClick={() => onSelectFeaturedStream(sec.id)}
            />
          ))}

          {/* Watching Participants Chip */}
          {watchingParticipants.length > 0 && (
            <Box
              className="watching-participants-box"
              style={{
                marginTop: 'auto',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: '#161b22',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text size="xs" c="#8c959f">
                Assistindo
              </Text>
              <Text size="xs" fw={700} c="#e6edf3">
                +{watchingParticipants.length}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// Spotlight Video Player Component
function SpotlightVideoPlayer({
  annotations, localPeerId, annotationPeerId, annotationStreamId,
  pointingEnabled = true,
  onTogglePointingPermission,
  stream,
  isLocal,
  connectionState,
  onRetry,
  isCinema,
  onToggleCinema,
  streamCount,
  showStreams,
  onToggleStreams,
  isFullscreen,
  onToggleFullscreen,
}: {
  annotations?: AnnotationChannel;
  localPeerId?: string;
  annotationPeerId?: string;
  annotationStreamId?: string;
  pointingEnabled?: boolean;
  onTogglePointingPermission?: () => void;
  stream: MediaStream | null;
  isLocal: boolean;
  isCinema: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onToggleCinema?: () => void;
  streamCount: number;
  showStreams: boolean;
  onToggleStreams: () => void;
  connectionState?: RTCPeerConnectionState;
  onRetry?: () => void;
}) {
  // CRITICAL: Local video MUST ALWAYS be muted to prevent acoustic feedback loop!
  // Remote video plays unmuted so viewers can hear the presenter's system/tab audio.
  const [playback, setPlayback] = useState('Conectando');
  const videoRef = useMediaStreamVideo(stream, isLocal, setPlayback);
  const [tool, setTool] = useState<AnnotationTool>('navigate');
  const canAnnotate = Boolean(isLocal && stream && annotationStreamId && annotations?.available);
  const canPoint = Boolean(!isLocal && stream && annotationPeerId && annotationStreamId && annotations?.available && pointingEnabled);
  const effectiveTool: AnnotationTool =
    isLocal
      ? canAnnotate && (tool === 'laser' || tool === 'draw')
        ? tool
        : 'navigate'
      : canPoint && tool === 'point'
      ? 'point'
      : 'navigate';
  useEffect(() => { setTool('navigate'); }, [stream, annotationStreamId, annotations?.available, pointingEnabled, isLocal]);
  const zoom = useVideoZoom(videoRef, stream, effectiveTool !== 'navigate');
  const pip = usePictureInPicture(videoRef, stream);
  const controlsRef = useRef<HTMLDivElement>(null);

  // Lift the bar only when it would overlap the central dock.
  useEffect(() => {
    const controls = controlsRef.current;
    const canvas = controls?.parentElement;
    const dock = controls?.ownerDocument.querySelector<HTMLElement>('.floating-dock-wrapper');
    if (!controls || !canvas || !dock) return;
    const positionControls = () => {
      const bar = controls.getBoundingClientRect();
      const dockBounds = dock.getBoundingClientRect();
      const overlapsHorizontally = bar.left < dockBounds.right && bar.right > dockBounds.left;
      const clearance = !isFullscreen && dockBounds.width > 0 && overlapsHorizontally
        ? Math.max(0, canvas.getBoundingClientRect().bottom - dockBounds.top + 12)
        : 0;
      controls.style.setProperty('--stage-dock-clearance', `${clearance}px`);
    };
    const observer = new ResizeObserver(positionControls);
    observer.observe(controls);
    observer.observe(canvas);
    observer.observe(dock);
    window.addEventListener('resize', positionControls);
    positionControls();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', positionControls);
      controls.style.removeProperty('--stage-dock-clearance');
    };
  }, [isFullscreen]);

  return (
    <>
    <Box ref={controlsRef} className="stage-view-controls" role="group" aria-label="Visualização da transmissão">
      {isLocal && annotations && annotationStreamId && <Box role="group" aria-label="Anotações temporárias" style={{ display: 'flex', gap: 2 }}>
        {(['navigate', 'laser', 'draw'] as const).map((mode) => <Tooltip key={mode} label={mode === 'navigate' ? 'Navegar: zoom e arraste' : mode === 'laser' ? 'Ponteiro laser · desaparece ao parar' : `Desenhar · traços duram ${COLLABORATION_LIMITS.annotationTtlMs / 1000} segundos`} withArrow>
          <Button variant={effectiveTool === mode ? 'filled' : 'subtle'} color={effectiveTool === mode ? 'blue' : 'gray'}
            disabled={!canAnnotate} aria-pressed={effectiveTool === mode} onClick={() => setTool(effectiveTool === mode ? 'navigate' : mode)}
            aria-label={mode === 'navigate' ? 'Navegar' : mode === 'laser' ? 'Ponteiro laser' : 'Desenhar'} p={8}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {mode === 'navigate' ? <path d="m5 3 14 10-7 1-3 7z" /> : mode === 'laser' ? <><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></> : <><path d="m4 16-1 5 5-1L20 8l-4-4zM14 6l4 4" /></>}
            </svg>
          </Button>
        </Tooltip>)}
        <Tooltip label="Limpar minhas anotações" withArrow><Button variant="subtle" color="gray" aria-label="Limpar minhas anotações" p={8}
          disabled={!annotations.available} onClick={() => annotations.send({ type: 'clear-annotations', streamId: annotationStreamId, eventId: crypto.randomUUID(), seq: 1 })}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m4 14 9-10 7 6-9 10H7zM9 20h12M9 9l7 6" /></svg>
        </Button></Tooltip>
        {onTogglePointingPermission && (
          <Tooltip
            label={
              pointingEnabled
                ? 'Permitir apontamentos dos espectadores (ativo)'
                : 'Permitir apontamentos dos espectadores (desativado)'
            }
            withArrow
          >
            <Button
              variant={pointingEnabled ? 'light' : 'subtle'}
              color={pointingEnabled ? 'cyan' : 'gray'}
              disabled={!annotations.available}
              aria-pressed={pointingEnabled}
              aria-label="Permitir apontamentos dos espectadores"
              onClick={onTogglePointingPermission}
              p={8}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="7" />
                <circle cx="12" cy="12" r="2.2" />
                {!pointingEnabled && <path d="M4 4l16 16" />}
              </svg>
            </Button>
          </Tooltip>
        )}
      </Box>}
      {!isLocal && annotations && annotationPeerId && annotationStreamId && (
        <Box role="group" aria-label="Apontamento rápido" style={{ display: 'flex', gap: 2 }}>
          <Tooltip
            label={
              !pointingEnabled
                ? 'Apontamentos desativados pelo apresentador'
                : effectiveTool === 'point'
                ? 'Cancelar apontamento (Esc)'
                : 'Apontar um ponto na transmissão'
            }
            withArrow
          >
            <span
              tabIndex={!canPoint ? 0 : undefined}
              aria-label={!pointingEnabled ? 'Apontamentos desativados pelo apresentador' : undefined}
            >
              <Button
                variant={effectiveTool === 'point' ? 'filled' : 'subtle'}
                color={effectiveTool === 'point' ? 'cyan' : 'gray'}
                disabled={!canPoint}
                aria-pressed={effectiveTool === 'point'}
                aria-label="Apontar"
                onClick={() => {
                  const next = effectiveTool === 'point' ? 'navigate' : 'point';
                  setTool(next);
                  if (next === 'point') {
                    requestAnimationFrame(() => zoom.viewportRef.current?.focus({ preventScroll: true }));
                  }
                }}
                px={10}
                py={6}
                style={{ gap: 6 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ marginRight: 5 }}>
                  <circle cx="12" cy="12" r="7" />
                  <circle cx="12" cy="12" r="2.2" />
                </svg>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Apontar</span>
              </Button>
            </span>
          </Tooltip>
        </Box>
      )}
      {onToggleCinema && (
        <Tooltip label={isCinema ? 'Sair do Modo Cinema' : 'Modo Cinema'} withArrow>
          <Button
            variant={isCinema ? 'filled' : 'subtle'} color={isCinema ? 'blue' : 'gray'}
            aria-pressed={isCinema} aria-label={isCinema ? 'Sair do Modo Cinema' : 'Modo Cinema'}
            onClick={onToggleCinema} p={8}
          ><IconCinema size={18} aria-hidden /></Button>
        </Tooltip>
      )}
      {isCinema && streamCount > 0 && (
        <Button variant="subtle" color="gray" aria-expanded={showStreams} onClick={onToggleStreams}>
          {showStreams ? 'Ocultar' : 'Transmissões'} ({streamCount})
        </Button>
      )}
      <Tooltip label={pip.available || pip.active ? 'Janela flutuante (PiP) · sem anotações' : 'Janela flutuante indisponível neste navegador ou vídeo'} withArrow>
        <span
          tabIndex={!pip.available && !pip.active ? 0 : undefined}
          aria-label={!pip.available && !pip.active ? 'Janela flutuante indisponível neste navegador ou vídeo' : undefined}
        >
          <Button
            variant={pip.active ? 'filled' : 'subtle'} color={pip.active ? 'blue' : 'gray'}
            aria-pressed={pip.active} aria-label={pip.active ? 'Fechar janela flutuante' : 'Janela flutuante (PiP)'}
            disabled={pip.pending || (!pip.available && !pip.active)} aria-busy={pip.pending} loading={pip.pending}
            onClick={pip.toggle} p={8}
          ><IconPictureInPicture size={18} aria-hidden /></Button>
        </span>
      </Tooltip>
      <Box
        className="zoom-controls"
        role="group"
        aria-label="Zoom da transmissão"
        style={{
          display: 'flex', alignItems: 'center', gap: 2,
          background: 'rgba(13,17,23,.9)', borderRadius: 8,
        }}
      >
        <Button
          variant="subtle" color="gray" aria-label="Reduzir zoom"
          disabled={!stream || zoom.scale === 1} onClick={() => zoom.changeZoom(-0.25)}
          style={{ minWidth: 'var(--stage-control-size)', height: 'var(--stage-control-size)', padding: 0 }}
        ><IconMinus size={16} aria-hidden /></Button>
        <Text size="xs" aria-live="polite" style={{ minWidth: 32, fontSize: 11, textAlign: 'center' }}>
          {Math.round(zoom.scale * 100)}%
        </Text>
        <Button
          variant="subtle" color="gray" aria-label="Ampliar zoom"
          disabled={!stream || zoom.scale === 3} onClick={() => zoom.changeZoom(0.25)}
          style={{ minWidth: 'var(--stage-control-size)', height: 'var(--stage-control-size)', padding: 0 }}
        ><IconPlus size={16} aria-hidden /></Button>
        <Button
          variant="subtle" color="gray" aria-label="Restaurar enquadramento"
          disabled={!stream || zoom.scale === 1} onClick={() => zoom.changeZoom()}
          style={{ minWidth: 'var(--stage-control-size)', height: 'var(--stage-control-size)', padding: 0 }}
        ><IconReset size={16} aria-hidden /></Button>
      </Box>
      <Tooltip label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'} withArrow>
        <Button
          variant="subtle" color="gray" onClick={onToggleFullscreen} p={8}
          aria-pressed={isFullscreen} aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        >{isFullscreen ? <IconMinimize size={16} aria-hidden /> : <IconMaximize size={16} aria-hidden />}</Button>
      </Tooltip>
    </Box>
    {pip.error && <Text role="alert" size="sm" style={{ position: 'absolute', top: 108, right: 12, left: 12, zIndex: 20, background: '#161b22', padding: 8 }}>{pip.error}</Text>}
    <Box style={{ position: 'absolute', top: 60, left: 12, zIndex: 2 }}>
      {stream && <Text size="sm">{connectionState === 'failed' ? 'Falha na conexão' : connectionState === 'disconnected' ? 'Reconectando' : playback}</Text>}
      {connectionState === 'failed' && <Button onClick={onRetry}>Tentar novamente</Button>}
      {videoRef.audioBlocked && <Button onClick={videoRef.enableAudio}>Ativar áudio</Button>}
      {playback === 'Falha na reprodução' && <Button onClick={() => videoRef.current?.play().catch(() => {})}>Tentar novamente</Button>}
    </Box>
    <Box
      ref={zoom.viewportRef}
      tabIndex={effectiveTool !== 'navigate' ? 0 : undefined}
      aria-label={
        effectiveTool === 'draw'
          ? 'Área de desenho; Escape cancela o gesto'
          : effectiveTool === 'point'
          ? 'Área de apontamento; clique no vídeo, use as setas e Enter para enviar, ou Escape para cancelar'
          : undefined
      }
      onKeyDown={event => { if (event.key === 'Escape') setTool('navigate'); }}
      data-testid="zoom-viewport"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
    {!stream && <Box role="status" style={{ textAlign: 'center', padding: 24, position: 'absolute', inset: 0, display: 'grid', placeContent: 'center' }}>
      <Text c="white">Transmissão pausada</Text>
      {isLocal && <Text c="dimmed" size="sm">O navegador continua capturando. Retome ou pare pelo controle de compartilhamento.</Text>}
    </Box>}
    <div ref={zoom.contentRef} style={{ position: 'absolute', inset: 0 }}>
    {stream && <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isLocal}
      style={{
        width: '100%',
        height: '100%',
        maxHeight: '100%',
        maxWidth: '100%',
        objectFit: 'contain',
        display: 'block',
      }}
    />}
    {annotations && annotationPeerId && annotationStreamId && (
      <AnnotationOverlay
        channel={annotations}
        peerId={annotationPeerId}
        streamId={annotationStreamId}
        tool={effectiveTool}
        zoom={zoom}
        localPeerId={localPeerId}
        onToolComplete={() => setTool('navigate')}
      />
    )}
    </div>
    </Box>
    </>
  );
}

// Secondary Stream Preview Card Component
function PreviewCard({
  streamItem,
  onClick,
}: {
  streamItem: StreamItem;
  onClick: () => void;
}) {
  // CRITICAL: Secondary preview thumbnails MUST ALWAYS BE MUTED to prevent duplicate/cacophony audio!
  const videoRef = useMediaStreamVideo(streamItem.paused ? null : streamItem.stream, true);

  return (
    <UnstyledButton
      onClick={onClick}
      className="secondary-preview-btn"
      aria-label={`Destacar transmissão de ${streamItem.displayName}`}
      style={{
        width: '100%',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        backgroundColor: '#161b22',
        cursor: 'pointer',
        transition: 'transform 0.15s ease, border-color 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        className="secondary-preview-video-box"
        style={{
          width: '100%',
          height: '120px',
          backgroundColor: '#000',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />

        {streamItem.paused && <Text pos="absolute" c="white" size="xs">Pausado</Text>}
        {/* Hover overlay hint */}
        <Box
          style={{
            position: 'absolute',
            bottom: 6,
            right: 6,
            padding: '2px 6px',
            borderRadius: 4,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            fontSize: '10px',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          Destacar
        </Box>
      </Box>

      <Box
        style={{
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: '#161b22',
        }}
      >
        <Box
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: getAvatarColor(streamItem.displayName).bg,
            color: getAvatarColor(streamItem.displayName).text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '9px',
            fontWeight: 700,
          }}
        >
          {getInitials(streamItem.displayName)}
        </Box>
        <Text
          size="xs"
          fw={600}
          c="#fff"
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {streamItem.displayName}
        </Text>
      </Box>
    </UnstyledButton>
  );
}
