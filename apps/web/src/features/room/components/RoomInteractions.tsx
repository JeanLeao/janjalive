import { useEffect, useRef, useState } from 'react';
import { Button, Drawer, Group, Text, Textarea } from '@mantine/core';
import { INTERACTION_LIMITS, REACTIONS, type ChatMessage, type Reaction, type ReactionEvent } from '@screen-room/protocol';
import classes from './RoomInteractions.module.css';

const labels: Record<Reaction, string> = { applause: 'Aplausos', like: 'Gostei', heart: 'Adorei', celebrate: 'Celebrar' };
const symbols: Record<Reaction, string> = { applause: '👏', like: '👍', heart: '❤️', celebrate: '🎉' };

export function RoomInteractions({ messages, reactions, error, pending, connected, onSendChat, onSendReaction }: {
  messages: ChatMessage[]; reactions: ReactionEvent[]; error: string | null; pending: boolean;
  connected: boolean; onSendChat: (text: string) => boolean; onSendReaction: (reaction: Reaction) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [picker, setPicker] = useState(false);
  const [draft, setDraft] = useState('');
  const [lastRead, setLastRead] = useState<string>();
  const [atBottom, setAtBottom] = useState(true);
  const scroll = useRef<HTMLDivElement>(null);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !error) setDraft('');
    wasPending.current = pending;
  }, [pending, error]);
  const newest = messages.at(-1)?.id;
  const unread = newest && newest !== lastRead ? (lastRead ? messages.length - messages.findIndex(m => m.id === lastRead) - 1 : messages.length) : 0;
  useEffect(() => {
    if (opened && atBottom) {
      scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
      setLastRead(newest);
    }
  }, [newest, opened, atBottom]);
  useEffect(() => { if (!connected) setPicker(false); }, [connected]);
  const send = () => { if (onSendChat(draft)) setAtBottom(true); };
  return <>
    <div className={classes.controls}>
      <Button variant="default" size="compact-md" aria-expanded={picker} onClick={() => setPicker(value => !value)}>Reagir</Button>
      <Button variant="default" size="compact-md" onClick={() => { setOpened(true); setPicker(false); setAtBottom(true); }} aria-label={unread ? `Abrir chat, ${unread} mensagens não lidas` : 'Abrir chat'}>Chat {unread > 0 && <span className={classes.badge}>{Math.min(unread, 200)}</span>}</Button>
      {picker && <div className={classes.picker} role="group" aria-label="Reações rápidas" onKeyDown={event => { if (event.key === 'Escape') setPicker(false); }}>
        {REACTIONS.map(reaction => <button key={reaction} disabled={!connected} aria-label={labels[reaction]} onClick={() => { onSendReaction(reaction); setPicker(false); }}>{symbols[reaction]}</button>)}
      </div>}
    </div>
    <div className={classes.reactions} aria-live="polite" aria-atomic="false">
      {reactions.map(item => <div key={item.id} className={classes.reaction} data-testid="reaction-event"><span aria-hidden="true">{symbols[item.reaction]}</span> {item.nickname || 'Visitante'}: {labels[item.reaction]}</div>)}
    </div>
    {!opened && error && <div role="status" className={classes.error}>{error}</div>}
    <Drawer opened={opened} onClose={() => setOpened(false)} title="Chat da sala" position="right" size="sm" withinPortal={false} zIndex={1100}
      closeButtonProps={{ 'aria-label': 'Fechar chat' }}
      styles={{ inner: { position: 'fixed', inset: 0, width: '100%' }, overlay: { position: 'fixed', inset: 0 }, content: { background: '#0d1117', color: '#e6edf3' }, header: { background: '#0d1117', color: '#e6edf3' }, body: { height: 'calc(100% - 64px)', display: 'flex', flexDirection: 'column', padding: 16 } }}>
      <Text size="xs" c="#a9b4c2" mb="sm">Só nesta sessão. Quem entrar depois não verá mensagens anteriores.</Text>
      <div className={classes.messages} ref={scroll} role="log" aria-label="Mensagens da sala" aria-live={opened ? 'polite' : 'off'} tabIndex={0}
        onScroll={event => { const node = event.currentTarget; setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 48); }}>
        {messages.length === 0 && <Text size="sm" c="#a9b4c2">A conversa começa aqui. Envie uma mensagem para a sala.</Text>}
        {messages.map(item => <article key={item.id} className={classes.message}>
          <Group justify="space-between" gap="xs"><Text size="sm" fw={600}>{item.nickname || 'Visitante'}</Text><time dateTime={new Date(item.timestamp).toISOString()}>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></Group>
          <p>{item.text}</p>
        </article>)}
      </div>
      {!atBottom && unread > 0 && <Button variant="subtle" onClick={() => setAtBottom(true)}>Ver {unread} novas mensagens</Button>}
      <form className={classes.composer} onSubmit={event => { event.preventDefault(); send(); }}>
        <div role="status"><Text size="xs" c={error ? '#fca5a5' : '#a9b4c2'}>{error || (!connected ? 'Sem conexão. Aguarde a reconexão para enviar.' : pending ? 'Aguardando confirmação do servidor…' : 'Enter envia · Shift+Enter quebra a linha')}</Text></div>
        <Textarea label="Mensagem" placeholder="Escreva para a sala" value={draft} readOnly={pending} maxLength={INTERACTION_LIMITS.textLength} autosize minRows={2} maxRows={4}
          onChange={event => setDraft(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (connected && !pending) send(); } }} />
        <Group justify="space-between" mt="xs"><Text size="xs" c="#a9b4c2">{draft.length}/{INTERACTION_LIMITS.textLength}</Text><Button type="submit" disabled={!connected || pending || !draft.trim()}>Enviar</Button></Group>
      </form>
    </Drawer>
  </>;
}
