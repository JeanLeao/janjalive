import type { RoomState } from '@screen-room/protocol';
import React, { useRef, useEffect, useState } from 'react';
import {
  Drawer,
  Box,
  Stack,
  Group,
  Text,
  UnstyledButton,
  TextInput,
  ActionIcon,
  Button,
} from '@mantine/core';
import type { FollowStatus } from '../hooks/follow-presenter';
import type { RoomParticipant } from '../types';
import {
  getAvatarColor,
  getInitials,
  formatDisplayName,
} from '../utils/avatar';
import {
  IconHand,
  IconClose,
  IconScreen,
  IconEdit,
  IconCheck,
  IconLink,
} from './Icons';
import { copyRoomInviteUrl } from '../utils/invite-url';

export interface ParticipantsDrawerProps {
  roomState?: RoomState;
  isHost?: boolean;
  moderationPending?: boolean;
  moderationFeedback?: string | null;
  onModerate?: (action: 'lock' | 'unlock' | 'remove', targetPeerId?: string) => void;
  opened: boolean;
  onClose: () => void;
  participants: RoomParticipant[];
  onUpdateNickname: (nickname: string) => void;
  currentNickname: string;
  followPresenterId?: string | null;
  followStatus?: FollowStatus;
  onFollowPresenter?: (peerId: string) => void;
  onResumeFollowing?: () => void;
  onStopFollowing?: () => void;
}

