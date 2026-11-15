import { CameraControl, type CameraControlProps } from './CameraControl';
import { HandCount } from './HandCount';
import React, { useState } from 'react';
import {
  Button,
  Box,
  UnstyledButton,
  Tooltip,
  Menu,
  Popover,
  SegmentedControl,
  Stack,
  Text,
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
  IconSliders,
} from './Icons';
import { QualityControls } from './QualityControls';
import {
  type QualitySelection,
  type VisualPriority,
  type QualityProfileKey,
  type FrameRate,
  QUALITY_PROFILES,
  normalizeQuality,
  resolveQuality,
  validFrameRates,
} from '@screen-room/protocol';
import { copyRoomInviteUrl } from '../utils/invite-url';

export interface FloatingControlDockProps {
  cameraRequestCount?: number;
  cameraControl?: CameraControlProps;
  collapsible?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
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
  quality?: QualitySelection;
  onChangeQuality?: (quality: QualitySelection) => void;
  qualityPending?: boolean;
  qualityNotice?: string | null;
  onOpenParticipants: () => void;
  participantCount: number;
  raisedHandCount?: number;
  onOpenSettings: () => void;
  onLeave: () => void;
  canShareScreen?: boolean | null;
  onOpenQrCode?: (triggerEl?: HTMLElement | null) => void;
}

