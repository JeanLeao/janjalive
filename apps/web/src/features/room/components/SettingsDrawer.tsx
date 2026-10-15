import React, { useState } from 'react';
import {
  Drawer,
  Box,
  Stack,
  Group,
  Text,
  UnstyledButton,
  Button,
  NativeSelect,
  SegmentedControl,
  Code,
  Tabs,
} from '@mantine/core';
import {
  QUALITY_PROFILES,
  type QualitySelection,
  type VisualPriority,
  type QualityProfileKey,
  type FrameRate,
  normalizeQuality, resolveQuality, validFrameRates,
} from '@screen-room/protocol';
import type {
  ConnectionState,
  DiagnosticEntry,
  NetworkMetrics,
} from '../types';
import {
  IconClose,
  IconSignal,
  IconVolume,
  IconVolumeMute,
  IconCopy,
  IconCheck,
  IconShield,
  IconInfo,
} from './Icons';

export interface SettingsDrawerProps {
  opened: boolean;
  onClose: () => void;
  quality: QualitySelection;
  onChangeQuality: (newQuality: QualitySelection) => void;
  networkStats: NetworkMetrics | null;
  connectionStatus: ConnectionState;
  diagnostics: DiagnosticEntry[];
  hasAudioTrack: boolean;
  isAudioMuted: boolean;
  onToggleAudioMute: () => void;
  isSharing: boolean;
  initialTab?: string;
}

