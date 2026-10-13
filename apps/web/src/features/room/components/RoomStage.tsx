import React, { useRef, useState, useEffect } from 'react';
import {
  Box,
  Text,
  Button,
  UnstyledButton,
  Tooltip,
} from '@mantine/core';
import type { RemoteStreamEntry, RoomParticipant } from '../types';
import { useMediaStreamVideo } from '../hooks/useMediaStreamVideo';
import {
  formatDisplayName,
  getAvatarColor,
  getInitials,
} from '../utils/avatar';
import {
  IconScreen,
  IconMaximize,
  IconMinimize,
  IconSignal,
  IconLink,
} from './Icons';

export interface RoomStageProps {
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
  stream: MediaStream;
  isLocal: boolean;
  displayName: string;
  hasAudio: boolean;
}

export function RoomStage({
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
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
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
      id: remote.peerId,
      stream: remote.stream,
      isLocal: false,
      displayName: formatDisplayName(remotePart?.nickname, false),
      hasAudio: remote.stream.getAudioTracks().length > 0,
    });
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
            Nenhuma transmissão ativa
          </Text>

          <Text size="sm" c="#8c959f" mb="xl" style={{ lineHeight: 1.5 }}>
            Quando alguém compartilhar a tela, ela aparecerá aqui automaticamente.
          </Text>

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
      <style>{`
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
        @media (max-width: 600px) {
          .fullscreen-toggle-wrapper {
            bottom: calc(max(16px, env(safe-area-inset-bottom, 16px)) + 58px) !important;
            right: 12px !important;
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
          stream={activeStream.stream}
          isLocal={activeStream.isLocal}
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
            pointerEvents: 'none',
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
            {activeStream.displayName} · Transmitindo
          </Text>
          <Box
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#22c55e',
            }}
          />
        </Box>

        {/* Top-Right Quality / Live Pill */}
        <Box
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(13, 17, 23, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '5px 10px',
            borderRadius: '16px',
            zIndex: 10,
          }}
        >
          <IconSignal size={13} style={{ color: '#22c55e' }} />
          <Text size="xs" fw={500} c="#8c959f">
            {activeStream.hasAudio ? 'Tela com áudio' : 'Tela'} • Ao vivo
          </Text>
        </Box>

        {/* Bottom-Right Fullscreen Toggle */}
        <Box
          className="fullscreen-toggle-wrapper"
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            zIndex: 10,
          }}
        >
          <Tooltip label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'} withArrow>
            <UnstyledButton
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(13, 17, 23, 0.85)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#e6edf3',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {isFullscreen ? <IconMinimize size={18} /> : <IconMaximize size={18} />}
            </UnstyledButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Multi-Stream Previews (Sidebar on desktop / horizontal carousel on mobile) */}
      {secondaryStreams.length > 0 && (
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
  stream,
  isLocal,
}: {
  stream: MediaStream;
  isLocal: boolean;
}) {
  // CRITICAL: Local video MUST ALWAYS be muted to prevent acoustic feedback loop!
  // Remote video plays unmuted so viewers can hear the presenter's system/tab audio.
  const videoRef = useMediaStreamVideo(stream, isLocal);

  return (
    <video
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
    />
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
  const videoRef = useMediaStreamVideo(streamItem.stream, true);

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
