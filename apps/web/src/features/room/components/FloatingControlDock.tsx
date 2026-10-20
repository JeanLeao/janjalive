import { HandCount } from './HandCount';
import React, { useState } from 'react';
import {
  Button,
  Box,
  UnstyledButton,
  Tooltip,
  Menu,
  Loader,
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
  IconQrCode,
} from './Icons';
import { copyRoomInviteUrl } from '../utils/invite-url';

export interface FloatingControlDockProps {
  onSwitchCapture?: () => void;
  switchPending?: boolean;
  switchRestoring?: boolean;
  onCancelSwitch?: () => void;
  capturePending?: boolean;
  isPaused?: boolean;
  pausePending?: boolean;
  onTogglePause?: () => void;
  isSharing: boolean;
  onToggleShare: () => void;
  hasAudioTrack: boolean;
  isAudioMuted: boolean;
  onToggleAudioMute: () => void;
  onOpenParticipants: () => void;
  participantCount: number;
  raisedHandCount?: number;
  onOpenSettings: () => void;
  onLeave: () => void;
  canShareScreen?: boolean | null;
  onOpenQrCode?: (triggerEl?: HTMLElement | null) => void;
}

export function FloatingControlDock({
  onSwitchCapture,
  switchPending,
  switchRestoring,
  onCancelSwitch,
  capturePending,
  isPaused,
  pausePending,
  onTogglePause,
  isSharing,
  onToggleShare,
  hasAudioTrack,
  isAudioMuted,
  onToggleAudioMute,
  onOpenParticipants,
  participantCount,
  raisedHandCount = 0,
  onOpenSettings,
  onLeave,
  canShareScreen,
  onOpenQrCode,
}: FloatingControlDockProps) {
  const [copied, setCopied] = useState(false);
  const settingsBtnRef = React.useRef<HTMLButtonElement>(null);

  const handleCopyLink = async () => {
    const success = await copyRoomInviteUrl();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
          flex-shrink: 0;
        }
        .floating-dock-primary { flex-shrink: 0; height: 42px; border-radius: 24px; background: #2563eb; }
        .floating-dock-bar button:hover:not(:disabled) { filter: brightness(1.15); }
        .floating-dock-bar button:active:not(:disabled) { filter: brightness(0.9); }
        @media (max-width: 600px) {
          .floating-dock-wrapper {
            bottom: max(16px, env(safe-area-inset-bottom, 16px)) !important;
            max-width: calc(100vw - 16px) !important;
          }
          .floating-dock-bar {
            gap: 2px !important;
            padding: 5px 6px !important;
          }
          .floating-dock-btn {
            width: 42px !important;
            height: 42px !important;
          }
          .floating-dock-primary .mantine-Button-section { margin-inline-end: 6px; }
          .floating-dock-primary {
            height: 42px !important;
            padding: 0 8px !important;
            font-size: 12px;
          }
        }
        @media (max-width: 360px) {
          .floating-dock-bar { padding: 5px 4px !important; }
          .floating-dock-btn, .floating-dock-primary { width: 40px !important; min-width: 40px; height: 42px !important; padding: 0 !important; }
          .floating-dock-primary-label { display: none; }
          .floating-dock-primary .mantine-Button-section { margin: 0; }
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
        {isSharing ? (
          <>
            <Tooltip label={isPaused ? 'Retomar transmissão' : 'Pausar transmissão — o navegador continua capturando'} multiline w={280} events={{ hover: true, focus: true, touch: false }} withArrow>
              <Button className="floating-dock-primary" px={14} loading={pausePending}
                disabled={!onTogglePause || switchPending} onClick={onTogglePause}
                aria-label={isPaused ? 'Retomar transmissão' : 'Pausar transmissão'}
                leftSection={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {isPaused ? <path d="m8 5 11 7-11 7z" /> : <><path d="M8 5v14" /><path d="M16 5v14" /></>}
                </svg>}>
                <span className="floating-dock-primary-label">{isPaused ? 'Retomar' : 'Pausar'}</span>
              </Button>
            </Tooltip>
            <Tooltip label="Parar compartilhamento de tela" events={{ hover: true, focus: true, touch: false }} withArrow>
              <UnstyledButton onClick={onToggleShare} aria-label="Parar compartilhamento de tela"
                className="floating-dock-btn" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
                  backgroundColor: '#21262d', border: '1px solid rgba(255,255,255,0.1)', color: '#e6edf3',
                }}>
                <IconStopShare size={18} />
              </UnstyledButton>
            </Tooltip>
          </>
        ) : canShareScreen === true && (
          <Tooltip label={capturePending ? 'Cancelar captura' : 'Compartilhar tela'} events={{ hover: true, focus: true, touch: false }} withArrow>
            <Button onClick={onToggleShare} className="floating-dock-primary" px={16}
              aria-label={capturePending ? 'Cancelar captura' : 'Compartilhar tela'}
              leftSection={<IconScreen size={18} />}>
              <span className="floating-dock-primary-label">{capturePending ? 'Cancelar' : 'Compartilhar'}</span>
            </Button>
          </Tooltip>
        )}

        {isSharing && (
          <Tooltip label={switchRestoring ? 'Restaurando transmissão…' : switchPending ? 'Cancelar troca' : 'Trocar tela'} events={{ hover: true, focus: true, touch: false }} withArrow>
            <UnstyledButton onClick={switchPending ? onCancelSwitch : onSwitchCapture}
              disabled={!switchPending && !onSwitchCapture} aria-label={switchRestoring ? 'Restaurando transmissão…' : switchPending ? 'Cancelar troca' : 'Trocar tela'}
              className="floating-dock-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#21262d', color: '#e6edf3', border: '1px solid rgba(255,255,255,0.1)' }}>
              {switchPending ? <Loader size={18} aria-hidden /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="18" height="13" rx="2" /><path d="M8 21h8M12 16v5M7 8h10m-3-3 3 3-3 3" />
              </svg>}
            </UnstyledButton>
          </Tooltip>
        )}

        {/* Screen Audio Mute / Unmute Toggle (only active if sharing and track exists) */}
        {isSharing && hasAudioTrack && (
          <Tooltip
            label={isAudioMuted ? 'Reativar áudio da tela' : 'Mutar áudio da tela'}
            events={{ hover: true, focus: true, touch: false }} withArrow
          >
            <UnstyledButton
              disabled={switchPending}
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
        {!isSharing && <Tooltip label={copied ? 'Link copiado!' : 'Copiar convite da sala'} events={{ hover: true, focus: true, touch: false }} withArrow>
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
        </Tooltip>}

        {/* Participants drawer toggle */}
        <Tooltip label={`Participantes (${participantCount})`} events={{ hover: true, focus: true, touch: false }} withArrow>
          <UnstyledButton
            onClick={onOpenParticipants}
            aria-label={`Ver participantes (${participantCount})${raisedHandCount ? `, ${raisedHandCount} ${raisedHandCount === 1 ? 'mão levantada' : 'mãos levantadas'}` : ''}`}
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
            {raisedHandCount > 0 && <span style={{ position: 'absolute', top: -8, right: -8, background: '#161b22', borderRadius: 8, padding: '1px 3px' }}><HandCount count={raisedHandCount} /></span>}
          </UnstyledButton>
        </Tooltip>

        {/* Settings button */}
        <Menu position="top" withinPortal>
          <Menu.Target>
            <Tooltip label="Configurações e convite" events={{ hover: true, focus: true, touch: false }} withArrow>
              <UnstyledButton
                ref={settingsBtnRef}
                aria-label="Configurações e convite"
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

          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => { settingsBtnRef.current?.focus(); onOpenSettings(); }}>Configurações e diagnósticos</Menu.Item>
            <Menu.Item onClick={handleCopyLink}>{copied ? 'Link copiado!' : 'Copiar link de convite'}</Menu.Item>
            {onOpenQrCode && (
              <Menu.Item
                onClick={() => onOpenQrCode(settingsBtnRef.current)}
                leftSection={<IconQrCode size={14} />}
              >
                Mostrar QR Code
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>

        {/* Leave Room Button */}
        <Tooltip label="Sair da sala" events={{ hover: true, focus: true, touch: false }} withArrow>
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
