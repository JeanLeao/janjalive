import React, { useState } from 'react';
import {
  Drawer,
  Box,
  Stack,
  Group,
  Text,
  UnstyledButton,
  Button,
  Code,
  Tabs,
  Switch,
} from '@mantine/core';
import { QUALITY_PROFILES, type QualitySelection } from '@screen-room/protocol';
import { QualityControls } from './QualityControls';
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
  requestedQuality?: QualitySelection;
  qualityVerification?: 'pending' | 'verified' | 'partial' | null;
  onChangeQuality: (newQuality: QualitySelection) => void;
  networkStats: NetworkMetrics | null;
  connectionStatus: ConnectionState;
  diagnostics: DiagnosticEntry[];
  hasAudioTrack: boolean;
  isAudioMuted: boolean;
  onToggleAudioMute: () => void;
  isSharing: boolean;
  initialTab?: string;
  shortcutsEnabled?: boolean;
  onToggleShortcuts?: (enabled: boolean) => void;
}

export function SettingsDrawer({
  opened,
  onClose,
  quality,
  requestedQuality = quality,
  qualityVerification,
  onChangeQuality,
  networkStats,
  connectionStatus,
  diagnostics,
  hasAudioTrack,
  isAudioMuted,
  onToggleAudioMute,
  isSharing,
  initialTab = 'quality',
  shortcutsEnabled = false,
  onToggleShortcuts,
}: SettingsDrawerProps) {
  const measurementLabel = { unavailable: 'Estatísticas indisponíveis', 'no-report': 'Sem amostra', unsupported: 'Campo não fornecido pelo navegador', pending: 'Medição ainda não estabelecida', measured: 'Medido' };
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

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
      aria-label="Configurações"
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
          <Drawer.Title
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: '#ffffff',
              margin: 0,
            }}
          >
            Configurações
          </Drawer.Title>
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
            <QualityControls quality={quality} onChange={onChangeQuality} />
            <Text size="xs" c="dimmed">
              Preferência: {QUALITY_PROFILES[quality.profile].label} · {quality.fps} FPS.
              {' '}Proteção e recuperação automática gradual de qualidade.
              {requestedQuality.profile !== quality.profile && ` Perfil temporário solicitado: ${QUALITY_PROFILES[requestedQuality.profile].label} · ${requestedQuality.fps} FPS.`}
              {qualityVerification === 'pending' && ' Verificando limites solicitados…'}
              {qualityVerification === 'verified' && ' Limites aplicados verificados; a qualidade transmitida pode variar.'}
              {qualityVerification === 'partial' && ' Aplicação dos limites incompleta ou não verificada. Consulte o diagnóstico.'}
            </Text>

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
                  {networkStats?.rttMs != null ? `${networkStats.rttMs} ms` : '–'}
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
                  c={networkStats?.lossPercent != null && networkStats.lossPercent > 5 ? '#f87171' : '#e6edf3'}
                  mt={4}
                >
                  {networkStats?.lossPercent != null ? `${networkStats.lossPercent.toFixed(1)}%` : '–'}
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
                  {networkStats?.bitrateKbps != null ? `${networkStats.bitrateKbps} kbps` : '–'}
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
                  Conexões WebRTC estabelecidas
                </Text>
                <Text size="lg" fw={700} c="#fff" mt={4}>
                  {networkStats?.activeConnections ?? '–'}
                </Text>
              </Box>
            </Box>

            <Text size="xs" c="#8c959f">
              WebSocket: {connectionStatus}. Resumo das amostras disponíveis; não confirma todos os participantes.
              {' '}– indica medição indisponível ou ainda não estabelecida.
            </Text>
            {networkStats?.peers.map(peer => (
              <Box key={peer.peerId} style={{ overflowWrap: 'anywhere' }}>
                <Text size="sm" fw={600}>{peer.peerId}</Text>
                <Text size="xs" c="#8c959f">
                  WebRTC: {peer.connection} · ICE: {peer.ice} · SDP: {peer.signaling}
                  {' · '}{peer.negotiated ? 'Descrições aplicadas' : 'Negociação ainda não estabelecida'}
                </Text>
                <Text size="xs" c="#8c959f">
                  Recepção: {peer.receiving === null ? 'Indeterminada' : peer.receiving ? 'Bytes recebidos' : 'Sem bytes medidos'}
                  {' · '}Frames decodificados: {peer.framesDecoded ?? '–'}
                  {' · '}Perda: {peer.lossPercent === null ? measurementLabel[peer.measurement.loss] : `${peer.lossPercent.toFixed(1)}%`}
                  {' · '}RTT: {peer.rttMs === null ? measurementLabel[peer.measurement.rtt] : `${peer.rttMs} ms`}
                  {' · '}Bitrate: {peer.bitrateKbps === null ? measurementLabel[peer.measurement.bitrate] : `${peer.bitrateKbps} kbps`}
                  {peer.stats === 'unavailable' && ' · Estatísticas indisponíveis'}
                </Text>
              </Box>
            ))}
            <Text size="xs" c="#8c959f">Apresentação no palco: consulte first-frame-presented nos eventos. Sem callback suportado, permanece indeterminada. Prévia local e miniaturas não são observadas.</Text>

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
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <Group justify="space-between" align="center" mb="xs">
                <div>
                  <Text fw={600} size="sm" c="#fff">
                    Atalhos de uma tecla
                  </Text>
                  <Text size="xs" c="#8c959f">
                    {shortcutsEnabled ? 'Ativados' : 'Desativados por padrão (WCAG 2.1.4)'}
                  </Text>
                </div>
                <Switch
                  checked={shortcutsEnabled}
                  onChange={(event) => onToggleShortcuts?.(event.currentTarget.checked)}
                  aria-label="Ativar atalhos de teclado de uma tecla"
                  size="sm"
                  color="blue"
                />
              </Group>

              <Text size="xs" c="#8c959f" mb="sm" style={{ lineHeight: 1.45 }}>
                {shortcutsEnabled
                  ? 'Atalhos ativos. Pressione as teclas abaixo quando não estiver digitando.'
                  : 'Recurso desativado. Ative para navegar rapidamente com teclas únicas.'}
              </Text>

              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="#d0d7de">Próxima transmissão principal</Text>
                  <Code style={{ backgroundColor: '#161b22', color: '#e6edf3', border: '1px solid rgba(255, 255, 255, 0.12)', minWidth: 26, textAlign: 'center' }}>N</Code>
                </Group>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="#d0d7de">Transmissão principal anterior</Text>
                  <Code style={{ backgroundColor: '#161b22', color: '#e6edf3', border: '1px solid rgba(255, 255, 255, 0.12)', minWidth: 26, textAlign: 'center' }}>P</Code>
                </Group>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="#d0d7de">Alternar fullscreen do palco</Text>
                  <Code style={{ backgroundColor: '#161b22', color: '#e6edf3', border: '1px solid rgba(255, 255, 255, 0.12)', minWidth: 26, textAlign: 'center' }}>F</Code>
                </Group>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="#d0d7de">Abrir ou focar o painel de interações</Text>
                  <Code style={{ backgroundColor: '#161b22', color: '#e6edf3', border: '1px solid rgba(255, 255, 255, 0.12)', minWidth: 26, textAlign: 'center' }}>I</Code>
                </Group>
              </Stack>
            </Box>

            <Box
              style={{
                marginTop: '0.5rem',
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
