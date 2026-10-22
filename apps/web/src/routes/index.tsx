import { createRoom } from '../features/room/signaling/create-room';
import React, { useRef, useState } from 'react';
import styles from './index.module.css';
import { ProductShowcase, CompareShowcase, SharingShowcase } from '../features/landing/LandingDemos';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
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
  Accordion,
  UnstyledButton,
  Checkbox,
} from '@mantine/core';
import { normalizeRoom } from '@screen-room/protocol';
import {
  IconScreen,
  IconPlus,
  IconLink,
  IconShield,
} from '../features/room/components/Icons';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Janjalive — Compartilhamento de tela no navegador' },
      { name: 'description', content: 'Crie uma sala efêmera para compartilhar tela e áudio, conversar, trocar arquivos e assistir a vídeos locais com outras pessoas. Sem cadastro.' },
    ],
  }),
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
  const nicknameInput = useRef<HTMLInputElement>(null);
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
    <Box className={styles.lobby}>
      <a className={styles.skipLink} href="#criar-sala">Ir para criar sala</a>
      <header className={styles.header}>
        <Container size="lg" className={styles.headerInner}>
          <UnstyledButton onClick={() => navigate({ to: '/' })} aria-label="Janjalive - Página inicial" className={styles.brand}>
            <span className={styles.brandIcon}><IconScreen size={19} /></span>
            <span>Janjalive</span>
          </UnstyledButton>
          <nav aria-label="Informações">
            <Button variant="subtle" color="gray" onClick={() => setIsAboutModalOpen(true)}>Sobre</Button>
            <Button variant="subtle" color="gray" onClick={() => setIsHelpModalOpen(true)}>Ajuda</Button>
          </nav>
        </Container>
      </header>

      <main>
        <Container size="lg">
          <section className={styles.hero} aria-labelledby="lobby-title">
            <div className={styles.intro}>
              <Title id="lobby-title" order={1} className={styles.title}>
                Compartilhamento<br className={styles.desktopBreak} /> de tela, <span>direto no navegador.</span>
              </Title>
              <Text className={styles.description}>
                Uma sala temporária para apresentar sua tela e o áudio da aba ou do sistema. Sem cadastro, sem instalar nada.
              </Text>
              <Text className={styles.inviteHint}>Convide por link, código ou QR Code.</Text>
            </div>
              <div id="criar-sala" className={styles.createArea}>
                <Title order={2} className={styles.formTitle}>Crie ou entre em uma sala</Title>
                <TextInput
                  ref={nicknameInput}
                  label="Seu nickname temporário (opcional)"
                  placeholder="Visitante (padrão)"
                  value={nickname}
                  onChange={(e) => handleSaveNickname(e.currentTarget.value)}
                />
                <Checkbox
                  className={styles.protection}
                  label="Proteger sala com chave de acesso"
                  description="Gera uma chave aleatória para a entrada dos convidados."
                  checked={protectRoom}
                  onChange={(e) => setProtectRoom(e.currentTarget.checked)}
                />
                {createError && <Text role="alert" c="#fca5a5" size="sm">{createError}</Text>}
                <div className={styles.actions}>
                  <Button size="md" leftSection={<IconPlus size={18} />} onClick={handleCreateRoom} loading={creating}>Criar sala</Button>
                  <Button size="md" variant="default" leftSection={<IconLink size={18} />} onClick={() => setIsCodeModalOpen(true)}>Entrar com código</Button>
                </div>
              </div>
          </section>

          <section className={styles.features} aria-labelledby="features-title">
            <ProductShowcase heading={
              <div className={styles.sectionHeading}>
                <Title order={2} id="features-title">Dentro da sala</Title>
                <Text>A tela em primeiro plano. As ferramentas, por perto.</Text>
              </div>
            } />
            <CompareShowcase />
            <SharingShowcase />
          </section>

          <aside className={styles.notes} aria-label="Privacidade e compatibilidade">
            <div className={styles.privacyNote}>
              <IconShield size={20} />
              <Text>Conexões de mídia via WebRTC. Sem captura de câmera ou microfone pessoal.</Text>
            </div>
            <Text>Captura de tela e áudio variam conforme o navegador e o sistema. Em celulares, a captura pode não estar disponível.</Text>
          </aside>
        </Container>
      </main>
      <footer className={styles.footer}>
        <Container size="lg" className={styles.footerInner}>
          <Text size="sm">Janjalive · Salas efêmeras</Text>
          <nav aria-label="Documentos institucionais" className={styles.legalLinks}>
            <Link to="/termos">Termos de Uso</Link>
            <Link to="/privacidade">Privacidade</Link>
          </nav>
          <a href="#criar-sala" onClick={(event) => {
            event.preventDefault();
            document.getElementById('criar-sala')?.scrollIntoView({ block: 'center' });
            nicknameInput.current?.focus({ preventScroll: true });
          }}>Voltar para criar sala <span aria-hidden="true">↑</span></a>
        </Container>
      </footer>

      {/* Modal: Entrar com código */}
      <Modal
        opened={isCodeModalOpen}
        onClose={() => {
          setIsCodeModalOpen(false);
          setCodeError(null);
        }}
        title="Entrar com código"
        centered
        classNames={{ content: styles.modal, close: styles.modalClose }}
        closeButtonProps={{ 'aria-label': 'Fechar modal' }}
        styles={{
          content: { backgroundColor: '#161b22', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.12)' },
          header: { backgroundColor: '#161b22', color: '#fff', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' },
          title: { fontWeight: 700, fontSize: '1.1rem' },
        }}
      >
        <form onSubmit={handleJoinByCode}>
          <Stack gap="md" mt="xs">
            <Text size="sm" c="#8c959f">
              Cole o link do convite ou digite o código fornecido por quem convidou você.
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
        title="Sobre o Janjalive"
        centered
        classNames={{ content: styles.modal, close: styles.modalClose }}
        closeButtonProps={{ 'aria-label': 'Fechar modal' }}
        styles={{
          content: { backgroundColor: '#161b22', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.12)' },
          header: { backgroundColor: '#161b22', color: '#fff', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' },
          title: { fontWeight: 700, fontSize: '1.1rem' },
        }}
      >
        <Stack gap="md" mt="xs">
          <Text size="sm">O Janjalive reúne pessoas em salas efêmeras, sem cadastro, para compartilhar tela e áudio, conversar, trocar arquivos, criar clipes e assistir a vídeos locais.</Text>
          <Text size="sm"><strong>Conexões via WebRTC.</strong> Transmissões e transferências de arquivos e vídeos usam conexões entre navegadores, com criptografia de transporte. Quando necessário, TURN pode retransmitir esse tráfego. O servidor mantém a sinalização, a presença e recursos de colaboração.</Text>
          <Text size="sm"><strong>Controle sobre suas mídias.</strong> Você escolhe a tela e encerra o compartilhamento quando quiser. Arquivos e Watch Party exigem aceite individual; clipes exigem permissão do apresentador. Esse consentimento controla o gravador integrado e não impede gravações externas.</Text>
          <Text size="sm"><strong>Salas temporárias.</strong> As salas são efêmeras; participantes podem salvar explicitamente arquivos e clipes no próprio dispositivo.</Text>
          <Text size="sm"><strong>Sem microfone pessoal.</strong> A captura usa apenas a tela e, quando disponível, o áudio da aba ou do sistema. Não solicitamos câmera ou microfone.</Text>
          <Button fullWidth variant="default" onClick={() => setIsAboutModalOpen(false)}>Entendido</Button>
        </Stack>
      </Modal>

      {/* Modal: Ajuda */}
      <Modal
        opened={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title="Dicas e Ajuda"
        centered
        classNames={{ content: styles.modal, close: styles.modalClose }}
        closeButtonProps={{ 'aria-label': 'Fechar modal' }}
        styles={{
          content: { backgroundColor: '#161b22', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.12)' },
          header: { backgroundColor: '#161b22', color: '#fff', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' },
          title: { fontWeight: 700, fontSize: '1.1rem' },
        }}
      >
        <Accordion variant="separated" mt="md" defaultValue="rooms">
          {[
            ['rooms', 'Criar, proteger e entrar', 'Escolha um nickname opcional e selecione Criar sala. Para restringir a entrada, marque Proteger sala com chave de acesso antes de criar e envie a chave aos convidados separadamente. Entre por link, QR Code ou pelo botão Entrar com código.'],
            ['screen', 'Compartilhar tela e áudio', 'Na sala, use Compartilhar tela, escolha a fonte no seletor do navegador e confirme a prévia. Se o seletor oferecer áudio, habilite a opção desejada. A disponibilidade depende do navegador, sistema e fonte. Você pode parar pelo aplicativo ou pelo navegador. O microfone pessoal não é solicitado.'],
            ['collaboration', 'Conversar, interagir e enviar arquivos', 'Abra as interações para acessar chat, reações, levantar a mão, perguntas e enquetes. Pelo Chat, selecione arquivos de até 20 MiB e os destinatários. Cada pessoa aceita ou recusa a transferência e escolhe se deseja salvar o arquivo.'],
            ['watch', 'Clipes e Watch Party', 'No menu Clipes, grave até 60 segundos com a permissão do apresentador. Você pode salvar o clipe e compartilhar clipes próprios pelo Chat. Na Watch Party, escolha um MP4 ou WebM de até 20 MiB, ou use Assistir juntos em um clipe próprio elegível. Cada participante aceita o vídeo; quem inicia controla a reprodução coordenada e cada pessoa ajusta seu volume. A sincronização é aproximada.'],
            ['browser', 'Navegadores e dispositivos', 'Use um navegador atualizado. Captura de tela, áudio de aba/sistema, gravação e formatos de vídeo variam entre navegadores e sistemas. Em dispositivos móveis, a captura pode não estar disponível. Se não ouvir uma transmissão, use Ativar áudio quando exibido.'],
            ['connection', 'Problemas de conexão', 'Confira sua conexão e tente entrar novamente pelo convite. Em Configurações, reduza o perfil de qualidade para Econômico se houver lentidão. Redes restritas podem impedir conexões mesmo com TURN. Se houver um erro de entrada, confira o código e a chave com quem criou a sala.'],
          ].map(([value, title, content]) => (
            <Accordion.Item key={value} value={value}>
              <Accordion.Control>{title}</Accordion.Control>
              <Accordion.Panel><Text size="sm">{content}</Text></Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
        <Button fullWidth variant="default" mt="md" onClick={() => setIsHelpModalOpen(false)}>Fechar</Button>
      </Modal>
    </Box>
  );
}