export function ParticipantsDrawer({
  roomState, isHost = false, moderationPending = false, moderationFeedback, onModerate,
  opened,
  onClose,
  participants,
  onUpdateNickname,
  currentNickname,
  followPresenterId = null,
  followStatus = 'off',
  onFollowPresenter,
  onResumeFollowing,
  onStopFollowing,
}: ParticipantsDrawerProps) {
  const [removal, setRemoval] = useState<string | null>(null);
  const moderationStatusRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (moderationFeedback && opened && isHost) moderationStatusRef.current?.focus(); }, [moderationFeedback, opened, isHost]);
  const cancelRemovalRef = useRef<HTMLButtonElement>(null);
  const removeButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const previousRemovalRef = useRef<string | null>(null);
  useEffect(() => {
    if (!removal && previousRemovalRef.current) removeButtonsRef.current.get(previousRemovalRef.current)?.focus();
    previousRemovalRef.current = removal;
  }, [removal]);
  useEffect(() => { if (removal) cancelRemovalRef.current?.focus(); }, [removal]);
  useEffect(() => { if (!opened || !isHost || !participants.some(p => p.peerId === removal)) setRemoval(null); }, [opened, isHost, participants, removal]);
  const cancelRemoval = () => setRemoval(null);
  const [isEditingNick, setIsEditingNick] = useState(false);
  const [nickDraft, setNickDraft] = useState(currentNickname);
  const [copied, setCopied] = useState(false);
  const editNickBtnRef = useRef<HTMLButtonElement>(null);
  const wasEditingRef = useRef(false);
  useEffect(() => {
    if (wasEditingRef.current && !isEditingNick) {
      editNickBtnRef.current?.focus();
    }
    wasEditingRef.current = isEditingNick;
  }, [isEditingNick]);
  const followed = participants.find(p => p.peerId === followPresenterId);
  const lastFollowedName = useRef('apresentador');
  useEffect(() => {
    if (followed) lastFollowedName.current = formatDisplayName(followed.nickname, false);
  }, [followed]);
  const multipleStreams = participants.filter(p => p.isSharing).length >= 2;
  const statusLabel = followStatus === 'suspended' ? 'Acompanhamento suspenso'
    : followStatus === 'away' ? 'Aguardando reconexão'
    : followStatus === 'unavailable' ? 'Transmissão indisponível' : 'Acompanhando escolhas';
  const followActions = <Group gap={8} mt={4}>
    {followStatus === 'suspended' && <Button size="compact-xs" variant="subtle" onClick={onResumeFollowing} style={{ minHeight: 44 }}>Retomar</Button>}
    <Button size="compact-xs" variant="subtle" color="gray" onClick={onStopFollowing} style={{ minHeight: 44 }}>Parar de seguir</Button>
  </Group>;

  const handleSaveNick = () => {
    onUpdateNickname(nickDraft);
    setIsEditingNick(false);
  };

  const handleCopyLink = async () => {
    const success = await copyRoomInviteUrl();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      closeOnEscape={!isEditingNick && !removal}
      position="right"
      size="sm"
      withCloseButton={false}
      aria-label="Participantes"
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
            Participantes
          </Drawer.Title>
          <Text size="xs" c="#8c959f">
            {participants.length} {participants.length === 1 ? 'na sala' : 'na sala'}
          </Text>
        </div>

        <UnstyledButton
          onClick={onClose}
          aria-label="Fechar lista de participantes"
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

      <style>{`
        .participants-follow-action { min-height: 44px; height: auto; padding: 8px 0; max-width: 100%; }
        .participants-follow-action .mantine-Button-label { white-space: normal; text-align: left; overflow-wrap: anywhere; }
        .participants-follow-action:focus-visible { outline: 2px solid #58a6ff; outline-offset: 2px; }
      `}</style>
      {roomState && <Box px="xl" py="md" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Text size="sm" fw={600}>{roomState.locked ? 'Sala bloqueada' : 'Entradas abertas'}</Text>
        <Text size="xs" c="#8c959f" mt={4}>
          {!roomState.hostPeerId ? 'Sala sem administrador. Novas entradas permanecem abertas.' : !roomState.hostConnected ? 'Host desconectado. Autoridade reservada por até 30 segundos.' : isHost ? 'Você é o host desta sala.' : 'Somente o host pode moderar a sala.'}
        </Text>
        {isHost && <Button variant="default" fullWidth mt="sm" mih={44} disabled={moderationPending}
          onClick={() => onModerate?.(roomState.locked ? 'unlock' : 'lock')}>
          {roomState.locked ? 'Desbloquear entradas' : 'Bloquear entradas'}
        </Button>}
        {moderationFeedback && <Text ref={moderationStatusRef} tabIndex={-1} size="sm" mt="sm" role="status">{moderationFeedback}</Text>}
      </Box>}
      {/* Participants List */}
      <Box style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
        <Stack gap="xs">
          {followPresenterId && !followed && <Box px={12} py={8}>
            <Text size="sm" fw={600}>{lastFollowedName.current}</Text>
            <Text size="xs" c="#8c959f" role="status" data-follow-status={followStatus}>{statusLabel}</Text>
            {followActions}
          </Box>}
          {[...participants].sort((a, b) => (a.handOrder ?? Infinity) - (b.handOrder ?? Infinity) || a.peerId.localeCompare(b.peerId)).map((part) => {
            const displayName = formatDisplayName(part.nickname, part.isLocal);
            const { bg, text } = getAvatarColor(part.nickname || 'Visitante');

            return (
              <Box
                key={part.peerId}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#161b22',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                {roomState?.hostPeerId === part.peerId && <Text size="xs" c="#93c5fd" fw={600} mb={4}>Host</Text>}
                {part.handOrder != null && <Group gap={6} mb={4} c="#93c5fd"><IconHand size={14} aria-hidden /><Text size="xs">Mão levantada</Text></Group>}
                <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                  <Box
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      backgroundColor: bg,
                      color: text,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {getInitials(part.nickname)}
                  </Box>

                  <Box style={{ flex: 1, minWidth: 0 }}>
                    {part.isLocal && isEditingNick ? (
                      <Group gap="xs" style={{ width: '100%' }}>
                        <TextInput
                          size="xs"
                          value={nickDraft}
                          onChange={(e) => setNickDraft(e.currentTarget.value)}
                          placeholder="Seu nickname"
                          aria-label="Seu nickname"
                          maxLength={32}
                          styles={{
                            input: {
                              backgroundColor: '#0d1117',
                              borderColor: '#3b82f6',
                              color: '#fff',
                            },
                          }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveNick();
                            if (e.key === 'Escape') {
                              e.stopPropagation();
                              e.nativeEvent.stopImmediatePropagation();
                              setIsEditingNick(false);
                            }
                          }}
                        />
                        <ActionIcon
                          size="sm"
                          color="blue"
                          onClick={handleSaveNick}
                          title="Salvar"
                          aria-label="Salvar nickname"
                        >
                          <IconCheck size={14} />
                        </ActionIcon>
                      </Group>
                    ) : (
                      <>
                        <Group gap={6} align="center">
                          <Text
                            size="sm"
                            fw={600}
                            c="#e6edf3"
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {displayName}
                          </Text>
                          {part.isLocal && (
                            <UnstyledButton
                              ref={editNickBtnRef}
                              onClick={() => {
                                setNickDraft(part.nickname || '');
                                setIsEditingNick(true);
                              }}
                              title="Alterar seu nickname"
                              aria-label="Alterar seu nickname"
                              style={{
                                color: '#8c959f',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: 36,
                                minHeight: 36,
                                padding: 6,
                                borderRadius: 6,
                                cursor: 'pointer',
                                transition: 'color 0.15s ease, background-color 0.15s ease',
                              }}
                            >
                              <IconEdit size={14} />
                            </UnstyledButton>
                          )}
                        </Group>

                        <Group gap={4} align="center" mt={2}>
                          {part.isSharing ? (
                            <>
                              <IconScreen size={12} style={{ color: '#60a5fa' }} />
                              <Text size="xs" c="#60a5fa" fw={500}>
                                Transmitindo
                              </Text>
                            </>
                          ) : (
                            <Text size="xs" c="#8c959f">
                              Assistindo
                            </Text>
                          )}
                        </Group>
                      </>
                    )}
                  </Box>
                </Group>
                {isHost && !part.isLocal && part.peerId !== roomState?.hostPeerId && (
                  removal === part.peerId ? <Box mt="sm" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); cancelRemoval(); } }}>
                    <Text size="sm">Remover {displayName} da sala?</Text>
                    <Text size="xs" c="#8c959f" mt={4}>A sessão será encerrada. Em uma sala aberta, a pessoa poderá entrar novamente.</Text>
                    <Group gap="xs" mt="xs">
                      <Button ref={cancelRemovalRef} variant="default" mih={44} onClick={cancelRemoval}>Cancelar</Button>
                      <Button color="red" mih={44} disabled={moderationPending} onClick={() => {
                        onModerate?.('remove', part.peerId); setRemoval(null);
                      }}>Confirmar remoção</Button>
                    </Group>
                  </Box> : <Button variant="subtle" color="red" size="compact-xs" mih={44} mt={4} disabled={moderationPending}
                    ref={element => { if (element) removeButtonsRef.current.set(part.peerId, element); else removeButtonsRef.current.delete(part.peerId); }}
                    aria-label={`Remover ${displayName}`} onClick={() => setRemoval(part.peerId)}>Remover</Button>
                )}
                {part.peerId === followPresenterId ? <Box mt={8}>
                  <Text size="xs" c="#8c959f" role="status" data-follow-status={followStatus}>{statusLabel}</Text>
                  {followActions}
                </Box> : multipleStreams && !part.isLocal && part.isSharing && onFollowPresenter && (
                  <Button className="participants-follow-action" variant="subtle" size="compact-xs"
                    onClick={() => onFollowPresenter(part.peerId)}>
                    Acompanhar escolhas de {formatDisplayName(part.nickname, false)}
                  </Button>
                )}
              </Box>
            );
          })}
        </Stack>
      </Box>

      {/* Invite Section Card at Bottom */}
      <Box
        style={{
          padding: '1.25rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#161b22',
        }}
      >
        <Text size="sm" fw={600} c="#fff" mb={4}>
          Convidar para a sala
        </Text>
        <Text size="xs" c="#8c959f" mb="sm">
          Envie o link para outras pessoas assistirem ou transmitirem diretamente no navegador.
        </Text>
        <Button
          fullWidth
          size="sm"
          leftSection={copied ? <IconCheck size={16} /> : <IconLink size={16} />}
          onClick={handleCopyLink}
          style={{
            backgroundColor: copied ? '#064e3b' : '#21262d',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: copied ? '#34d399' : '#fff',
            fontWeight: 600,
          }}
        >
          {copied ? 'Link copiado!' : 'Copiar link de convite'}
        </Button>
      </Box>
    </Drawer>
  );
}
