import { HandCount } from './HandCount';
import React, { useState } from 'react';
import {
  Box,
  Group,
  Text,
  UnstyledButton,
  Tooltip,
  Menu,
} from '@mantine/core';
import type { ConnectionState } from '../types';
import {
  IconScreen,
  IconCopy,
  IconCheck,
  IconUsers,
  IconGear,
  IconDots,
  IconExit,
  IconLink,
} from './Icons';

export interface RoomHeaderProps {
  roomId: string;
  participantCount: number;
  raisedHandCount?: number;
  connectionStatus: ConnectionState;
  onOpenParticipants: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
  /** Acesso social (chat e reações), posicionado junto aos participantes. */
  interactions?: React.ReactNode;
}

export function RoomHeader({
  roomId,
  participantCount,
  raisedHandCount = 0,
  connectionStatus,
  onOpenParticipants,
  onOpenSettings,
  onLeave,
  interactions,
}: RoomHeaderProps) {
  const [copied, setCopied] = useState(false);

  const shortRoomId = roomId.length > 12 ? roomId.slice(0, 8) : roomId;

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

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return '#22c55e'; // green
      case 'connecting':
        return '#eab308'; // yellow
      default:
        return '#ef4444'; // red
    }
  };

  const getStatusLabel = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Conectado';
      case 'connecting':
        return 'Conectando';
      case 'disconnected':
        return 'Desconectado';
      case 'error':
        return 'Erro';
      default:
        return 'Pronto';
    }
  };

  return (
    <Box
      component="header"
      className="room-header-root"
      style={{
        height: '56px',
        padding: '0 1.25rem',
        backgroundColor: '#0d1117',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 20,
        flexShrink: 0,
      }}
    >
      <style>{`
        .room-header-brand-title {
          display: none;
          color: #ffffff;
          letter-spacing: -0.01em;
        }
        @media (min-width: 480px) {
          .room-header-brand-title {
            display: block;
          }
        }
        @media (max-width: 600px) {
          .room-header-root {
            padding: 0 0.65rem !important;
          }
          .room-header-context { gap: 0 !important; margin-right: 6px; }
          .room-header-brand-title { display: none !important; }
          .room-header-room-pill { min-width: 0; flex-shrink: 1 !important; }
          .room-header-room-pill svg { flex-shrink: 0; }
          .room-header-status-label {
            display: none !important;
          }
          .room-header-settings-standalone {
            display: none !important;
          }
          .room-header-actions {
            gap: 4px !important;
          }
        }
        @media (max-width: 360px) {
          .room-header-root { flex-wrap: wrap; height: auto !important; padding-block: 6px !important; gap: 6px; }
          .room-header-context { flex-basis: 100% !important; }
          .room-header-actions { margin-left: auto; }
        }
        @media (max-width: 420px) {
          .room-header-pill-prefix {
            display: none;
          }
          .room-header-brand-mark {
            display: none !important;
          }
        }
      `}</style>
      {/* Left: Brand & Room Context Pill */}
      <Group gap="xs" align="center" wrap="nowrap" className="room-header-context" style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
        <Group gap="xs" align="center" wrap="nowrap">
          <Box
            className="room-header-brand-mark"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            <IconScreen size={16} />
          </Box>
          <Text
            fw={700}
            size="sm"
            className="room-header-brand-title"
          >
            Screen Room
          </Text>
        </Group>

        {/* Room Pill */}
        <Tooltip label={copied ? 'Link copiado!' : 'Clique para copiar o link da sala'} withArrow>
          <UnstyledButton
            onClick={handleCopyLink}
            className="room-header-room-pill"
            aria-label="Copiar link da sala"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#161b22',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '5px 10px',
              borderRadius: '20px',
              cursor: 'pointer',
              minHeight: '32px',
              flexShrink: 0,
              transition: 'background-color 0.15s ease, border-color 0.15s ease',
            }}
          >
            <Text size="xs" c="#8c959f" fw={500} truncate>
              <span className="room-header-pill-prefix">sala • </span><span style={{ color: '#e6edf3', fontWeight: 600 }}>{shortRoomId}</span>
            </Text>
            {copied ? (
              <IconCheck size={13} style={{ color: '#22c55e' }} />
            ) : (
              <IconCopy size={13} style={{ color: '#8c959f' }} />
            )}
          </UnstyledButton>
        </Tooltip>
      </Group>

      {/* Right: Participant Count, Settings, Status */}
      <Group gap="xs" align="center" wrap="nowrap" className="room-header-actions" style={{ flexShrink: 0 }}>
        {/* Connection status pill */}
        <Tooltip label={`Status da conexão: ${getStatusLabel()}`} withArrow>
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 8px',
              borderRadius: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              minHeight: '30px',
            }}
          >
            <Box
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: getStatusColor(),
                flexShrink: 0,
              }}
            />
            <Text size="xs" c="#8c959f" fw={500} className="room-header-status-label">
              {getStatusLabel()}
            </Text>
          </Box>
        </Tooltip>

        {interactions}

        {/* Participant cluster button */}
        <Tooltip label="Ver participantes" withArrow>
          <UnstyledButton
            onClick={onOpenParticipants}
            aria-label={`Ver participantes (${participantCount})${raisedHandCount ? `, ${raisedHandCount} ${raisedHandCount === 1 ? 'mão levantada' : 'mãos levantadas'}` : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: '#161b22',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#e6edf3',
              cursor: 'pointer',
              minHeight: '36px',
              minWidth: '44px',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <IconUsers size={16} style={{ color: '#8c959f' }} />
            <Text size="xs" fw={600}>
              {participantCount}
            </Text>
            <HandCount count={raisedHandCount} />
          </UnstyledButton>
        </Tooltip>

        {/* Settings button (standalone on desktop, hidden on mobile in favor of menu/dock) */}
        <Tooltip label="Configurações e diagnósticos" withArrow>
          <UnstyledButton
            onClick={onOpenSettings}
            aria-label="Abrir configurações e diagnósticos"
            className="room-header-settings-standalone"
            style={{
              width: 36,
              height: 36,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#161b22',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#8c959f',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <IconGear size={16} />
          </UnstyledButton>
        </Tooltip>

        {/* More actions menu */}
        <Menu shadow="md" width={180} position="bottom-end">
          <Menu.Target>
            <UnstyledButton
              aria-label="Mais opções da sala"
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                color: '#8c959f',
                cursor: 'pointer',
              }}
            >
              <IconDots size={16} />
            </UnstyledButton>
          </Menu.Target>

          <Menu.Dropdown
            style={{
              backgroundColor: '#161b22',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#e6edf3',
            }}
          >
            <Menu.Item
              leftSection={<IconLink size={14} />}
              onClick={handleCopyLink}
              style={{ fontSize: '0.82rem' }}
            >
              Copiar link
            </Menu.Item>
            <Menu.Item
              leftSection={<IconGear size={14} />}
              onClick={onOpenSettings}
              style={{ fontSize: '0.82rem' }}
            >
              Configurações
            </Menu.Item>
            <Menu.Divider style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }} />
            <Menu.Item
              color="red"
              leftSection={<IconExit size={14} />}
              onClick={onLeave}
              style={{ fontSize: '0.82rem' }}
            >
              Sair da sala
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Box>
  );
}
