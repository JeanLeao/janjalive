import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Popover } from '@mantine/core';
import { INTERACTION_LIMITS, REACTIONS, type ChatMessage, type Reaction, type ReactionEvent } from '@screen-room/protocol';
import { formatDisplayName, getAvatarColor, getInitials } from '../utils/avatar';
import { IconHand, IconCheck, IconChat, IconClose, IconFlagBrazil, IconSend, IconSmile } from './Icons';
import classes from './RoomInteractions.module.css';

const labels: Record<Reaction, string> = {
  applause: 'Aplausos',
  like: 'Gostei',
  heart: 'Adorei',
  celebrate: 'Celebrar',
  brazil: 'Brasil',
  dislike: 'Não gostei',
  'middle-finger': 'Dedo do meio',
  bubbles: 'Bolhas de sabão',
  rocket: 'Foguete',
};
const symbols: Record<Reaction, React.ReactNode> = {
  applause: '👏',
  like: '👍',
  heart: '❤️',
  celebrate: '🎉',
  brazil: <IconFlagBrazil />,
  dislike: '👎',
  'middle-finger': '🖕',
  bubbles: '🫧',
  rocket: '🚀',
};
const GROUP_WINDOW_MS = 5 * 60 * 1000;

interface InteractionsStateInput {
  roomId: string; messages: ChatMessage[]; error: string | null; pending: boolean;
  connected: boolean; onSendChat: (text: string) => boolean;
}

/**
 * Estado de interações elevado para a rota: chat aberto, rascunho, leitura e seletor
 * sobrevivem a mudanças de modo (normal, Cinema e tela cheia) sem remontar a sessão.
 */
export function useInteractionsUi({ roomId, messages, error, pending, connected, onSendChat }: InteractionsStateInput) {
  const [opened, setOpened] = useState(false);
  const [picker, setPicker] = useState(false);
  const [draft, setDraft] = useState('');
  const [lastRead, setLastRead] = useState<string>();
  const [atBottom, setAtBottom] = useState(true);
  const scroll = useRef<HTMLDivElement | null>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    setOpened(false); setPicker(false); setDraft(''); setLastRead(undefined); setAtBottom(true);
  }, [roomId]);
  useEffect(() => {
    if (wasPending.current && !pending && !error) setDraft('');
    wasPending.current = pending;
  }, [pending, error]);

  const newest = messages.at(-1)?.id;
  const unread = newest && newest !== lastRead
    ? (lastRead ? messages.length - messages.findIndex(m => m.id === lastRead) - 1 : messages.length)
    : 0;
  useEffect(() => {
    if (opened && atBottom) {
      scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
      setLastRead(newest);
    }
  }, [newest, opened, atBottom]);
  useEffect(() => { if (!connected) setPicker(false); }, [connected]);

  const send = () => { if (onSendChat(draft)) setAtBottom(true); };
  const openChat = useCallback(() => { setOpened(true); setPicker(false); setAtBottom(true); }, []);
  const closeChat = useCallback(() => {
    setOpened(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-chat-trigger]')?.focus());
  }, []);
  const toggleChat = useCallback(() => { if (opened) closeChat(); else openChat(); }, [opened, openChat, closeChat]);
  const closePicker = useCallback(() => setPicker(false), []);
  return { opened, picker, setPicker, closePicker, draft, setDraft, atBottom, setAtBottom, scroll, unread, send, openChat, closeChat, toggleChat };
}
export type InteractionsUi = ReturnType<typeof useInteractionsUi>;

