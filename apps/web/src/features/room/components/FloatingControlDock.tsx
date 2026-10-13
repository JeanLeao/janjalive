import React, { useState } from 'react';
import {
  Box,
  Group,
  UnstyledButton,
  Tooltip,
  Text,
} from '@mantine/core';
import {
  IconScreen,
  IconStopShare,
  IconVolume,
  IconVolumeMute,
  IconLink,
  IconCheck,
  IconGear,
  IconExit,
  IconUsers,
} from './Icons';

export interface FloatingControlDockProps {
  isSharing: boolean;
  onToggleShare: () => void;
  hasAudioTrack: boolean;
  isAudioMuted: boolean;
  onToggleAudioMute: () => void;
  onOpenParticipants: () => void;
  participantCount: number;
  onOpenSettings: () => void;
  onLeave: () => void;
  canShareScreen?: boolean | null;
}

export function FloatingControlDock({
  isSharing,
  onToggleShare,
  hasAudioTrack,
  isAudioMuted,
  onToggleAudioMute,
  onOpenParticipants,
  participantCount,
  onOpenSettings,
  onLeave,
  canShareScreen,
}: FloatingControlDockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    if (typeof window !== 'undefined') {
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.search = '';
        cleanUrl.hash = '';
        await navigator.clipboard.writeText(cleanUrl.toString());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy link:', err);
      }
    }
  };

  return (
    <Box
      className="floating-dock-wrapper"
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
        pointerEvents: 'auto',
        maxWidth: 'calc(100vw - 24px)',
        width: 'max-content',
      }}
    >
      <style>{`
        .floating-dock-btn {
          width: 42px;
          height: 42px;
        }
        @media (max-width: 600px) {
          .floating-dock-wrapper {
            bottom: max(16px, env(safe-area-inset-bottom, 16px)) !important;
            max-width: calc(100vw - 16px) !important;
          }
          .floating-dock-bar {
            gap: 6px !important;
            padding: 5px 8px !important;
          }
          .floating-dock-btn {
            width: 42px !important;
            height: 42px !important;
          }
          .floating-dock-share-btn {
            height: 42px !important;
            padding: 0 12px !important;
          }
        }
      `}</style>
      <Box
        className="floating-dock-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          backgroundColor: '#161b22',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          padding: '6px 10px',
          borderRadius: '40px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65)',
        }}
      >
        {/* Share / Stop Share Button */}
        {canShareScreen === true && (
          <Tooltip
            label={isSharing ? 'Parar compartilhamento de tela' : 'Compartilhar tela'}
            withArrow
          >
            <UnstyledButton
              onClick={onToggleShare}
              aria-label={isSharing ? 'Parar compartilhamento de tela' : 'Compartilhar tela'}
              className="floating-dock-share-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: '24px',
                backgroundColor: isSharing ? '#1e3a8a' : '#2563eb',
                border: isSharing ? '1px solid #3b82f6' : 'none',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {isSharing ? <IconStopShare size={18} /> : <IconScreen size={18} />}
              <Text size="xs" fw={600} c="#fff" visibleFrom="xs">
                {isSharing ? 'Parar' : 'Compartilhar'}
              </Text>
            </UnstyledButton>
          </Tooltip>
        )}

        {/* Screen Audio Mute / Unmute Toggle (only active if sharing and track exists) */}
        {isSharing && hasAudioTrack && (
          <Tooltip
            label={isAudioMuted ? 'Reativar áudio da tela' : 'Mutar áudio da tela'}
            withArrow
          >
            <UnstyledButton
              onClick={onToggleAudioMute}
              aria-label={isAudioMuted ? 'Reativar áudio da tela' : 'Mutar áudio da tela'}
              className="floating-dock-btn"
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isAudioMuted ? '#374151' : '#21262d',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: isAudioMuted ? '#f87171' : '#e6edf3',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {isAudioMuted ? <IconVolumeMute size={18} /> : <IconVolume size={18} />}
            </UnstyledButton>
          </Tooltip>
        )}

        {/* Copy Invite Link */}
        <Tooltip label={copied ? 'Link copiado!' : 'Copiar convite da sala'} withArrow>
          <UnstyledButton
            onClick={handleCopyLink}
            aria-label="Copiar link de convite"
            className="floating-dock-btn"
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: copied ? '#064e3b' : '#21262d',
              border: copied ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
              color: copied ? '#34d399' : '#e6edf3',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {copied ? <IconCheck size={18} /> : <IconLink size={18} />}
          </UnstyledButton>
        </Tooltip>

        {/* Participants drawer toggle */}
        <Tooltip label={`Participantes (${participantCount})`} withArrow>
          <UnstyledButton
            onClick={onOpenParticipants}
            aria-label={`Ver participantes (${participantCount})`}
            className="floating-dock-btn"
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#21262d',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#e6edf3',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              position: 'relative',
            }}
          >
            <IconUsers size={18} />
          </UnstyledButton>
        </Tooltip>

        {/* Settings button */}
        <Tooltip label="Configurações e diagnósticos" withArrow>
          <UnstyledButton
            onClick={onOpenSettings}
            aria-label="Configurações e diagnósticos"
            className="floating-dock-btn"
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#21262d',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#e6edf3',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <IconGear size={18} />
          </UnstyledButton>
        </Tooltip>

        {/* Leave Room Button */}
        <Tooltip label="Sair da sala" withArrow>
          <UnstyledButton
            onClick={onLeave}
            aria-label="Sair da sala"
            className="floating-dock-btn"
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <IconExit size={18} />
          </UnstyledButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
