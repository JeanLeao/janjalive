import { createRoom } from '../features/room/signaling/create-room';
import React, { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  Box,
  Container,
  Title,
  Text,
  Button,
  TextInput,
  Modal,
  Stack,
  Group,
  Badge,
  Card,
  UnstyledButton,
  Checkbox,
} from '@mantine/core';
import { normalizeRoom } from '@screen-room/protocol';
import {
  IconScreen,
  IconPlus,
  IconLink,
  IconShield,
  IconVolume,
  IconUsers,
} from '../features/room/components/Icons';

export const Route = createFileRoute('/')({
  component: LobbyPage,
});

function parseRoomInput(input: string): string {
  const trimmed = input.trim();
  // Handle full URLs like https://.../room/abc-123 or /room/abc-123
  const match = trimmed.match(/\/room\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return match[1];
  }
  return trimmed;
}

function LobbyPage() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('screen_room_display_name') || '';
    }
    return '';
  });

  const [isCodeModalOpen, setIsCodeModalOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('modal') === 'code';
    }
    return false;
  });
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [protectRoom, setProtectRoom] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const handleSaveNickname = (name: string) => {
    setNickname(name);
    if (typeof window !== 'undefined') {
      if (name.trim()) {
        sessionStorage.setItem('screen_room_display_name', name.trim());
      } else {
        sessionStorage.removeItem('screen_room_display_name');
      }
    }
  };

  const handleCreateRoom = async () => {
    if (creating) return;
    setCreating(true); setCreateError(null);
    try {
      const { roomId: newRoomId } = await createRoom({ isProtected: protectRoom });
      handleSaveNickname(nickname);
      await navigate({ to: '/room/$roomId', params: { roomId: newRoomId } });
    } catch (error) { setCreateError(error instanceof Error ? error.message : 'Não foi possível criar a sala.'); }
    finally { setCreating(false); }
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    const parsed = parseRoomInput(inputCode);
    if (!parsed) {
      setCodeError('Por favor, informe o código ou link da sala.');
      return;
    }
    try {
      const normalized = normalizeRoom(parsed);
      handleSaveNickname(nickname);
      setIsCodeModalOpen(false);
      navigate({
        to: '/room/$roomId',
        params: { roomId: normalized },
      });
    } catch (err: any) {
      setCodeError(err?.message || 'Código ou link de sala inválido.');
    }
  };

  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#080a0f',
        color: '#e6edf3',
      }}
    >
      <style>{`
        .lobby-header {
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background-color: #0d1117;
          padding: 0.85rem 1.5rem;
        }
        .lobby-main-area {
          flex: 1;
          display: flex;
          align-items: center;
          padding: 3rem 1.5rem;
        }
        @media (max-width: 600px) {
          .lobby-header {
            padding: 0.5rem 1rem !important;
          }
          .lobby-brand-icon {
            width: 28px !important;
            height: 28px !important;
          }
          .lobby-brand-title {
            font-size: 1.05rem !important;
          }
          .lobby-nav-btn {
            height: 36px !important;
            min-height: 36px !important;
            padding: 0 10px !important;
            font-size: 0.85rem !important;
          }
          .lobby-main-area {
            padding: 1.25rem 1rem !important;
          }
        }
      `}</style>

      {/* Top Navbar */}
      <Box
        component="header"
        className="lobby-header"
      >
        <Container size="lg" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <UnstyledButton
            onClick={() => navigate({ to: '/' })}
            aria-label="Screen Room - Página inicial"
            style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 8 }}
          >
            <Group gap="xs">
              <Box
                className="lobby-brand-icon"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  backgroundColor: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                }}
              >
                <IconScreen size={18} />
              </Box>
              <Text fw={700} size="lg" className="lobby-brand-title" style={{ color: '#fff', letterSpacing: '-0.01em' }}>
                Screen Room
              </Text>
            </Group>
          </UnstyledButton>

          <Group gap="xs">
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              className="lobby-nav-btn"
              onClick={() => setIsAboutModalOpen(true)}
              style={{ color: '#8c959f', fontWeight: 500 }}
            >
              Sobre
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              className="lobby-nav-btn"
              onClick={() => setIsHelpModalOpen(true)}
              style={{ color: '#8c959f', fontWeight: 500 }}
            >
              Ajuda
            </Button>
          </Group>
        </Container>
      </Box>

      {/* Main Content Area */}
      <Box className="lobby-main-area">
        <Container size="lg" style={{ width: '100%' }}>
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '3.5rem',
              alignItems: 'center',
            }}
          >
            {/* Left Column: Hero & Actions */}
            <Stack gap="xl">
              <div>
                <Badge
                  variant="outline"
                  color="blue"
                  size="md"
                  radius="sm"
                  mb="md"
                  styles={{
                    root: {
                      textTransform: 'uppercase',
                      borderColor: 'rgba(37, 99, 235, 0.4)',
                      color: '#60a5fa',
                      fontWeight: 600,
                    },
                  }}
                >
                  WebRTC · Apenas tela e som
                </Badge>

                <Title
                  order={1}
                  style={{
                    fontSize: 'clamp(2rem, 4vw, 2.85rem)',
                    fontWeight: 800,
                    lineHeight: 1.15,
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Compartilhe sua tela em tempo real
                </Title>

                <Text
                  size="lg"
                  c="#8c959f"
                  mt="md"
                  style={{ lineHeight: 1.55, maxWidth: '520px' }}
                >
                  Transmissão direta ponto a ponto com baixa latência e áudio do sistema. Sem cadastro, sem microfone, sem complicações.
                </Text>
              </div>

              {/* Optional Nickname Input */}
              <Box style={{ maxWidth: '420px' }}>
                <TextInput
                  label="Seu nickname temporário (opcional)"
                  placeholder="Visitante (padrão)"
                  value={nickname}
                  onChange={(e) => handleSaveNickname(e.currentTarget.value)}
                  styles={{
                    label: { color: '#8c959f', fontSize: '0.85rem', marginBottom: '0.35rem' },
                    input: {
                      backgroundColor: '#161b22',
                      borderColor: 'rgba(255, 255, 255, 0.12)',
                      color: '#fff',
                      height: '42px',
                    },
                  }}
                />
              </Box>

              {/* Protected Room Option */}
              <Box style={{ maxWidth: '420px' }}>
                <Checkbox
                  label="Proteger sala com chave de acesso"
                  description="Gera uma chave aleatória que os convidados devem informar para entrar."
                  checked={protectRoom}
                  onChange={(e) => setProtectRoom(e.currentTarget.checked)}
                  styles={{
                    label: { color: '#e6edf3', fontSize: '0.88rem', fontWeight: 500, cursor: 'pointer' },
                    description: { color: '#8c959f', fontSize: '0.78rem' },
                    input: { cursor: 'pointer' },
                  }}
                />
              </Box>

              {createError && <Text role="alert" c="#fca5a5" size="sm">{createError}</Text>}
              {/* Main Actions */}
              <Group gap="md">
                <Button
                  size="lg"
                  leftSection={<IconPlus size={18} />}
                  onClick={handleCreateRoom}
                  loading={creating}
                  style={{
                    backgroundColor: '#2563eb',
                    fontWeight: 600,
                    padding: '0 1.5rem',
                    height: '48px',
                  }}
                >
                  Criar sala
                </Button>

                <Button
                  size="lg"
                  variant="default"
                  leftSection={<IconLink size={18} />}
                  onClick={() => setIsCodeModalOpen(true)}
                  style={{
                    backgroundColor: '#161b22',
                    borderColor: 'rgba(255, 255, 255, 0.12)',
                    color: '#e6edf3',
                    fontWeight: 600,
                    padding: '0 1.5rem',
                    height: '48px',
                  }}
                >
                  Entrar com código
                </Button>
              </Group>

              <Text size="xs" c="#6e7781">
                Ao criar uma sala, você recebe um link seguro para convidar participantes. Acesso instantâneo sem login.
              </Text>
            </Stack>

            {/* Right Column: Visual Preview Card */}
            <Box
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Card
                withBorder
                padding="0"
                radius="lg"
                style={{
                  backgroundColor: '#0d1117',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
                  width: '100%',
                  maxWidth: '520px',
                  overflow: 'hidden',
                }}
              >
                {/* Mockup Titlebar */}
                <Box
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#161b22',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Group gap="xs">
                    <Box style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444' }} />
                    <Box style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#eab308' }} />
                    <Box style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#22c55e' }} />
                  </Group>
                  <Text size="xs" c="#8c959f" fw={500}>
                    sala • demo
                  </Text>
                  <Badge size="xs" color="blue" variant="light">
                    Ao vivo
                  </Badge>
                </Box>

                {/* Mockup Screen Stage */}
                <Box
                  style={{
                    height: '240px',
                    backgroundColor: '#06090e',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    padding: '1rem',
                  }}
                >
                  {/* Mockup Streamer Badge */}
                  <Box
                    style={{
                      position: 'absolute',
                      top: 12,
                      left: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: 'rgba(15, 23, 42, 0.85)',
                      padding: '4px 10px',
                      borderRadius: 16,
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <Box
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        backgroundColor: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#fff',
                      }}
                    >
                      F
                    </Box>
                    <Text size="xs" fw={600} c="#fff">
                      Firminha · Transmitindo
                    </Text>
                  </Box>

                  {/* Mockup Stream Content Graphic */}
                  <Stack align="center" gap="xs">
                    <Box
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 12,
                        backgroundColor: 'rgba(37, 99, 235, 0.12)',
                        border: '1px solid rgba(37, 99, 235, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#60a5fa',
                      }}
                    >
                      <IconScreen size={26} />
                    </Box>
                    <Text size="xs" c="#8c959f" fw={500}>
                      Transmissão de tela em tempo real
                    </Text>
                  </Stack>

                  {/* Mockup Floating Dock */}
                  <Box
                    style={{
                      position: 'absolute',
                      bottom: 12,
                      display: 'flex',
                      gap: 8,
                      backgroundColor: '#161b22',
                      padding: '6px 12px',
                      borderRadius: 24,
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <Box style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <IconScreen size={14} />
                    </Box>
                    <Box style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#21262d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <IconVolume size={14} />
                    </Box>
                    <Box style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#21262d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <IconUsers size={14} />
                    </Box>
                    <Box style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Box style={{ width: 10, height: 10, backgroundColor: '#fff', borderRadius: 2 }} />
                    </Box>
                  </Box>
                </Box>
              </Card>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* Modal: Entrar com código */}
      <Modal
        opened={isCodeModalOpen}
        onClose={() => {
          setIsCodeModalOpen(false);
          setCodeError(null);
        }}
        title="Entrar com código"
        centered
        styles={{
          content: { backgroundColor: '#161b22', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.12)' },
          header: { backgroundColor: '#161b22', color: '#fff', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' },
          title: { fontWeight: 700, fontSize: '1.1rem' },
        }}
      >
        <form onSubmit={handleJoinByCode}>
          <Stack gap="md" mt="xs">
            <Text size="sm" c="#8c959f">
              Cole o link do convite ou digite o código da sala fornecido por quem está transmitindo.
            </Text>

            <TextInput
              label="Código ou link da sala"
              required
              placeholder="ex.: sala-123 ou https://.../room/xyz"
              value={inputCode}
              onChange={(e) => {
                setInputCode(e.currentTarget.value);
                setCodeError(null);
              }}
              error={codeError}
              autoFocus
              styles={{
                input: {
                  backgroundColor: '#0d1117',
                  borderColor: 'rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                },
              }}
            />

            <TextInput
              label="Seu nickname (opcional)"
              placeholder="Visitante (padrão)"
              value={nickname}
              onChange={(e) => handleSaveNickname(e.currentTarget.value)}
              styles={{
                input: {
                  backgroundColor: '#0d1117',
                  borderColor: 'rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                },
              }}
            />

            <Group justify="flex-end" mt="md">
              <Button
                variant="subtle"
                color="gray"
                onClick={() => setIsCodeModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                style={{ backgroundColor: '#2563eb', fontWeight: 600 }}
              >
                Entrar na sala
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Modal: Sobre */}
      <Modal
        opened={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
        title="Sobre o Screen Room"
        centered
        styles={{
          content: { backgroundColor: '#161b22', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.12)' },
          header: { backgroundColor: '#161b22', color: '#fff', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' },
          title: { fontWeight: 700, fontSize: '1.1rem' },
        }}
      >
        <Stack gap="md" mt="xs">
          <Text size="sm" c="#d0d7de">
            O <strong>Screen Room</strong> é uma alternativa focada e leve para transmissão de telas em tempo real, sem recursos de rede social.
          </Text>

          <Stack gap="xs">
            <Group gap="xs" align="flex-start">
              <IconShield size={18} style={{ color: '#60a5fa', marginTop: 2 }} />
              <Text size="sm" c="#8c959f">
                <strong>Ponto a ponto (P2P):</strong> O vídeo e áudio viajam diretamente entre navegadores usando WebRTC criptografado.
              </Text>
            </Group>

            <Group gap="xs" align="flex-start">
              <IconVolume size={18} style={{ color: '#60a5fa', marginTop: 2 }} />
              <Text size="sm" c="#8c959f">
                <strong>Áudio do sistema:</strong> Compartilhe áudio de abas e janelas sem necessidade de microfone.
              </Text>
            </Group>

            <Group gap="xs" align="flex-start">
              <IconUsers size={18} style={{ color: '#60a5fa', marginTop: 2 }} />
              <Text size="sm" c="#8c959f">
                <strong>Sessões efêmeras:</strong> Sem cadastro, perfis ou histórico salvo. Cada visita é temporária.
              </Text>
            </Group>
          </Stack>

          <Button
            fullWidth
            onClick={() => setIsAboutModalOpen(false)}
            style={{ backgroundColor: '#21262d', color: '#fff', marginTop: '0.5rem' }}
          >
            Entendido
          </Button>
        </Stack>
      </Modal>

      {/* Modal: Ajuda */}
      <Modal
        opened={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title="Dicas e Ajuda"
        centered
        styles={{
          content: { backgroundColor: '#161b22', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.12)' },
          header: { backgroundColor: '#161b22', color: '#fff', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' },
          title: { fontWeight: 700, fontSize: '1.1rem' },
        }}
      >
        <Stack gap="md" mt="xs">
          <div>
            <Text fw={600} size="sm" c="#fff">
              Como transmitir com áudio?
            </Text>
            <Text size="sm" c="#8c959f" mt={4}>
              Ao iniciar o compartilhamento no navegador (Chrome, Edge ou Firefox), marque a opção "Compartilhar áudio da aba" ou "Compartilhar áudio do sistema".
            </Text>
          </div>

          <div>
            <Text fw={600} size="sm" c="#fff">
              Dispositivos móveis
            </Text>
            <Text size="sm" c="#8c959f" mt={4}>
              Smartphones e tablets podem assistir às transmissões em alta qualidade com áudio. A captura de tela depende do suporte do navegador móvel.
            </Text>
          </div>

          <div>
            <Text fw={600} size="sm" c="#fff">
              Dificuldades de conexão?
            </Text>
            <Text size="sm" c="#8c959f" mt={4}>
              Se houver lentidão ou perda de pacotes, acesse as Configurações da sala para ajustar o perfil de qualidade (Equilibrada ou Econômica).
            </Text>
          </div>

          <Button
            fullWidth
            onClick={() => setIsHelpModalOpen(false)}
            style={{ backgroundColor: '#21262d', color: '#fff', marginTop: '0.5rem' }}
          >
            Fechar
          </Button>
        </Stack>
      </Modal>
    </Box>
  );
}