/** Acesso social compacto (chat + reações): no header ou como controle contextual no Cinema/tela cheia. */
export function InteractionActions({ ui, connected, onSendReaction, variant, handRaised = false, handReady = false, onToggleHand }: {
  handRaised?: boolean; handReady?: boolean; onToggleHand?: () => void;
  ui: InteractionsUi; connected: boolean; onSendReaction: (reaction: Reaction) => void; variant: 'header' | 'floating';
}) {
  const { unread, opened, picker } = ui;
  const badge = unread > 99 ? '99+' : String(unread);
  const onPickerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % buttons.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === 'ArrowDown') nextIndex = (index + 3) % buttons.length;
    else if (event.key === 'ArrowUp') nextIndex = (index - 3 + buttons.length) % buttons.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[nextIndex]?.focus();
  };

  return <div className={`${classes.actions} ${variant === 'floating' ? classes.floating : ''}`} role="group" aria-label="Interações da sala">
    <button type="button" className={classes.action} data-chat-trigger aria-expanded={opened} aria-controls="room-chat-panel"
      title="Chat" aria-label={unread ? `Abrir chat, ${unread} mensagens não lidas` : 'Abrir chat'} onClick={ui.toggleChat}
      data-active={opened || undefined}>
      <IconChat size={18} aria-hidden />
      {unread > 0 && <span className={classes.badge} aria-hidden="true">{badge}</span>}
    </button>
    <button type="button" className={`${classes.action} ${classes.handAction}`} disabled={!connected || !handReady}
      aria-label={handRaised ? 'Abaixar mão' : 'Levantar mão'} title={handRaised ? 'Abaixar mão' : 'Levantar mão'}
      aria-pressed={handRaised} data-active={handRaised || undefined} onClick={onToggleHand}>
      <IconHand size={18} aria-hidden />
      {handRaised && <IconCheck size={10} className={classes.handCheck} aria-hidden />}
    </button>
    <span className={classes.divider} aria-hidden="true" />
    <Popover opened={picker} onChange={ui.setPicker} position="bottom-end" offset={8}
      withinPortal={false} zIndex={60} returnFocus closeOnEscape radius={14} shadow="lg" transitionProps={{ transition: 'pop-top-right', duration: 120 }}>
      <Popover.Target>
        <button type="button" className={classes.action} aria-label="Reagir" title="Reagir" aria-haspopup="true" aria-expanded={picker}
          data-active={picker || undefined} onClick={() => ui.setPicker(!picker)}>
          <IconSmile size={18} aria-hidden />
        </button>
      </Popover.Target>
      <Popover.Dropdown className={classes.popover}>
        <div role="group" aria-label="Reações rápidas" className={classes.picker} onKeyDown={onPickerKeyDown}>
          {REACTIONS.map(reaction => <button key={reaction} type="button" className={classes.reactionButton} disabled={!connected}
            aria-label={labels[reaction]} title={labels[reaction]} onClick={() => { onSendReaction(reaction); ui.closePicker(); }}>
            <span aria-hidden="true">{symbols[reaction]}</span>
          </button>)}
        </div>
        {!connected && <p className={classes.pickerHint}>Reconectando à sala…</p>}
      </Popover.Dropdown>
    </Popover>
  </div>;
}

