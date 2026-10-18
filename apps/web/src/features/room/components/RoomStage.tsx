import { COLLABORATION_LIMITS } from '@screen-room/protocol';
import { AnnotationOverlay, type AnnotationChannel, type AnnotationTool } from './AnnotationOverlay';
import React, { useRef, useState, useEffect, useId } from 'react';
import {
  Box,
  Text,
  Button,
  UnstyledButton,
  Tooltip,
  Menu,
  Popover,
} from '@mantine/core';
import type { RemoteStreamEntry, RoomParticipant } from '../types';
import { usePictureInPicture } from '../hooks/usePictureInPicture';
import { useVideoZoom } from '../hooks/useVideoZoom';
import { useMediaStreamVideo } from '../hooks/useMediaStreamVideo';
import { useVideoScreenshot } from '../hooks/useVideoScreenshot';
import {
  formatDisplayName,
  getAvatarColor,
  getInitials,
} from '../utils/avatar';
import {
  IconScreen,
  IconCinema,
  IconPictureInPicture,
  IconCompare,
  IconCamera,
  IconCheck,
  IconPlus,
  IconMinus,
  IconMaximize,
  IconMinimize,
  IconSignal,
  IconLink,
} from './Icons';

export interface RoomStageProps {
  onVideoPresented?: (peerId: string, stream: MediaStream) => void;
  annotations?: AnnotationChannel;
  onTogglePointingPermission?: () => void;
  drawingEnabled?: boolean;
  onToggleDrawingPermission?: () => void;
  onClearCollaborativeDrawings?: () => void;
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
  onVideoPresented,
  annotations,
  onTogglePointingPermission,
  drawingEnabled,
  onToggleDrawingPermission,
  onClearCollaborativeDrawings,
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
  const [comparison, setComparison] = useState(false);
  const [primaryControlsExpanded, setPrimaryControlsExpanded] = useState(true);
  const [secondaryControlsExpanded, setSecondaryControlsExpanded] = useState(true);
  const [secondaryId, setSecondaryId] = useState<string | null>(null);
  const [audioPreferences, setAudioPreferences] = useState<Record<string, { volume: number; muted: boolean }>>({});
  const [manualAudio, setManualAudio] = useState<string | null>(null);
  const previousPrimary = useRef<string | null>(null);
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

  // Comparison is local UI state: only the primary uses the session/F29 callback.
  const comparing = comparison && secondaryStreams.length > 0;
  const secondaryStream = (comparing ? secondaryStreams.find(item => item.id === manualAudio) : undefined)
    ?? secondaryStreams.find(item => item.id === secondaryId)
    ?? secondaryStreams.find(item => item.id === previousPrimary.current)
    ?? secondaryStreams[0];
  const primaryId = activeStream?.id;
  const resolvedSecondaryId = secondaryStream?.id ?? null;
  useEffect(() => {
    if (secondaryStreams.length === 0) setComparison(false);
    setSecondaryId(resolvedSecondaryId);
    previousPrimary.current = primaryId ?? null;
  }, [primaryId, resolvedSecondaryId, secondaryStreams.length]);

  // A vanished source leaves silence until the viewer explicitly selects audio again.
  const audioHistory = useRef<{ source?: string }>({});
  const [audioSuspended, setAudioSuspended] = useState(false);
  const manualValid = comparing && manualAudio !== null &&
    (manualAudio === primaryId || manualAudio === resolvedSecondaryId);
  const sourceId = manualValid ? manualAudio : primaryId;
  const vanished = audioHistory.current.source !== undefined &&
    !streamItems.some(item => item.id === audioHistory.current.source);
  const manualUnavailable = comparing && manualAudio !== null && !manualValid;
  const suspended = audioSuspended || vanished || manualUnavailable;
  useEffect(() => {
    if (vanished || manualUnavailable) setAudioSuspended(true);
    if (!comparing) setManualAudio(null);
    audioHistory.current = { source: sourceId };
  }, [primaryId, sourceId, comparing, vanished, manualUnavailable]);
  const audioFor = (item: StreamItem) => ({
    selected: sourceId === item.id && !suspended,
    preference: audioPreferences[item.id] ?? { volume: 1, muted: false },
    comparing,
    paused: Boolean(item.paused),
    hasAudio: item.hasAudio,
    select: () => { setAudioSuspended(false); setManualAudio(comparing ? item.id : null); },
    change: (patch: Partial<{ volume: number; muted: boolean }>) => setAudioPreferences(previous => ({
      ...previous, [item.id]: { ...(previous[item.id] ?? { volume: 1, muted: false }), ...patch },
    })),
  });

  const selectPrimary = (id: string) => {
    setAudioSuspended(false);
    if (!manualValid) setManualAudio(null);
    onSelectFeaturedStream(id);
  };

  const watchingParticipants = participants.filter((p) => !p.isSharing);
  const showAccess = isCinema || isFullscreen;