export function FloatingControlDock({
  cameraRequestCount = 0,
  cameraControl,
  collapsible = false,
  expanded = true,
  onExpandedChange,
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
  quality,
  onChangeQuality,
  qualityPending,
  qualityNotice,
  onOpenParticipants,
  participantCount,
  raisedHandCount = 0,
  onOpenSettings,
  onLeave,
  canShareScreen,
  onOpenQrCode,
}: FloatingControlDockProps) {
  const actionsId = React.useId();
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
        .floating-dock-wrapper:has(.dock-toggle) { display: flex; align-items: center; gap: 4px; }
        .floating-dock-wrapper:has(.dock-toggle[aria-expanded="false"]) { bottom: env(safe-area-inset-bottom, 0px) !important; }
        .dock-toggle { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; color: #e6edf3; background: #161b22; border: 1px solid #484f58; border-radius: 50%; }

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
      {cameraControl?.camera.state === 'suspended' && <Box role="status" style={{
        position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
        width: 'min(300px, calc(100vw - 24px))', padding: '8px 12px', fontSize: 12,
        color: '#e6edf3', background: '#161b22', border: '1px solid #484f58', borderRadius: 12,
      }}>{cameraControl.camera.error}</Box>}
      {cameraControl?.camera.state === 'live' && <Box role="status" style={{
        position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
        color: '#7ee787', background: '#161b22', border: '1px solid #484f58', borderRadius: 16,
        padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap',
      }}>● Câmera ao vivo</Box>}
      <Box
        id={actionsId}
        hidden={!expanded}
        className="floating-dock-bar"
        style={{
          display: expanded ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
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

        {cameraControl && <CameraControl {...cameraControl} />}

        {/* Screen Audio Warning / Toggle */}
        {isSharing && !hasAudioTrack && (
          <Tooltip
            label="Transmissão sem áudio do sistema/aba. Para incluir áudio, selecione uma aba ou compartilhe o áudio do sistema."
            events={{ hover: true, focus: true, touch: false }} withArrow multiline w={220}
          >
            <Box
              aria-label="Aviso: transmissão sem áudio"
              tabIndex={0}
              role="status"
              className="floating-dock-btn"
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(217, 119, 6, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fbbf24',
                cursor: 'default',
              }}
            >
              <IconVolumeMute size={18} />
            </Box>
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

        {/* Quality Controls Popover (when sharing) */}
        {isSharing && quality && onChangeQuality && (() => {
          const profile = resolveQuality(quality);
          const allowedFps = validFrameRates(quality.priority, quality.profile);
          const updateQuality = (patch: Partial<QualitySelection>) => {
            onChangeQuality(normalizeQuality({ ...quality, ...patch }));
          };

          return (
            <Popover position="top" withArrow shadow="md" withinPortal trapFocus>
              <Popover.Target>
                <Tooltip label="Alterar qualidade da transmissão" events={{ hover: true, focus: true, touch: false }} withArrow>
                  <UnstyledButton
                    aria-label="Alterar qualidade da transmissão"
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
                    <IconSliders size={18} />
                  </UnstyledButton>
                </Tooltip>
              </Popover.Target>
              <Popover.Dropdown style={{ background: '#161b22', border: '1px solid #30363d', color: '#e6edf3', width: 320, padding: 14 }}>
                <Stack gap="sm">
                  <Text size="sm" fw={600} c="#e6edf3">Qualidade da tela</Text>

                  <div>
                    <Text size="xs" fw={500} c="#8b949e" mb={4}>Prioridade visual</Text>
                    <SegmentedControl
                      fullWidth
                      size="xs"
                      value={quality.priority}
                      disabled={qualityPending}
                      aria-label="Prioridade visual"
                      onChange={value => updateQuality({ priority: value as VisualPriority })}
                      data={[
                        { value: 'sharpness', label: 'Nitidez' },
                        { value: 'motion', label: 'Fluidez' },
                      ]}
                      styles={{
                        root: { background: '#0d1117', border: '1px solid #30363d' },
                        label: { minHeight: 32, display: 'grid', placeItems: 'center' },
                      }}
                    />
                  </div>

                  <div>
                    <Text size="xs" fw={500} c="#8b949e" mb={4}>Nível de qualidade</Text>
                    <SegmentedControl
                      fullWidth
                      size="xs"
                      value={quality.profile}
                      disabled={qualityPending}
                      aria-label="Nível de qualidade"
                      onChange={value => updateQuality({ profile: value as QualityProfileKey })}
                      data={Object.entries(QUALITY_PROFILES).map(([value, item]) => ({
                        value,
                        label: item.label,
                      }))}
                      styles={{
                        root: { background: '#0d1117', border: '1px solid #30363d' },
                        label: { minHeight: 32, display: 'grid', placeItems: 'center' },
                      }}
                    />
                  </div>

                  <div>
                    <Text size="xs" fw={500} c="#8b949e" mb={4}>Limite de taxa de quadros (FPS)</Text>
                    <SegmentedControl
                      fullWidth
                      size="xs"
                      value={String(quality.fps)}
                      disabled={qualityPending}
                      aria-label="Limite de FPS"
                      onChange={value => updateQuality({ fps: Number(value) as FrameRate })}
                      data={allowedFps.map(fps => ({
                        value: String(fps),
                        label: `${fps} FPS`,
                      }))}
                      styles={{
                        root: { background: '#0d1117', border: '1px solid #30363d' },
                        label: { minHeight: 32, display: 'grid', placeItems: 'center' },
                      }}
                    />
                  </div>

                  <Text size="xs" c="#8b949e" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                    {profile.width} × {profile.height} ({profile.height}p) · {quality.fps} FPS · {profile.maxBitrate / 1_000_000} Mbps
                  </Text>

                  {qualityPending && <Text size="xs" c="#c9d1d9">Aplicando qualidade…</Text>}
                  {!qualityPending && qualityNotice && <Text size="xs" c="#e3b341">{qualityNotice}</Text>}
                </Stack>
              </Popover.Dropdown>
            </Popover>
          );
        })()}

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
            {cameraRequestCount > 0 && <span aria-label={`${cameraRequestCount} solicitações de câmera`} style={{ position: 'absolute', top: -8, left: -8, padding: '1px 4px', borderRadius: 8, background: '#1f6feb', color: 'white', fontSize: 11 }}>{cameraRequestCount}</span>}
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
      {collapsible && <Tooltip label={expanded ? 'Ocultar controles da sala' : 'Mostrar controles da sala'} events={{ hover: true, focus: true, touch: false }} withArrow>
        <UnstyledButton className="dock-toggle" style={{ marginInline: 'auto' }}
          aria-label={expanded ? 'Ocultar controles da sala' : 'Mostrar controles da sala'}
          aria-expanded={expanded} aria-controls={actionsId}
          onClick={() => onExpandedChange?.(!expanded)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={expanded ? 'm6 9 6 6 6-6' : 'm6 15 6-6 6 6'} /></svg>
        </UnstyledButton>
      </Tooltip>}
    </Box>
  );
}