/** Painel do chat, reações temporárias e aviso de erro. Renderizado dentro do palco (inclusive em tela cheia). */
export function InteractionLayer({ ui, messages, reactions, error, pending, connected, localPeerId }: {
  ui: InteractionsUi; messages: ChatMessage[]; reactions: ReactionEvent[]; error: string | null; pending: boolean;
  connected: boolean; localPeerId?: string;
}) {
  return <>
    <div className={classes.reactions} aria-live="polite" aria-atomic="false">
      {reactions.map(item => <div key={item.id} className={classes.reaction} data-testid="reaction-event">
        <span className={classes.reactionEmoji} aria-hidden="true">{symbols[item.reaction]}</span>
        <span className={classes.reactionName}>{item.nickname || 'Visitante'}</span>
        <span className={classes.srOnly}> reagiu: {labels[item.reaction]}</span>
      </div>)}
    </div>
    {!ui.opened && error && <div role="status" className={classes.error}>{error}</div>}
    {ui.opened && <ChatPanel ui={ui} messages={messages} error={error} pending={pending} connected={connected} localPeerId={localPeerId} />}
  </>;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ChatPanel({ ui, messages, error, pending, connected, localPeerId }: {
  ui: InteractionsUi; messages: ChatMessage[]; error: string | null; pending: boolean; connected: boolean; localPeerId?: string;
}) {
  const { draft, setDraft, scroll, atBottom, setAtBottom, unread } = ui;
  const panel = useRef<HTMLElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [scroll]);
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
  }, [draft]);
  const canSend = connected && !pending && Boolean(draft.trim());
  const status = error || (!connected ? 'Sem conexão. Aguarde a reconexão para enviar.' : pending ? 'Enviando…' : '');
  const nearLimit = draft.length >= INTERACTION_LIMITS.textLength * 0.8;
  return <section ref={panel} id="room-chat-panel" className={classes.panel} role="dialog" aria-modal="false" aria-labelledby="room-chat-title" tabIndex={-1}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); ui.closeChat(); } }}>
    <header className={classes.panelHeader}>
      <div className={classes.panelTitle}>
        <h2 id="room-chat-title">Chat da sala</h2>
        <p>Só nesta sessão</p>
      </div>
      <button type="button" className={classes.close} aria-label="Fechar chat" onClick={ui.closeChat}><IconClose size={16} aria-hidden /></button>
    </header>
    <div className={classes.logWrap}>
      <div className={classes.log} ref={scroll} role="log" aria-label="Mensagens da sala" aria-live="polite" tabIndex={0}
        onScroll={event => { const node = event.currentTarget; setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 48); }}>
        {messages.length === 0 && <div className={classes.empty}>
          <span className={classes.emptyIcon} aria-hidden="true"><IconChat size={22} /></span>
          <strong>A conversa começa aqui</strong>
          <span>Envie uma mensagem para a sala. Quem entrar depois não verá mensagens anteriores.</span>
        </div>}
        {messages.map((item, index) => {
          const previous = messages[index - 1];
          const own = Boolean(localPeerId) && item.peerId === localPeerId;
          const continued = Boolean(previous) && previous.peerId === item.peerId && item.timestamp - previous.timestamp < GROUP_WINDOW_MS;
          const name = formatDisplayName(item.nickname, false);
          const color = getAvatarColor(name);
          return <article key={item.id} className={`${classes.message} ${own ? classes.own : ''} ${continued ? classes.continued : ''}`}>
            {!own && (continued
              ? <span className={classes.avatarSpace} aria-hidden="true" />
              : <span className={classes.avatar} aria-hidden="true" style={{ background: color.bg, color: color.text }}>{getInitials(name)}</span>)}
            <div className={classes.body}>
              {!continued && <div className={classes.meta}>
                <strong>{own ? 'Você' : (item.nickname || 'Visitante')}</strong>
                <time dateTime={new Date(item.timestamp).toISOString()}>{formatTime(item.timestamp)}</time>
              </div>}
              <p className={classes.bubble} title={continued ? formatTime(item.timestamp) : undefined}>{item.text}</p>
              {continued && <time className={classes.srOnly} dateTime={new Date(item.timestamp).toISOString()}>{formatTime(item.timestamp)}</time>}
            </div>
          </article>;
        })}
      </div>
      {!atBottom && unread > 0 && <button type="button" className={classes.jump} onClick={() => setAtBottom(true)}>
        <IconSend size={14} aria-hidden style={{ transform: 'rotate(180deg)' }} /> {unread} {unread === 1 ? 'nova mensagem' : 'novas mensagens'}
      </button>}
    </div>
    <form className={classes.composer} onSubmit={event => { event.preventDefault(); if (canSend) ui.send(); }}>
      <div role="status" className={`${classes.status} ${error ? classes.statusError : ''}`}>
        {status}
      </div>
      <div className={classes.field} data-disabled={!connected || undefined}>
        <textarea ref={field} aria-label="Mensagem" aria-describedby="room-chat-hint" placeholder="Escreva para a sala" value={draft} readOnly={pending}
          rows={1} maxLength={INTERACTION_LIMITS.textLength} onChange={event => setDraft(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (canSend) ui.send(); }
          }} />
        <button type="submit" className={classes.send} aria-label="Enviar" aria-busy={pending} disabled={!canSend}>
          {pending ? <span className={classes.spinner} aria-hidden="true" /> : <IconSend size={16} aria-hidden />}
        </button>
      </div>
      <div className={classes.footnote}>
        <span id="room-chat-hint">Enter envia · Shift+Enter quebra a linha</span>
        {nearLimit && <span className={classes.counter}>{draft.length}/{INTERACTION_LIMITS.textLength}</span>}
      </div>
    </form>
  </section>;
}