  // Empty state if no stream is active
  if (!activeStream) {
    return (
      <Box
        ref={stageContainerRef}
        className="stage-empty-container"
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
        <style>{`
          .stage-empty-container { --stage-control-size: 36px; }
          .stage-empty-container :focus-visible { outline: 2px solid #58a6ff; outline-offset: 3px; }
          @media (max-width: 768px), (pointer: coarse) {
            .stage-empty-container { --stage-control-size: 44px; }
          }
        `}</style>
        {interactions}
        {showAccess && <Box style={{ position: 'absolute', top: 16, right: 16, zIndex: 25 }}>{interactionAccess}</Box>}
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
      className={`stage-main-container${comparing ? ' stage-comparing' : ''}`}
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
        .comparison-panel { flex: 1 1 0; min-width: 0; min-height: 0; position: relative; background: #000; display: flex; flex-direction: column; }
        .stage-comparing .comparison-panel + .comparison-panel { border-left: 1px solid rgba(255, 255, 255, 0.08); }
        .comparison-header {
          position: absolute;
          top: 12px;
          left: 12px;
          right: 12px;
          z-index: 18;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          pointer-events: none;
        }
        .comparison-selector-pill {
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          max-width: min(100%, 340px);
          min-height: var(--stage-control-size);
          padding: 3px 8px 3px 10px;
          border-radius: 999px;
          background: rgba(13, 17, 23, 0.86);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
        }
        .comparison-role-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #94a3b8;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .comparison-role-tag[data-role="primary"] { color: #93c5fd; }
        .comparison-selector-pill select {
          appearance: none;
          -webkit-appearance: none;
          min-width: 0;
          max-width: 170px;
          min-height: calc(var(--stage-control-size) - 6px);
          background-color: rgba(255, 255, 255, 0.06);
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 7px center;
          color: #f0f6fc;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          padding: 2px 24px 2px 10px;
          cursor: pointer;
          text-overflow: ellipsis;
        }
        .comparison-selector-pill select:hover {
          background-color: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .comparison-selector-pill select option {
          background: #161b22;
          color: #e6edf3;
        }
        .comparison-meta-badge {
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 9px;
          border-radius: 999px;
          background: rgba(13, 17, 23, 0.82);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.09);
          font-size: 11px;
          font-weight: 500;
          color: #8c959f;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .stage-comparing .stage-top-right { display: none !important; }
        .stage-main-container :focus-visible { outline: 2px solid #58a6ff; outline-offset: 2px; }
        .stage-view-controls {
          position: absolute;
          top: 100px;
          bottom: max(100px, env(safe-area-inset-bottom, 0px));
          right: max(8px, env(safe-area-inset-right, 0px));
          z-index: 20;
          width: var(--stage-rail-width, 48px);
          display: flex;
          flex-direction: column;
          align-items: center;
          pointer-events: none;
        }
        @media (min-width: 960px) {
          /* Keep the rail available beside the existing non-modal interactions panel. */
          .stage-main-container:not(.stage-comparing):has(#room-chat-panel) .stage-view-controls,
          .stage-comparing:has(#room-chat-panel) .comparison-panel[aria-label="Transmissão secundária"] .stage-view-controls {
            right: 392px;
          }
        }
        .stage-view-controls :focus-visible { outline-offset: -2px; }
        .stage-controls-toggle { flex-shrink: 0; }
        .stage-controls-toggle, .stage-controls-scroll {
          pointer-events: auto;
          background: rgba(13, 17, 23, 0.94);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        }
        .stage-controls-scroll {
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: #484f58 #0d1117;
          margin-top: 4px;
          padding: 1px;
          width: var(--stage-rail-width, 48px);
          flex-shrink: 1;
        }
        .stage-display-controls, .stage-tools-group, .zoom-controls {
          display: flex !important;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .stage-tools-group + .stage-display-controls {
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          padding-top: 6px;
          margin-top: 6px;
        }
        .stage-view-controls .zoom-controls {
          border-radius: 10px !important;
          margin-block: 4px;
        }
        .stage-view-controls .stage-streams-btn {
          width: var(--stage-control-size);
          padding: 0 !important;
          font-size: 0 !important;
        }
        .stage-annotations-menu { max-width: calc(100vw - 24px); }
        .stage-annotations-menu [role="menuitem"], .stage-annotations-menu [role="menuitemcheckbox"] { min-height: 44px; }
        .stage-view-controls button {
          min-width: var(--stage-control-size);
          min-height: var(--stage-control-size);
          height: var(--stage-control-size);
          border-radius: 999px;
          padding: 0;
        }
        .stage-view-controls .stage-controls-toggle { min-width: var(--stage-control-size) !important; width: var(--stage-control-size) !important; }
        .zoom-reset-btn {
          min-width: 38px !important;
          padding: 0 4px !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          font-variant-numeric: tabular-nums;
          color: #e6edf3 !important;
          background: transparent !important;
        }
        .zoom-reset-btn:disabled {
          opacity: 0.85 !important;
          color: #94a3b8 !important;
          cursor: default;
        }
        .zoom-reset-btn:not(:disabled):hover {
          background: rgba(255, 255, 255, 0.08) !important;
          color: #93c5fd !important;
        }
        @media (max-width: 768px), (pointer: coarse) {
          .stage-main-container { --stage-control-size: 44px; --stage-rail-width: 56px; }
          .comparison-selector-pill {
            padding: 2px 6px 2px 8px;
          }
          .comparison-selector-pill select {
            min-height: 36px;
            max-width: 136px;
          }
        }
        @media (max-width: 768px) {
          .stage-main-container {
            flex-direction: column !important;
          }
          .stage-comparing {
            overflow-y: auto !important;
            margin-bottom: 100px;
          }
          .stage-comparing .comparison-panel {
            flex: 1 0 420px;
            min-height: 420px;
          }
          .stage-comparing .comparison-panel + .comparison-panel {
            border-left: none;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
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
        @media (max-width: 560px) {
          .stage-quality-pill-compact { display: none !important; }
          .stage-top-right-access { top: 56px !important; }
        }
        @media (max-width: 440px) {
          .comparison-header {
            top: 8px;
            left: 8px;
            right: 8px;
          }
          .comparison-selector-pill select {
            max-width: 112px;
          }
        }
      `}</style>
      <Box className="comparison-panel" role={comparing ? 'region' : undefined} aria-label={comparing ? 'Transmissão principal' : undefined}>
      {comparing && <Box className="comparison-header">
        <Box className="comparison-selector-pill">
          <span className="comparison-role-tag" data-role="primary">
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: activeStream.paused ? '#eab308' : '#22c55e',
            }} />
            Principal
          </span>
          <select aria-label="Transmissão principal" value={activeStream.id} onChange={event => selectPrimary(event.target.value)}>
            {streamItems.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
          </select>
        </Box>
        <Box style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
          <span className="comparison-meta-badge">
            <IconSignal size={12} style={{ color: '#22c55e' }} />
            {activeStream.hasAudio ? 'Com áudio' : 'Tela'}
          </span>
          {showAccess && interactionAccess}
        </Box>
      </Box>}
      {/* Main Spotlight Canvas */}
      <Box
        className="comparison-canvas"
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
          audio={audioFor(activeStream)}
          controlsExpanded={primaryControlsExpanded} onControlsExpandedChange={setPrimaryControlsExpanded}
          onVideoPresented={onVideoPresented}
          remotePeerId={activeStream.isLocal ? undefined : activeStream.id}
          annotations={annotations}
          localPeerId={participants.find((p) => p.isLocal)?.peerId}
          annotationPeerId={participants.find(p => activeStream.isLocal ? p.isLocal : p.peerId === activeStream.id)?.peerId}
          annotationStreamId={participants.find(p => activeStream.isLocal ? p.isLocal : p.peerId === activeStream.id)?.streamId}
          pointingEnabled={participants.find(p => activeStream.isLocal ? p.isLocal : p.peerId === activeStream.id)?.pointingEnabled !== false}
          onTogglePointingPermission={activeStream.isLocal ? onTogglePointingPermission : undefined}
          drawingEnabled={participants.find(p => activeStream.isLocal ? p.isLocal : p.peerId === activeStream.id)?.drawingEnabled === true}
          onToggleDrawingPermission={activeStream.isLocal ? onToggleDrawingPermission : undefined}
          onClearCollaborativeDrawings={activeStream.isLocal ? onClearCollaborativeDrawings : undefined}
          stream={activeStream.paused ? null : activeStream.stream}
          isLocal={activeStream.isLocal}
          connectionState={remoteConnectionStates[activeStream.id]}
          onRetry={() => onRetryPeer?.(activeStream.id)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isCinema={isCinema}
          onToggleCinema={onToggleCinema}
          streamCount={comparing ? 0 : secondaryStreams.length}
          overlayTop={56}
          showStreams={showStreams}
          onToggleStreams={() => setShowStreams(value => !value)}
          comparisonControl={secondaryStreams.length > 0 ? (
            <Tooltip label={comparing ? 'Sair da comparação' : 'Comparar transmissões'} events={{ hover: true, focus: true, touch: false }} withArrow>
              <Button
                variant={comparing ? 'filled' : 'subtle'}
                color={comparing ? 'blue' : 'gray'}
                aria-pressed={comparing}
                aria-label={comparing ? 'Sair da comparação' : 'Comparar'}
                onClick={() => {
                  setManualAudio(null);
                  setAudioSuspended(false);
                  setComparison(value => !value);
                }}
              >
                <IconCompare size={15} aria-hidden />
              </Button>
            </Tooltip>
          ) : undefined}
        />

        {/* Top-Left Streamer Badge (Traditional stage only; in comparison mode the compact selector pill identifies the presenter) */}
        {!comparing && (
          <Box
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: 'rgba(13, 17, 23, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '4px 11px 4px 5px',
              borderRadius: '20px',
              zIndex: 10,
              pointerEvents: 'auto',
            }}
          >
            <Box
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                backgroundColor: getAvatarColor(activeStream.displayName).bg,
                color: getAvatarColor(activeStream.displayName).text,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
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
        )}

        {/* Top-Right: contextual interaction access (Cinema/fullscreen) + Quality / Live Pill */}
        <Box
          className={showAccess ? 'stage-top-right stage-top-right-access' : 'stage-top-right'}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 26,
          }}
        >
          {showAccess && !comparing && interactionAccess}
          <Box
            className={showAccess ? 'stage-quality-pill stage-quality-pill-compact' : 'stage-quality-pill'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(13, 17, 23, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '4px 10px',
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

      </Box>
      {comparing && secondaryStream && <Box className="comparison-panel" role="region" aria-label="Transmissão secundária">
        <Box className="comparison-header">
          <Box className="comparison-selector-pill">
            <span className="comparison-role-tag" data-role="secondary">
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: secondaryStream.paused ? '#eab308' : '#38bdf8',
              }} />
              Secundária
            </span>
            <select aria-label="Transmissão secundária" value={secondaryStream.id} onChange={event => {
              if (manualAudio && manualAudio !== primaryId && manualAudio !== event.target.value) {
                setManualAudio(null);
                setAudioSuspended(true);
              }
              setSecondaryId(event.target.value);
            }}>
              {secondaryStreams.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
            </select>
          </Box>
          <span className="comparison-meta-badge">{sourceId === secondaryStream.id && !suspended ? 'Fonte de áudio' : 'Áudio secundário'}</span>
        </Box>
        <Box className="comparison-canvas" style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          <SpotlightVideoPlayer key={secondaryStream.id} secondary audio={audioFor(secondaryStream)}
            controlsExpanded={secondaryControlsExpanded} onControlsExpandedChange={setSecondaryControlsExpanded}
            stream={secondaryStream.paused ? null : secondaryStream.stream} isLocal={secondaryStream.isLocal}
            remotePeerId={secondaryStream.isLocal ? undefined : secondaryStream.id} onVideoPresented={onVideoPresented}
            annotations={annotations} localPeerId={participants.find(p => p.isLocal)?.peerId}
            annotationPeerId={participants.find(p => secondaryStream.isLocal ? p.isLocal : p.peerId === secondaryStream.id)?.peerId}
            annotationStreamId={participants.find(p => secondaryStream.isLocal ? p.isLocal : p.peerId === secondaryStream.id)?.streamId}
            connectionState={remoteConnectionStates[secondaryStream.id]} onRetry={() => onRetryPeer?.(secondaryStream.id)}
            isCinema={isCinema} isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen}
            overlayTop={56}
            streamCount={0} showStreams={false} onToggleStreams={() => {}} />
        </Box>
      </Box>}

      {/* Multi-Stream Previews (Sidebar on desktop / horizontal carousel on mobile) */}
      {!comparing && secondaryStreams.length > 0 && (!isCinema || showStreams) && (
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
              onClick={() => selectPrimary(sec.id)}
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
type AudioControl = {
  selected: boolean; preference: { volume: number; muted: boolean };
  comparing: boolean; paused: boolean; hasAudio: boolean;
  select: () => void; change: (patch: Partial<{ volume: number; muted: boolean }>) => void;
};

function SpotlightVideoPlayer({
  audio,
  controlsExpanded, onControlsExpandedChange,
  secondary = false, comparisonControl,
  onVideoPresented, remotePeerId,
  annotations, localPeerId, annotationPeerId, annotationStreamId,
  pointingEnabled = true,
  onTogglePointingPermission,
  drawingEnabled = false,
  onToggleDrawingPermission,
  onClearCollaborativeDrawings,
  stream,
  isLocal,
  connectionState,
  onRetry,
  isCinema,
  onToggleCinema,
  streamCount,
  overlayTop = 56,
  showStreams,
  onToggleStreams,
  isFullscreen,
  onToggleFullscreen,
}: {
  audio: AudioControl;
  controlsExpanded: boolean;
  onControlsExpandedChange: (expanded: boolean) => void;
  secondary?: boolean;
  comparisonControl?: React.ReactNode;
  overlayTop?: number;
  remotePeerId?: string;
  onVideoPresented?: (peerId: string, stream: MediaStream) => void;
  annotations?: AnnotationChannel;
  localPeerId?: string;
  annotationPeerId?: string;
  annotationStreamId?: string;
  pointingEnabled?: boolean;
  onTogglePointingPermission?: () => void;
  drawingEnabled?: boolean;
  onToggleDrawingPermission?: () => void;
  onClearCollaborativeDrawings?: () => void;
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
  // RoomStage selects the sole audible player; local previews never produce sound.
  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  useEffect(() => {
    const tracks = new Set<MediaStreamTrack>();
    const sync = () => {
      const liveTracks = new Set(stream?.getAudioTracks().filter(track => track.readyState === 'live') ?? []);
      for (const track of tracks) {
        if (!liveTracks.has(track)) {
          track.removeEventListener('ended', sync);
          tracks.delete(track);
        }
      }
      for (const track of liveTracks) {
        if (!tracks.has(track)) { tracks.add(track); track.addEventListener('ended', sync); }
      }
      setHasAudioTrack(liveTracks.size > 0);
    };
    sync();
    stream?.addEventListener('addtrack', sync);
    stream?.addEventListener('removetrack', sync);
    return () => {
      stream?.removeEventListener('addtrack', sync);
      stream?.removeEventListener('removetrack', sync);
      tracks.forEach(track => track.removeEventListener('ended', sync));
    };
  }, [stream]);
  const audioAvailable = Boolean(stream && !audio.paused && audio.hasAudio && hasAudioTrack);
  const [playback, setPlayback] = useState('Conectando');
  const videoRef = useMediaStreamVideo(stream, isLocal || !audio.selected || audio.preference.muted || !audioAvailable, setPlayback, !isLocal && remotePeerId && stream ? () => onVideoPresented?.(remotePeerId, stream) : undefined, audio.preference.volume);
  const [tool, setTool] = useState<AnnotationTool>('navigate');
  const canAnnotate = Boolean(!secondary && isLocal && stream && annotationStreamId && annotations?.available);
  const canPoint = Boolean(!secondary && !isLocal && stream && annotationPeerId && annotationStreamId && annotations?.available && pointingEnabled);
  const canDraw = Boolean(!secondary && !isLocal && stream && annotationPeerId && annotationStreamId && annotations?.available && drawingEnabled);
  const effectiveTool: AnnotationTool =
    !controlsExpanded ? 'navigate' : isLocal
      ? canAnnotate && (tool === 'laser' || tool === 'draw')
        ? tool
        : 'navigate'
      : canDraw && tool === 'draw'
      ? 'draw'
      : canPoint && tool === 'point'
      ? 'point'
      : 'navigate';
  useEffect(() => { setTool('navigate'); }, [stream, annotationStreamId, annotations?.available, pointingEnabled, drawingEnabled, isLocal]);
  const zoom = useVideoZoom(videoRef, stream, effectiveTool !== 'navigate');
  const pip = usePictureInPicture(videoRef, secondary ? null : stream);
  const screenshot = useVideoScreenshot({
    videoRef,
    stream: secondary ? null : stream,
    streamId: isLocal ? 'local' : remotePeerId,
    isPaused: !stream,
    connectionState,
    isLocal,
  });
  const controlsRef = useRef<HTMLDivElement>(null);
  const audioMuteRef = useRef<HTMLButtonElement>(null);

  const toolsId = useId();

  const statusText = connectionState === 'failed'
    ? 'Falha na conexão'
    : connectionState === 'disconnected'
    ? 'Reconectando'
    : playback !== 'Ao vivo'
    ? playback
    : null;

  return (
    <>
    <Box ref={controlsRef} className="stage-view-controls" role="group" aria-label="Visualização da transmissão">
      <Tooltip label={controlsExpanded ? 'Recolher ferramentas' : 'Expandir ferramentas'} position="left" events={{ hover: true, focus: true, touch: false }} withArrow>
        <Button variant="subtle" color="gray" className="stage-controls-toggle"
          aria-label={controlsExpanded ? 'Recolher ferramentas' : 'Expandir ferramentas'} aria-expanded={controlsExpanded}
          aria-controls={toolsId}
          onClick={() => { setTool('navigate'); onControlsExpandedChange(!controlsExpanded); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={controlsExpanded ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} />
          </svg>
        </Button>
      </Tooltip>
      <Box id={toolsId} className="stage-controls-scroll" hidden={!controlsExpanded}>{controlsExpanded && <>
      {!secondary && isLocal && annotations && annotationStreamId && <Box className="stage-tools-group" role="group" aria-label="Anotações temporárias" style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
        {(['navigate', 'laser', 'draw'] as const).map((mode) => <Tooltip position="left" key={mode} label={mode === 'navigate' ? 'Navegar: zoom e arraste' : mode === 'laser' ? 'Ponteiro laser · desaparece ao parar' : `Desenhar · traços duram ${COLLABORATION_LIMITS.annotationTtlMs / 1000} segundos`} events={{ hover: true, focus: true, touch: false }} withArrow>
          <Button variant={effectiveTool === mode ? 'filled' : 'subtle'} color={effectiveTool === mode ? 'blue' : 'gray'}
            disabled={!canAnnotate} aria-pressed={effectiveTool === mode} onClick={() => setTool(effectiveTool === mode ? 'navigate' : mode)}
            aria-label={mode === 'navigate' ? 'Navegar' : mode === 'laser' ? 'Ponteiro laser' : 'Desenhar'}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {mode === 'navigate' ? <path d="m5 3 14 10-7 1-3 7z" /> : mode === 'laser' ? <><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></> : <><path d="m4 16-1 5 5-1L20 8l-4-4zM14 6l4 4" /></>}
            </svg>
          </Button>
        </Tooltip>)}
        <Menu key={`${annotationPeerId}:${annotationStreamId}:${isFullscreen}`} position="left-start" offset={8}
          middlewares={{ flip: true, shift: { padding: 12, crossAxis: true } }}
          width={280} closeOnItemClick={false}
          portalProps={{ target: isFullscreen ? controlsRef.current?.closest<HTMLElement>('.stage-main-container') ?? undefined : undefined }}>
          <Menu.Target>
            <Button variant="subtle" color="gray" aria-label="Anotações" title="Anotações">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
              </svg>
            </Button>
          </Menu.Target>
          <Menu.Dropdown className="stage-annotations-menu">
            <Menu.Label>Permissões dos espectadores</Menu.Label>
            {onTogglePointingPermission && <Menu.CheckboxItem checked={pointingEnabled}
              disabled={!annotations.available} onChange={onTogglePointingPermission}
              rightSection={<span aria-hidden>{pointingEnabled ? 'Ativo' : 'Inativo'}</span>}>
              Permitir apontamentos
            </Menu.CheckboxItem>}
            {onToggleDrawingPermission && <Menu.CheckboxItem checked={Boolean(drawingEnabled)}
              disabled={!annotations.available} onChange={onToggleDrawingPermission}
              rightSection={<span aria-hidden>{drawingEnabled ? 'Ativo' : 'Inativo'}</span>}>
              Permitir desenhos
            </Menu.CheckboxItem>}
            <Menu.Divider />
            <Menu.Label>Limpeza</Menu.Label>
            <Menu.Item disabled={!annotations.available}
              onClick={() => annotations.send({ type: 'clear-annotations', streamId: annotationStreamId, eventId: crypto.randomUUID(), seq: 1 })}>
              Limpar minhas anotações
            </Menu.Item>
            {onClearCollaborativeDrawings && <Menu.Item disabled={!annotations.available} onClick={onClearCollaborativeDrawings}>
              Limpar desenhos dos espectadores
            </Menu.Item>}
          </Menu.Dropdown>
        </Menu>
      </Box>}
      {!secondary && !isLocal && annotations && annotationPeerId && annotationStreamId && (
        <Box className="stage-tools-group" role="group" aria-label="Ferramentas de colaboração" style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <Tooltip position="left"
            label={
              !pointingEnabled
                ? 'Apontamentos desativados pelo apresentador'
                : effectiveTool === 'point'
                ? 'Cancelar apontamento (Esc)'
                : 'Apontar um ponto na transmissão'
            }
            events={{ hover: true, focus: true, touch: false }}
            withArrow
          >
            <span
              tabIndex={!canPoint ? 0 : undefined}
              aria-label={!pointingEnabled ? 'Apontamentos desativados pelo apresentador' : undefined}
              style={{ display: 'inline-flex' }}
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
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="7" />
                  <circle cx="12" cy="12" r="2.2" />
                </svg>
              </Button>
            </span>
          </Tooltip>
          <Tooltip position="left"
            label={
              !drawingEnabled
                ? 'Desenho colaborativo desativado pelo apresentador'
                : effectiveTool === 'draw'
                ? 'Cancelar desenho (Esc)'
                : `Desenhar · traços duram ${COLLABORATION_LIMITS.annotationTtlMs / 1000} segundos`
            }
            events={{ hover: true, focus: true, touch: false }}
            withArrow
          >
            <span
              tabIndex={!canDraw ? 0 : undefined}
              aria-label={!drawingEnabled ? 'Desenho colaborativo desativado pelo apresentador' : undefined}
              style={{ display: 'inline-flex' }}
            >
              <Button
                variant={effectiveTool === 'draw' ? 'filled' : 'subtle'}
                color={effectiveTool === 'draw' ? 'blue' : 'gray'}
                disabled={!canDraw}
                aria-pressed={effectiveTool === 'draw'}
                aria-label="Desenhar"
                onClick={() => {
                  const next = effectiveTool === 'draw' ? 'navigate' : 'draw';
                  setTool(next);
                  if (next === 'draw') {
                    requestAnimationFrame(() => zoom.viewportRef.current?.focus({ preventScroll: true }));
                  }
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m4 16-1 5 5-1L20 8l-4-4zM14 6l4 4" />
                </svg>
              </Button>
            </span>
          </Tooltip>
        </Box>
      )}
      <Box className="stage-display-controls" role="group" aria-label="Controles de visualização">
      {!isLocal && <Popover position="left-start" width={240} trapFocus returnFocus portalProps={{ target: controlsRef.current?.closest<HTMLElement>('.stage-main-container') ?? undefined }}>
        <Popover.Target><Button variant={audio.selected ? 'filled' : 'subtle'} color={audio.selected ? 'blue' : 'gray'} aria-label="Áudio da transmissão" title="Áudio da transmissão">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" />{audio.preference.muted ? <path d="m16 9 6 6m0-6-6 6" /> : <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}</svg>
        </Button></Popover.Target>
        <Popover.Dropdown style={{ background: '#161b22', color: '#e6edf3', borderColor: '#484f58', maxWidth: 'calc(100vw - 24px)' }}>
          <Text size="sm" fw={600}>Áudio da transmissão</Text>
          <Text size="xs" role="status" my="xs">{audio.paused ? 'Transmissão pausada' : !(audio.hasAudio && hasAudioTrack) ? 'Sem faixa de áudio' : audio.preference.muted ? 'Mudo local' : videoRef.audioBlocked ? 'Reprodução bloqueada pelo navegador' : audio.selected ? 'Fonte de áudio selecionada' : 'Áudio disponível · fora da seleção'}</Text>
          {!/iPad|iPhone|iPod/.test(navigator.userAgent) && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? <label style={{ display: 'block', fontSize: 12 }}>Volume · {Math.round(audio.preference.volume * 100)}%<input aria-label="Volume da transmissão" type="range" min="0" max="1" step="0.05" value={audio.preference.volume} onChange={event => audio.change({ volume: Number(event.target.value) })} style={{ width: '100%', minHeight: 44, accentColor: '#58a6ff' }} /></label> : <Text size="xs">Ajuste o volume pelos controles do dispositivo.</Text>}
          <Button ref={audioMuteRef} style={{ minHeight: 44 }} fullWidth variant="default" mt="xs" aria-pressed={audio.preference.muted} onClick={() => audio.change({ muted: !audio.preference.muted })}>{audio.preference.muted ? 'Desmutar transmissão' : 'Silenciar transmissão'}</Button>
          {!audio.selected && <Button style={{ minHeight: 44 }} fullWidth mt="xs" disabled={!audioAvailable} onClick={() => { audio.select(); audioMuteRef.current?.focus(); }}>{audio.comparing ? 'Ouvir esta transmissão' : 'Retomar áudio desta transmissão'}</Button>}
          {audioAvailable && audio.selected && !audio.preference.muted && videoRef.audioBlocked && <Button style={{ minHeight: 44 }} fullWidth mt="xs" onClick={() => { void videoRef.enableAudio(); audioMuteRef.current?.focus(); }}>Ativar áudio</Button>}
        </Popover.Dropdown>
      </Popover>}
      {comparisonControl}
      {!secondary && onToggleCinema && (
        <Tooltip position="left" label={isCinema ? 'Sair do Modo Cinema' : 'Modo Cinema'} events={{ hover: true, focus: true, touch: false }} withArrow>
          <Button
            variant={isCinema ? 'filled' : 'subtle'} color={isCinema ? 'blue' : 'gray'}
            aria-pressed={isCinema} aria-label={isCinema ? 'Sair do Modo Cinema' : 'Modo Cinema'}
            onClick={onToggleCinema}
          ><IconCinema size={15} aria-hidden /></Button>
        </Tooltip>
      )}
      {isCinema && streamCount > 0 && (
        <Button aria-label="Alternar outras transmissões" title="Outras transmissões" className="stage-streams-btn" variant="subtle" color="gray" aria-expanded={showStreams} onClick={onToggleStreams} style={{ fontSize: 12, padding: '0 8px' }}>
          <IconScreen size={15} aria-hidden />
        </Button>
      )}
      {!secondary && <>
      <Tooltip position="left" label={pip.available || pip.active ? 'Janela flutuante (PiP) · sem anotações' : 'Janela flutuante indisponível neste navegador ou vídeo'} events={{ hover: true, focus: true, touch: false }} withArrow>
        <span
          tabIndex={!pip.available && !pip.active ? 0 : undefined}
          aria-label={!pip.available && !pip.active ? 'Janela flutuante indisponível neste navegador ou vídeo' : undefined}
          style={{ display: 'inline-flex' }}
        >
          <Button
            variant={pip.active ? 'filled' : 'subtle'} color={pip.active ? 'blue' : 'gray'}
            aria-pressed={pip.active} aria-label={pip.active ? 'Fechar janela flutuante' : 'Janela flutuante (PiP)'}
            disabled={pip.pending || (!pip.available && !pip.active)} aria-busy={pip.pending} loading={pip.pending}
            onClick={pip.toggle}
          ><IconPictureInPicture size={15} aria-hidden /></Button>
        </span>
      </Tooltip>
      <Tooltip position="left"
        label={
          screenshot.feedback === 'success'
            ? 'Download da imagem iniciado'
            : screenshot.feedback === 'error'
            ? 'Falha ao salvar imagem'
            : !screenshot.canCapture
            ? 'Captura indisponível no momento'
            : 'Salvar imagem'
        }
        events={{ hover: true, focus: true, touch: false }}
        withArrow
      >
        <span
          tabIndex={!screenshot.canCapture && screenshot.feedback !== 'success' ? 0 : undefined}
          aria-label={!screenshot.canCapture && screenshot.feedback !== 'success' ? 'Captura indisponível no momento' : undefined}
          style={{ display: 'inline-flex' }}
        >
          <Button
            variant={screenshot.feedback === 'success' ? 'filled' : 'subtle'}
            color={screenshot.feedback === 'success' ? 'teal' : 'gray'}
            aria-label="Salvar imagem"
            disabled={!screenshot.canCapture || screenshot.isCapturing}
            aria-busy={screenshot.isCapturing}
            loading={screenshot.isCapturing}
            onClick={screenshot.captureScreenshot}
          >
            {screenshot.feedback === 'success' ? (
              <IconCheck size={15} aria-hidden />
            ) : (
              <IconCamera size={15} aria-hidden />
            )}
          </Button>
        </span>
      </Tooltip>
      <Box
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {screenshot.feedbackMessage}
      </Box>
      </>}
      <Box
        className="zoom-controls"
        role="group"
        aria-label="Zoom da transmissão"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0,
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: 999,
          border: '1px solid rgba(255, 255, 255, 0.07)',
        }}
      >
        <Button
          variant="subtle" color="gray" aria-label="Reduzir zoom"
          disabled={!stream || zoom.scale === 1} onClick={() => zoom.changeZoom(-0.25)}
          style={{ minWidth: 'var(--stage-control-size)', height: 'var(--stage-control-size)', padding: 0 }}
        ><IconMinus size={14} aria-hidden /></Button>
        <Tooltip position="left" label={zoom.scale !== 1 ? 'Restaurar enquadramento (100%)' : 'Enquadramento original'} events={{ hover: true, focus: true, touch: false }} withArrow>
          <Button
            className="zoom-reset-btn"
            variant="subtle" color="gray"
            aria-label="Restaurar enquadramento"
            aria-live="polite"
            disabled={!stream || zoom.scale === 1}
            onClick={() => zoom.changeZoom()}
            style={{ height: 'var(--stage-control-size)' }}
          >
            {Math.round(zoom.scale * 100)}%
          </Button>
        </Tooltip>
        <Button
          variant="subtle" color="gray" aria-label="Ampliar zoom"
          disabled={!stream || zoom.scale === 3} onClick={() => zoom.changeZoom(0.25)}
          style={{ minWidth: 'var(--stage-control-size)', height: 'var(--stage-control-size)', padding: 0 }}
        ><IconPlus size={14} aria-hidden /></Button>
      </Box>
      {!secondary && <Tooltip position="left" label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'} events={{ hover: true, focus: true, touch: false }} withArrow>
        <Button
          variant="subtle" color="gray" onClick={onToggleFullscreen}
          aria-pressed={isFullscreen} aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        >{isFullscreen ? <IconMinimize size={15} aria-hidden /> : <IconMaximize size={15} aria-hidden />}</Button>
      </Tooltip>}
      </Box>
      </>}</Box>
    </Box>
    {pip.error && <Text role="alert" size="sm" style={{ position: 'absolute', top: overlayTop + 44, right: 12, left: 12, zIndex: 20, background: '#161b22', padding: 8, borderRadius: 8 }}>{pip.error}</Text>}
    {(statusText || connectionState === 'failed' || (audioAvailable && audio.selected && !audio.preference.muted && videoRef.audioBlocked) || playback === 'Falha na reprodução') && (
      <Box style={{ position: 'absolute', top: overlayTop, left: 14, zIndex: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        {stream && statusText && (
          <Text size="xs" fw={500} style={{ background: 'rgba(13, 17, 23, 0.82)', padding: '3px 9px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)' }}>
            {statusText}
          </Text>
        )}
        {connectionState === 'failed' && <Button size="xs" onClick={onRetry}>Tentar novamente</Button>}
        {audioAvailable && audio.selected && !audio.preference.muted && videoRef.audioBlocked && <Button size="xs" onClick={videoRef.enableAudio}>Ativar áudio</Button>}
        {playback === 'Falha na reprodução' && <Button size="xs" onClick={() => videoRef.current?.play().catch(() => {})}>Tentar novamente</Button>}
      </Box>
    )}
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
      muted
      disablePictureInPicture={secondary}
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