export function SettingsDrawer({
  opened,
  onClose,
  quality,
  onChangeQuality,
  networkStats,
  connectionStatus,
  diagnostics,
  hasAudioTrack,
  isAudioMuted,
  onToggleAudioMute,
  isSharing,
  initialTab = 'quality',
}: SettingsDrawerProps) {
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const profile = resolveQuality(quality);
  const update = (patch: Partial<QualitySelection>) => onChangeQuality(normalizeQuality({ ...quality, ...patch }));

  const handleCopyLogs = async () => {
    if (typeof window !== 'undefined') {
      const formatted = diagnostics
        .map((e) => {
          const detailStr = Object.entries(e.details)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(' ');
          return `${e.timestamp} [${e.event}] ${detailStr}`.trim();
        })
        .join('\n');
      try {
        await navigator.clipboard.writeText(formatted);
        setCopiedLogs(true);
        setTimeout(() => setCopiedLogs(false), 2000);
      } catch (err) {
        console.error('Failed to copy logs:', err);
      }
    }
  };


  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="md"
      withCloseButton={false}
      styles={{
        content: {
          backgroundColor: '#0d1117',
          color: '#e6edf3',
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
        },
        body: {
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        },
      }}
    >
      {/* Drawer Header */}
      <Box
        style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <Text fw={700} size="md" c="#ffffff">
            Configurações
          </Text>
          <Text size="xs" c="#8c959f">
            Transmissão, áudio e diagnóstico
          </Text>
        </div>

        <UnstyledButton
          onClick={onClose}
          aria-label="Fechar configurações"
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8c959f',
            cursor: 'pointer',
          }}
        >
          <IconClose size={18} />
        </UnstyledButton>
      </Box>

      {/* Tabs */}
      <style>{`
        .settings-drawer-tabs .mantine-Tabs-tab[data-active] {
          color: #60a5fa !important;
          border-color: #2563eb !important;
        }
      `}</style>
      <Tabs
        color="blue"
        className="settings-drawer-tabs"
        defaultValue={initialTab}
        styles={{
          root: { display: 'flex', flexDirection: 'column', flex: 1 },
          list: {
            padding: '0 1.25rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: '#0d1117',
          },
          tab: {
            color: '#8c959f',
            fontWeight: 600,
            fontSize: '0.85rem',
            padding: '0.85rem 0.75rem',
          },
          panel: {
            flex: 1,
            overflowY: 'auto',
            padding: '1.25rem',
          },
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="quality">Qualidade</Tabs.Tab>
          <Tabs.Tab value="audio">Áudio</Tabs.Tab>
          <Tabs.Tab value="network">Rede & Métricas</Tabs.Tab>
          <Tabs.Tab value="about">Sobre</Tabs.Tab>
        </Tabs.List>

        {/* Tab 1: Qualidade */}
        <Tabs.Panel value="quality">
          <Stack gap="md">
            <div>
              <Text fw={600} size="sm" c="#fff" mb={8}>Prioridade visual</Text>
              <SegmentedControl fullWidth value={quality.priority}
                aria-label="Prioridade visual"
                onChange={value => update({ priority: value as VisualPriority })}
                data={[{ value: 'sharpness', label: 'Nitidez' }, { value: 'motion', label: 'Fluidez' }]}
                styles={{ root: { background: '#161b22' }, label: { minHeight: 36, display: 'grid', placeItems: 'center' } }} />
              <Text size="xs" c="#8c959f" mt={8}>
                {quality.priority === 'sharpness' ? 'Prioriza a leitura de textos, códigos e documentos.' : 'Prioriza movimento, animações e navegação dinâmica.'}
              </Text>
            </div>
            <NativeSelect label="Nível de qualidade" value={quality.profile}
              onChange={event => update({ profile: event.currentTarget.value as QualityProfileKey })}
              data={Object.entries(QUALITY_PROFILES).map(([value, item]) => ({ value, label: item.label }))}
              styles={{ input: { minHeight: 44, background: '#161b22', color: '#e6edf3' } }} />
            <NativeSelect label="Limite de FPS" value={quality.fps}
              onChange={event => update({ fps: Number(event.currentTarget.value) as FrameRate })}
              data={validFrameRates(quality.priority, quality.profile).map(fps => ({ value: String(fps), label: `${fps} FPS` }))}
              styles={{ input: { minHeight: 44, background: '#161b22', color: '#e6edf3' } }} />
            <div role="status" aria-live="polite">
              <Text size="sm" c="#e6edf3">Até {profile.height}p · {quality.fps} FPS · {profile.maxBitrate / 1_000_000} Mbps</Text>
              <Text size="xs" c="#8c959f" mt={4}>Limites máximos. A fonte, o navegador e a rede determinam a qualidade efetiva.</Text>
            </div>

            <Box
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <Group gap="xs" align="flex-start">
                <IconInfo size={16} style={{ color: '#60a5fa', marginTop: 2, flexShrink: 0 }} />
                <Text size="xs" c="#8c959f" style={{ lineHeight: 1.45 }}>
                  <strong>Proteção de estabilidade:</strong> Caso ocorra perda acentuada de pacotes na rede durante a transmissão, o sistema reduz automaticamente a qualidade para preservar a continuidade do vídeo.
                </Text>
              </Group>
            </Box>
          </Stack>
        </Tabs.Panel>

        {/* Tab 2: Áudio */}
        <Tabs.Panel value="audio">
          <Stack gap="md">
            <div>
              <Text fw={600} size="sm" c="#fff" mb={4}>
                Áudio da tela
              </Text>
              <Text size="xs" c="#8c959f">
                O áudio transmitido provém da aba do navegador ou janela compartilhada. O microfone pessoal nunca é requisitado.
              </Text>
            </div>

            <Box
              style={{
                padding: '14px',
                borderRadius: '8px',
                backgroundColor: '#161b22',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <Group justify="space-between" align="center">
                <div>
                  <Text size="sm" fw={600} c="#fff">
                    {hasAudioTrack ? 'Trilha de áudio ativa' : 'Sem áudio na transmissão'}
                  </Text>
                  <Text size="xs" c="#8c959f" mt={2}>
                    {hasAudioTrack
                      ? isAudioMuted
                        ? 'O áudio está mutado para os espectadores.'
                        : 'O som da tela está sendo reproduzido aos espectadores.'
                      : 'Nenhuma faixa de som foi enviada pelo navegador.'}
                  </Text>
                </div>

                {isSharing && hasAudioTrack && (
                  <Button
                    size="xs"
                    variant={isAudioMuted ? 'filled' : 'default'}
                    color={isAudioMuted ? 'red' : 'gray'}
                    leftSection={isAudioMuted ? <IconVolumeMute size={14} /> : <IconVolume size={14} />}
                    onClick={onToggleAudioMute}
                  >
                    {isAudioMuted ? 'Reativar' : 'Mutar'}
                  </Button>
                )}
              </Group>
            </Box>

            <Box
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <Text size="xs" c="#8c959f">
                <strong>Dica:</strong> No Chrome e Edge, selecione "Aba do Chrome" ao compartilhar para garantir a transmissão de áudio em sincronia com o vídeo.
              </Text>
            </Box>
          </Stack>
        </Tabs.Panel>

        {/* Tab 3: Rede & Métricas */}
        <Tabs.Panel value="network">
          <Stack gap="md">
            <div>
              <Text fw={600} size="sm" c="#fff" mb={4}>
                Métricas de conexão em tempo real
              </Text>
              <Text size="xs" c="#8c959f">
                Estatísticas obtidas diretamente da camada WebRTC do navegador.
              </Text>
            </div>

            {/* Metrics 4-tile grid */}
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '10px',
              }}
            >
              <Box
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: '#161b22',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <Text size="xs" c="#8c959f">
                  Latência (RTT)
                </Text>
                <Text size="lg" fw={700} c="#fff" mt={4}>
                  {networkStats?.rttMs ? `${networkStats.rttMs} ms` : '–'}
                </Text>
              </Box>

              <Box
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: '#161b22',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <Text size="xs" c="#8c959f">
                  Perda de pacotes
                </Text>
                <Text
                  size="lg"
                  fw={700}
                  c={networkStats && networkStats.lossPercent > 5 ? '#f87171' : '#22c55e'}
                  mt={4}
                >
                  {networkStats ? `${networkStats.lossPercent.toFixed(1)}%` : '0%'}
                </Text>
              </Box>

              <Box
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: '#161b22',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <Text size="xs" c="#8c959f">
                  Taxa de bits
                </Text>
                <Text size="lg" fw={700} c="#fff" mt={4}>
                  {networkStats?.bitrateKbps ? `${networkStats.bitrateKbps} kbps` : '–'}
                </Text>
              </Box>

              <Box
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: '#161b22',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <Text size="xs" c="#8c959f">
                  Conexões ativas
                </Text>
                <Text size="lg" fw={700} c="#fff" mt={4}>
                  {networkStats ? networkStats.activeConnections : (connectionStatus === 'connected' ? 1 : 0)}
                </Text>
              </Box>
            </Box>

            {/* Diagnostic Event Logs */}
            <Box
              style={{
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: '#161b22',
              }}
            >
              <Group
                justify="space-between"
                align="center"
                style={{
                  padding: '8px 14px',
                  borderBottom: showLogs ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                }}
              >
                <UnstyledButton
                  onClick={() => setShowLogs(!showLogs)}
                  aria-expanded={showLogs}
                  aria-label="Expandir ou recolher eventos técnicos"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    flex: 1,
                  }}
                >
                  <Text size="xs" fw={600} c="#fff">
                    Eventos técnicos ({diagnostics.length})
                  </Text>
                  <Text size="xs" c="#8c959f" aria-hidden="true">
                    {showLogs ? '▲' : '▼'}
                  </Text>
                </UnstyledButton>

                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  onClick={handleCopyLogs}
                  leftSection={copiedLogs ? <IconCheck size={12} /> : <IconCopy size={12} />}
                  aria-label={copiedLogs ? 'Logs copiados' : 'Copiar logs de eventos técnicos'}
                >
                  {copiedLogs ? 'Copiado' : 'Copiar'}
                </Button>
              </Group>

              {showLogs && (
                <Code
                  block
                  style={{
                    backgroundColor: '#080a0f',
                    color: '#93c5fd',
                    maxHeight: 180,
                    overflowY: 'auto',
                    fontSize: '0.75rem',
                    padding: '10px',
                    margin: 0,
                  }}
                >
                  {diagnostics.length === 0
                    ? 'Aguardando eventos...'
                    : diagnostics
                        .slice(-25)
                        .map(
                          (e) =>
                            `${e.timestamp.slice(11, 19)} [${e.event}] ${JSON.stringify(e.details)}`
                        )
                        .join('\n')}
                </Code>
              )}
            </Box>
          </Stack>
        </Tabs.Panel>

        {/* Tab 4: Sobre */}
        <Tabs.Panel value="about">
          <Stack gap="md">
            <div>
              <Text fw={600} size="sm" c="#fff" mb={4}>
                Sobre o Screen Room
              </Text>
              <Text size="xs" c="#8c959f">
                Alternativa rápida e focada para visualização de telas em tempo real.
              </Text>
            </div>

            <Stack gap="xs">
              <Group gap="xs">
                <IconShield size={16} style={{ color: '#60a5fa' }} />
                <Text size="xs" c="#d0d7de">
                  WebRTC P2P Mesh com criptografia de ponta a ponta (DTLS-SRTP).
                </Text>
              </Group>

              <Group gap="xs">
                <IconSignal size={16} style={{ color: '#60a5fa' }} />
                <Text size="xs" c="#d0d7de">
                  Servidores STUN e TURN configurados para travessia de NAT e firewalls corporativos.
                </Text>
              </Group>
            </Stack>

            <Box
              style={{
                marginTop: '1rem',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <Text size="xs" c="#8c959f">
                Versão: 0.2.0 · Protocolo: @screen-room/protocol
              </Text>
            </Box>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Drawer>
  );
}
