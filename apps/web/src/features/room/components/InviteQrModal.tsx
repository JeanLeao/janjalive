import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  Box,
  Text,
  Group,
  Button,
  TextInput,
  Alert,
  Tooltip,
  ActionIcon,
  Stack,
} from '@mantine/core';
import { QRCodeSVG } from 'qrcode.react';
import { IconCopy, IconCheck } from './Icons';
import {
  getRoomInviteUrl,
  isLocalAddress,
  copyRoomInviteUrl,
} from '../utils/invite-url';

export interface InviteQrModalProps {
  opened: boolean;
  onClose: () => void;
  roomId?: string;
  triggerElement?: HTMLElement | null;
  isProtected?: boolean;
  roomKey?: string;
}

export function InviteQrModal({
  opened,
  onClose,
  roomId,
  triggerElement,
  isProtected,
  roomKey,
}: InviteQrModalProps) {
  const [inviteUrl, setInviteUrl] = useState<string>(() => (typeof window !== 'undefined' ? getRoomInviteUrl() : ''));
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [keyCopyStatus, setKeyCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [copyAnnouncement, setCopyAnnouncement] = useState<string>('');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<HTMLElement | null>(null);

  // Focus tracking to restore focus to origin control on close
  useEffect(() => {
    if (opened) {
      const active = triggerElement || (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
      if (active && active.closest('.mantine-Menu-dropdown')) {
        const dropdown = active.closest('.mantine-Menu-dropdown');
        const labelledBy = dropdown?.getAttribute('aria-labelledby');
        const menuTarget = labelledBy ? document.getElementById(labelledBy) : null;
        originRef.current = (menuTarget as HTMLElement) || active;
      } else {
        originRef.current = active;
      }

      setInviteUrl(getRoomInviteUrl());
      setCopyStatus('idle');
      setCopyAnnouncement('');
    } else if (originRef.current) {
      const el = originRef.current;
      originRef.current = null;
      requestAnimationFrame(() => {
        if (el && el.isConnected) {
          el.focus();
        }
      });
    }
  }, [opened, triggerElement]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      if (keyCopyTimeoutRef.current) {
        clearTimeout(keyCopyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyKey = async () => {
    if (!roomKey) return;
    try {
      await navigator.clipboard.writeText(roomKey);
      setKeyCopyStatus('copied');
      setCopyAnnouncement('Chave de acesso copiada para a área de transferência.');
      if (keyCopyTimeoutRef.current) clearTimeout(keyCopyTimeoutRef.current);
      keyCopyTimeoutRef.current = setTimeout(() => {
        setKeyCopyStatus('idle');
      }, 2000);
    } catch {
      setKeyCopyStatus('error');
      setCopyAnnouncement('Não foi possível copiar a chave de acesso.');
      if (keyCopyTimeoutRef.current) clearTimeout(keyCopyTimeoutRef.current);
      keyCopyTimeoutRef.current = setTimeout(() => {
        setKeyCopyStatus('idle');
      }, 3000);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      const success = await copyRoomInviteUrl(inviteUrl);
      if (success) {
        setCopyStatus('copied');
        setCopyAnnouncement('Link copiado para a área de transferência.');
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => {
          setCopyStatus('idle');
        }, 2000);
      } else {
        setCopyStatus('error');
        setCopyAnnouncement('Não foi possível copiar o link.');
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => {
          setCopyStatus('idle');
        }, 3000);
      }
    } catch {
      setCopyStatus('error');
      setCopyAnnouncement('Não foi possível copiar o link.');
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopyStatus('idle');
      }, 3000);
    }
  };

  const isLocal = isLocalAddress(inviteUrl);
  const hostname = (() => {
    try {
      return new URL(inviteUrl).hostname;
    } catch {
      return '';
    }
  })();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Convidar para a sala"
      centered
      size={460}
      returnFocus={false}
      closeButtonProps={{
        'aria-label': 'Fechar modal de convite',
      }}
      styles={{
        content: {
          backgroundColor: '#161b22',
          color: '#e6edf3',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.65)',
        },
        header: {
          backgroundColor: '#161b22',
          color: '#ffffff',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '16px 20px',
        },
        title: {
          fontWeight: 700,
          fontSize: '1.1rem',
          letterSpacing: '-0.01em',
        },
        body: {
          padding: '20px',
        },
      }}
    >
      <Stack gap="md" align="center">
        {/* Instruction text */}
        <Text size="sm" c="#8c959f" ta="center" style={{ lineHeight: 1.5, width: '100%' }}>
          Escaneie o QR Code com a câmera do celular para entrar nesta sala ou copie o link abaixo.
        </Text>

        {/* QR Code Container */}
        {inviteUrl ? (
          <Box
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
            }}
          >
            <Box
              style={{
                backgroundColor: '#ffffff',
                padding: '16px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
                maxWidth: '100%',
              }}
            >
              <QRCodeSVG
                value={inviteUrl}
                size={200}
                level="M"
                marginSize={1}
                bgColor="#ffffff"
                fgColor="#000000"
                role="img"
                aria-label={`QR Code com o endereço da sala: ${inviteUrl}`}
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  height: 'auto',
                }}
              />
            </Box>

            {/* Local address notice */}
            {isLocal && (
              <Text
                size="xs"
                c="#8c959f"
                ta="center"
                style={{
                  lineHeight: 1.45,
                  maxWidth: 360,
                  padding: '6px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                A sala está em um endereço local ({hostname}). Dispositivos em outras redes podem não conseguir acessá-la diretamente.
              </Text>
            )}
          </Box>
        ) : (
          <Alert
            color="red"
            variant="light"
            styles={{
              root: {
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                borderColor: 'rgba(220, 38, 38, 0.25)',
                color: '#f87171',
                borderRadius: 8,
                width: '100%',
              },
            }}
          >
            Não foi possível obter o endereço da sala para gerar o QR Code.
          </Alert>
        )}

        {/* Protected Room Notice */}
        {isProtected && (
          <Alert
            color="blue"
            variant="light"
            title="Sala protegida por chave"
            styles={{
              root: {
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderColor: 'rgba(37, 99, 235, 0.25)',
                color: '#93c5fd',
                borderRadius: 8,
                width: '100%',
              },
              title: {
                fontWeight: 600,
                color: '#60a5fa',
              },
            }}
          >
            Esta sala exige uma chave de acesso para novos participantes. Compartilhe a chave separadamente deste link.
          </Alert>
        )}

        {/* Creator Access Key with Copy Action */}
        {isProtected && roomKey && (
          <Box style={{ width: '100%' }}>
            <TextInput
              label="Chave de acesso da sala"
              value={roomKey}
              readOnly
              aria-label="Chave de acesso da sala"
              onClick={(e) => e.currentTarget.select()}
              rightSection={
                <Tooltip label={keyCopyStatus === 'copied' ? 'Copiada!' : 'Copiar chave'} withArrow>
                  <ActionIcon
                    variant="subtle"
                    color={keyCopyStatus === 'copied' ? 'teal' : 'gray'}
                    onClick={handleCopyKey}
                    aria-label={keyCopyStatus === 'copied' ? 'Chave copiada' : 'Copiar chave de acesso'}
                  >
                    {keyCopyStatus === 'copied' ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              }
              styles={{
                label: {
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#8c959f',
                  marginBottom: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                },
                input: {
                  backgroundColor: '#0d1117',
                  borderColor: 'rgba(255, 255, 255, 0.12)',
                  color: '#e6edf3',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  height: '40px',
                },
              }}
            />
          </Box>
        )}

        {/* Full Public URL input */}
        <Box style={{ width: '100%' }}>
          <TextInput
            label="Link da sala"
            value={inviteUrl}
            readOnly
            aria-label="Link da sala"
            onClick={(e) => e.currentTarget.select()}
            rightSection={
              <Tooltip label={copyStatus === 'copied' ? 'Copiado!' : 'Copiar link'} withArrow>
                <ActionIcon
                  variant="subtle"
                  color={copyStatus === 'copied' ? 'teal' : 'gray'}
                  onClick={handleCopy}
                  disabled={!inviteUrl}
                  aria-label={copyStatus === 'copied' ? 'Link copiado' : 'Copiar endereço da sala'}
                >
                  {copyStatus === 'copied' ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            }
            styles={{
              label: {
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#8c959f',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              },
              input: {
                backgroundColor: '#0d1117',
                borderColor: 'rgba(255, 255, 255, 0.12)',
                color: '#e6edf3',
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                height: '40px',
              },
            }}
          />
        </Box>

        {/* Modal actions */}
        <Group justify="flex-end" gap="xs" style={{ width: '100%' }} mt="xs">
          <Button
            variant="subtle"
            color="gray"
            onClick={onClose}
            style={{ color: '#8c959f' }}
          >
            Fechar
          </Button>
          <Button
            onClick={handleCopy}
            disabled={!inviteUrl}
            leftSection={copyStatus === 'copied' ? <IconCheck size={16} /> : <IconCopy size={16} />}
            style={{
              backgroundColor: copyStatus === 'copied' ? '#16a34a' : copyStatus === 'error' ? '#dc2626' : '#2563eb',
              fontWeight: 600,
              transition: 'background-color 0.15s ease',
            }}
          >
            {copyStatus === 'copied' ? 'Link copiado!' : copyStatus === 'error' ? 'Falha ao copiar' : 'Copiar link'}
          </Button>
        </Group>

        {/* Screen reader live announcement */}
        <Box
          aria-live="polite"
          aria-atomic="true"
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
          {copyAnnouncement}
        </Box>
      </Stack>
    </Modal>
  );
}
