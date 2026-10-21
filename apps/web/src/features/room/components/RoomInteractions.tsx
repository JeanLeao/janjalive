import { FileAttachment, FileTransferCard, groupDeliveries } from './FileTransfers';
import type { FileDelivery, FileTransferManager } from '../files/file-transfer-manager';
import type { RoomParticipant } from '../types';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Menu, Popover } from '@mantine/core';
import {
  INTERACTION_LIMITS, QA_LIMITS, REACTIONS,
  type Poll, type ChatMessage, type QaQuestion, type Reaction, type ReactionEvent,
} from '@screen-room/protocol';
import { formatDisplayName, getAvatarColor, getInitials } from '../utils/avatar';
import { IconDots, IconHand, IconCheck, IconChat, IconClose, IconFlagBrazil, IconSend, IconSmile } from './Icons';
import { PollTabView, type PollTabProps } from './RoomPolls';
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

export type InteractionTab = 'chat' | 'qa' | 'polls';

interface InteractionsStateInput {
  files?: FileTransferManager;
  fileDeliveries?: FileDelivery[];
  participants?: RoomParticipant[];
  roomId: string;
  messages: ChatMessage[];
  error: string | null;
  pending: boolean;
  connected: boolean;
  onSendChat: (text: string) => boolean;
  polls?: Poll[];
  questions?: QaQuestion[];
  qaError?: string | null;
  qaPending?: boolean;
  qaSubmitPending?: boolean;
  onSubmitQuestion?: (text: string) => boolean;
}

/**
 * Estado de interações elevado para a rota: chat/perguntas abertos, rascunhos, leitura e seletor
 * sobrevivem a mudanças de modo (normal, Cinema e tela cheia) sem remontar a sessão.
 */
export function useInteractionsUi({
  files, fileDeliveries = [], participants = [],
  roomId,
  messages,
  error,
  pending,
  connected,
  onSendChat,
  polls = [],
  questions = [],
  qaError = null,
  qaPending = false,
  qaSubmitPending = false,
  onSubmitQuestion,
}: InteractionsStateInput) {
  const [opened, setOpened] = useState(false);
  const [tab, setTab] = useState<InteractionTab>('chat');
  const [picker, setPicker] = useState(false);
  const [draft, setDraft] = useState('');
  const [qaDraft, setQaDraft] = useState('');
  const [pollDraft, setPollDraft] = useState({ question: '', options: ['', ''] });
  const [lastRead, setLastRead] = useState<string>();
  const [atBottom, setAtBottom] = useState(true);
  const scroll = useRef<HTMLDivElement | null>(null);
  const wasPending = useRef(false);
  const wasQaSubmitPending = useRef(false);

  useEffect(() => {
    setOpened(false);
    setTab('chat');
    setPicker(false);
    setDraft('');
    setQaDraft('');
    setPollDraft({ question: '', options: ['', ''] });
    setLastRead(undefined);
    setAtBottom(true);
  }, [roomId]);
  useEffect(() => {
    if (wasPending.current && !pending && !error) setDraft('');
    wasPending.current = pending;
  }, [pending, error]);
  useEffect(() => {
    if (wasQaSubmitPending.current && !qaSubmitPending && !qaError) setQaDraft('');
    wasQaSubmitPending.current = qaSubmitPending;
  }, [qaSubmitPending, qaError]);

  const pendingFiles = fileDeliveries.filter(d => d.incoming && d.state === 'offered').length;
  const fileTimes = useRef(new Map<string, number>());
  for (const id of fileTimes.current.keys()) if (!fileDeliveries.some(d => d.id === id)) fileTimes.current.delete(id);
  for (const d of fileDeliveries) if (!fileTimes.current.has(d.id)) fileTimes.current.set(d.id, Date.now());
  const newestFile = fileDeliveries.at(-1)?.id;
  const newest = messages.at(-1)?.id;
  const unread = newest && newest !== lastRead
    ? (lastRead ? messages.length - messages.findIndex(m => m.id === lastRead) - 1 : messages.length)
    : 0;
  const openQuestionsCount = questions.filter(q => q.status === 'open').length;

  useEffect(() => {
    if (opened && tab === 'chat' && atBottom) {
      scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
      setLastRead(newest);
    }
  }, [newest, newestFile, opened, tab, atBottom]);
  useEffect(() => { if (!connected) setPicker(false); }, [connected]);

  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const send = () => { if (onSendChat(draft)) setAtBottom(true); };
  const submitQa = () => { onSubmitQuestion?.(qaDraft); };
  const openChat = useCallback(() => {
    lastTriggerRef.current = document.activeElement as HTMLElement | null;
    setOpened(true);
    setPicker(false);
    setAtBottom(true);
  }, []);
  const closeChat = useCallback(() => {
    setOpened(false);
    requestAnimationFrame(() => {
      const prev = lastTriggerRef.current;
      if (prev && document.contains(prev) && typeof prev.focus === 'function' && prev !== document.body) {
        prev.focus();
        return;
      }
      const triggers = Array.from(document.querySelectorAll<HTMLElement>('[data-chat-trigger]'));
      const visibleTrigger = triggers.find(t => t.offsetParent !== null || t.offsetWidth > 0 || t.offsetHeight > 0) || triggers[0];
      if (visibleTrigger) {
        visibleTrigger.focus();
        return;
      }
      const stage = document.querySelector<HTMLElement>('.stage-main-container, .stage-empty-container');
      stage?.focus();
    });
  }, []);
  const toggleChat = useCallback(() => { if (opened) closeChat(); else openChat(); }, [opened, openChat, closeChat]);
  const closePicker = useCallback(() => setPicker(false), []);
  return {
    files, fileDeliveries, participants, pendingFiles, fileTimes,
    opened,
    tab,
    setTab,
    picker,
    setPicker,
    closePicker,
    draft,
    setDraft,
    qaDraft,
    setQaDraft,
    pollDraft, setPollDraft,
    hasOpenPoll: polls.some(poll => poll.closedAt === null),
    atBottom,
    setAtBottom,
    scroll,
    unread,
    openQuestionsCount,
    qaPending,
    send,
    submitQa,
    openChat,
    closeChat,
    toggleChat,
  };
}
export type InteractionsUi = ReturnType<typeof useInteractionsUi>;

/** Acesso social compacto (chat/perguntas + levantar mão + reações): no header ou como controle contextual no Cinema/tela cheia. */
export function InteractionActions({ ui, connected, onSendReaction, variant, handRaised = false, handReady = false, onToggleHand }: {
  handRaised?: boolean; handReady?: boolean; onToggleHand?: () => void;
  ui: InteractionsUi; connected: boolean; onSendReaction: (reaction: Reaction) => void; variant: 'header' | 'floating';
}) {
  const { unread, openQuestionsCount, opened, picker, pendingFiles } = ui;
  const badge = unread > 99 ? '99+' : String(unread);
  const qaBadge = openQuestionsCount > 99 ? '99+' : String(openQuestionsCount);
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
    <button type="button" className={classes.action} data-chat-trigger data-poll-open={ui.hasOpenPoll || undefined} data-qa-open={openQuestionsCount || undefined}
      aria-expanded={opened} aria-controls="room-chat-panel"
      title={ui.hasOpenPoll ? 'Enquete aberta · Chat e perguntas (I)' : openQuestionsCount > 0 ? `Chat e perguntas (${openQuestionsCount} em aberto) (I)` : 'Chat e perguntas (I)'}
      aria-label={pendingFiles ? `Abrir chat, ${pendingFiles} solicitações de arquivo` : unread ? `Abrir chat, ${unread} mensagens não lidas` : 'Abrir chat'} onClick={() => { if (pendingFiles) { ui.setTab('chat'); ui.openChat(); } else ui.toggleChat(); }}
      data-active={opened || undefined}>
      <IconChat size={18} aria-hidden />
      {ui.hasOpenPoll && <span className={classes.pollDot} data-testid="poll-open-indicator" aria-label="Enquete aberta" />}
      {(unread + pendingFiles) > 0 && <span className={classes.badge} aria-hidden="true">{pendingFiles ? unread + pendingFiles : badge}</span>}
      {openQuestionsCount > 0 && <span className={`${classes.qaBadge} ${unread > 0 ? classes.qaBadgeOffset : ''}`} data-testid="qa-open-badge" aria-hidden="true">?{qaBadge}</span>}
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

/** Painel de interações (Chat + Perguntas), reações temporárias e aviso de erro. Renderizado dentro do palco (inclusive em tela cheia). */
export function InteractionLayer({
  ui,
  messages,
  reactions,
  error,
  pending,
  connected,
  localPeerId,
  isPresenter = false,
  questions = [],
  highlightedQuestionId = null,
  qaError = null,
  qaPending = false,
  onWithdrawQuestion,
  onAnswerQuestionText,
  onUpdateQuestionStatus,
  ...pollProps
}: PollTabProps & {
  ui: InteractionsUi;
  messages: ChatMessage[];
  reactions: ReactionEvent[];
  error: string | null;
  pending: boolean;
  connected: boolean;
  localPeerId?: string;
  isPresenter?: boolean;
  questions?: QaQuestion[];
  highlightedQuestionId?: string | null;
  qaError?: string | null;
  qaPending?: boolean;
  onWithdrawQuestion?: (questionId: string) => boolean;
  onAnswerQuestionText?: (questionId: string, answerText: string) => boolean;
  onUpdateQuestionStatus?: (questionId: string, action: 'answer-verbal' | 'reopen' | 'highlight' | 'unhighlight') => boolean;
}) {
  const bannerError = error || qaError || pollProps.pollError;
  return <>
    <div className={classes.reactions} aria-live="polite" aria-atomic="false">
      {reactions.map(item => <div key={item.id} className={classes.reaction} data-testid="reaction-event">
        <span className={classes.reactionEmoji} aria-hidden="true">{symbols[item.reaction]}</span>
        <span className={classes.reactionName}>{item.nickname || 'Visitante'}</span>
        <span className={classes.srOnly}> reagiu: {labels[item.reaction]}</span>
      </div>)}
    </div>
    {!ui.opened && bannerError && <div role="status" className={classes.error}>{bannerError}</div>}
    {ui.opened && <InteractionsPanel
      {...pollProps}
      ui={ui}
      messages={messages}
      error={error}
      pending={pending}
      connected={connected}
      localPeerId={localPeerId}
      isPresenter={isPresenter}
      questions={questions}
      highlightedQuestionId={highlightedQuestionId}
      qaError={qaError}
      qaPending={qaPending}
      onWithdrawQuestion={onWithdrawQuestion}
      onAnswerQuestionText={onAnswerQuestionText}
      onUpdateQuestionStatus={onUpdateQuestionStatus}
    />}
  </>;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function InteractionsPanel({
  ui,
  messages,
  error,
  pending,
  connected,
  localPeerId,
  isPresenter,
  questions,
  highlightedQuestionId,
  qaError,
  qaPending,
  onWithdrawQuestion,
  onAnswerQuestionText,
  onUpdateQuestionStatus,
  ...pollProps
}: PollTabProps & {
  ui: InteractionsUi;
  messages: ChatMessage[];
  error: string | null;
  pending: boolean;
  connected: boolean;
  localPeerId?: string;
  isPresenter: boolean;
  questions: QaQuestion[];
  highlightedQuestionId: string | null;
  qaError: string | null;
  qaPending: boolean;
  onWithdrawQuestion?: (questionId: string) => boolean;
  onAnswerQuestionText?: (questionId: string, answerText: string) => boolean;
  onUpdateQuestionStatus?: (questionId: string, action: 'answer-verbal' | 'reopen' | 'highlight' | 'unhighlight') => boolean;
}) {
  const { tab, setTab, unread, openQuestionsCount } = ui;
  const panel = useRef<HTMLElement>(null);
  const chatTabRef = useRef<HTMLButtonElement>(null);
  const pollsTabRef = useRef<HTMLButtonElement>(null);
  const qaTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, []);

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const tabs: InteractionTab[] = ['chat', 'qa', 'polls'];
      const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]!;
      setTab(next);
      (next === 'chat' ? chatTabRef.current : next === 'qa' ? qaTabRef.current : pollsTabRef.current)?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      setTab('chat');
      chatTabRef.current?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      setTab('polls');
      pollsTabRef.current?.focus();
    }
  };

  return <section ref={panel} id="room-chat-panel" className={`${classes.panel} ${tab === 'qa' ? classes.qaPanel : ''}`} role="dialog" aria-modal="false" aria-labelledby="room-chat-title" tabIndex={-1}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); ui.closeChat(); } }}>
    <h2 id="room-chat-title" className={classes.srOnly}>Interações da sala</h2>
    <div className={classes.panelHeader}>
      <div className={classes.tabs} role="tablist" aria-label="Abas de interação" onKeyDown={onTabKeyDown}>
        <button
          ref={chatTabRef}
          type="button"
          role="tab"
          id="room-tab-chat"
          aria-selected={tab === 'chat'}
          aria-controls="room-tabpanel-chat"
          tabIndex={tab === 'chat' ? 0 : -1}
          className={classes.tab}
          data-active={tab === 'chat' || undefined}
          onClick={() => setTab('chat')}
        >
          <span>Chat</span>{ui.pendingFiles > 0 && <span className={classes.tabBadge} aria-label={`${ui.pendingFiles} arquivos pendentes`}>{ui.pendingFiles}</span>}
          {unread > 0 && <span className={classes.tabBadge} aria-label={`${unread} não lidas`}>{unread > 99 ? '99+' : unread}</span>}
        </button>
        <button
          ref={qaTabRef}
          type="button"
          role="tab"
          id="room-tab-qa"
          aria-selected={tab === 'qa'}
          aria-controls="room-tabpanel-qa"
          tabIndex={tab === 'qa' ? 0 : -1}
          className={classes.tab}
          data-active={tab === 'qa' || undefined}
          onClick={() => setTab('qa')}
        >
          <span>Perguntas</span>
          {openQuestionsCount > 0 && (
            <span className={`${classes.tabBadge} ${classes.tabBadgeQa}`} data-testid="qa-tab-count" aria-label={`${openQuestionsCount} em aberto`}>
              {openQuestionsCount > 99 ? '99+' : openQuestionsCount}
            </span>
          )}
        </button>
        <button ref={pollsTabRef} type="button" role="tab" id="room-tab-polls"
          aria-selected={tab === 'polls'} aria-controls="room-tabpanel-polls" tabIndex={tab === 'polls' ? 0 : -1}
          className={classes.tab} data-active={tab === 'polls' || undefined} onClick={() => setTab('polls')}>
          <span>Enquetes</span>{ui.hasOpenPoll && <span className={classes.pollTabDot} aria-label="Enquete aberta" />}
        </button>
      </div>
      <button type="button" className={classes.close} aria-label="Fechar chat" onClick={ui.closeChat}><IconClose size={16} aria-hidden /></button>
    </div>
    {tab === 'chat' ? (
      <ChatTabView ui={ui} messages={messages} error={error} pending={pending} connected={connected} localPeerId={localPeerId} />
    ) : tab === 'polls' ? (
      <PollTabView {...pollProps} ui={ui} connected={connected} isPresenter={isPresenter} />
    ) : (
      <QaTabView
        ui={ui}
        questions={questions}
        highlightedQuestionId={highlightedQuestionId}
        qaError={qaError}
        qaPending={qaPending}
        connected={connected}
        localPeerId={localPeerId}
        isPresenter={isPresenter}
        onWithdrawQuestion={onWithdrawQuestion}
        onAnswerQuestionText={onAnswerQuestionText}
        onUpdateQuestionStatus={onUpdateQuestionStatus}
      />
    )}
  </section>;
}

function ChatTabView({ ui, messages, error, pending, connected, localPeerId }: {
  ui: InteractionsUi; messages: ChatMessage[]; error: string | null; pending: boolean; connected: boolean; localPeerId?: string;
}) {
  const { draft, setDraft, scroll, atBottom, setAtBottom, unread } = ui;
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const pending = scroll.current?.querySelector<HTMLElement>('[data-pending-file]');
    const frame = requestAnimationFrame(() => {
      if (pending) pending.scrollIntoView({ block: 'nearest' });
      else scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
    });
    return () => cancelAnimationFrame(frame);
  }, [scroll]);
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
  }, [draft]);
  const canSend = connected && !pending && Boolean(draft.trim());
  const status = error || (!connected ? 'Sem conexão. Aguarde a reconexão para enviar.' : pending ? 'Enviando…' : '');
  const nearLimit = draft.length >= INTERACTION_LIMITS.textLength * 0.8;
  return <div id="room-tabpanel-chat" role="tabpanel" aria-labelledby="room-tab-chat" className={classes.tabPanel}>
    <div className={classes.logWrap}>
      <div className={classes.log} ref={scroll} role="log" aria-label="Mensagens da sala" aria-live="polite" tabIndex={0}
        onScroll={event => { const node = event.currentTarget; setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 48); }}>
        {messages.length === 0 && ui.fileDeliveries.length === 0 && <div className={classes.empty}>
          <span className={classes.emptyIcon} aria-hidden="true"><IconChat size={22} /></span>
          <strong>A conversa começa aqui</strong>
          <span>Converse com a sala ou anexe um arquivo privado. Quem entrar depois não verá o histórico.</span>
        </div>}
        {[...messages.map((item, index) => ({ kind: 'text' as const, item, index, time: item.timestamp })), ...groupDeliveries(ui.fileDeliveries).map(group => ({ kind: 'file' as const, group, time: ui.fileTimes.current.get(group[0].id) ?? 0 }))].sort((a, b) => a.time - b.time).map(entry => {
          if (entry.kind === 'file') return ui.files && <FileTransferCard key={entry.group[0].id} manager={ui.files} deliveries={entry.group} participants={ui.participants} />;
          const { item, index } = entry;
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
      {!atBottom && ui.pendingFiles > 0 && <button type="button" className={classes.jump} onClick={() => scroll.current?.querySelector<HTMLElement>('[data-pending-file]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}>Ver solicitação de arquivo</button>}
      {!atBottom && !ui.pendingFiles && unread > 0 && <button type="button" className={classes.jump} onClick={() => setAtBottom(true)}>
        <IconSend size={14} aria-hidden style={{ transform: 'rotate(180deg)' }} /> {unread} {unread === 1 ? 'nova mensagem' : 'novas mensagens'}
      </button>}
    </div>
    <form className={classes.composer} onSubmit={event => { event.preventDefault(); if (canSend) ui.send(); }}>
      <div role="status" className={`${classes.status} ${error ? classes.statusError : ''}`}>
        {status}
      </div>
      {ui.files && <FileAttachment manager={ui.files} participants={ui.participants} connected={connected} />}
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
  </div>;
}

function statusLabel(status: QaQuestion['status']): string {
  if (status === 'answered-text') return 'Respondida';
  if (status === 'answered-verbal') return 'Respondida ao vivo';
  return 'Aberta';
}

function QaTabView({
  ui,
  questions,
  highlightedQuestionId,
  qaError,
  qaPending,
  connected,
  localPeerId,
  isPresenter,
  onWithdrawQuestion,
  onAnswerQuestionText,
  onUpdateQuestionStatus,
}: {
  ui: InteractionsUi;
  questions: QaQuestion[];
  highlightedQuestionId: string | null;
  qaError: string | null;
  qaPending: boolean;
  connected: boolean;
  localPeerId?: string;
  isPresenter: boolean;
  onWithdrawQuestion?: (questionId: string) => boolean;
  onAnswerQuestionText?: (questionId: string, answerText: string) => boolean;
  onUpdateQuestionStatus?: (questionId: string, action: 'answer-verbal' | 'reopen' | 'highlight' | 'unhighlight') => boolean;
}) {
  const { qaDraft, setQaDraft } = ui;
  const field = useRef<HTMLTextAreaElement>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const lastReplyingIdRef = useRef<string | null>(null);
  const wasReplyingRef = useRef(false);

  const pendingFocusQuestionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (wasReplyingRef.current && !replyingId) {
      pendingFocusQuestionIdRef.current = lastReplyingIdRef.current;
    }
    if (replyingId) {
      lastReplyingIdRef.current = replyingId;
    }
    wasReplyingRef.current = Boolean(replyingId);
  }, [replyingId]);

  useEffect(() => {
    const questionId = pendingFocusQuestionIdRef.current;
    if (!questionId || replyingId || qaPending) return;

    pendingFocusQuestionIdRef.current = null;
    requestAnimationFrame(() => {
      const btn = document.querySelector<HTMLElement>(`[data-question-id="${questionId}"] [data-qa-reply-btn]`);
      if (btn && !btn.hasAttribute('disabled')) {
        btn.focus();
      } else {
        const card = document.querySelector<HTMLElement>(`[data-question-id="${questionId}"]`);
        card?.focus();
      }
    });
  }, [replyingId, qaPending]);

  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 108)}px`;
  }, [qaDraft]);

  useEffect(() => {
    if (replyingId && !questions.some(q => q.id === replyingId)) {
      setReplyingId(null);
      setReplyText('');
    }
  }, [questions, replyingId]);

  const orderedQuestions = [...questions].sort((a, b) =>
    Number(b.id === highlightedQuestionId) - Number(a.id === highlightedQuestionId));
  const menuHost = useRef<HTMLDivElement>(null);
  const [menuTarget, setMenuTarget] = useState<HTMLElement>();
  useLayoutEffect(() => {
    const updateTarget = () => setMenuTarget((document.fullscreenElement as HTMLElement | null)
      ?? menuHost.current?.closest<HTMLElement>('.stage-main-container') ?? document.body);
    updateTarget();
    document.addEventListener('fullscreenchange', updateTarget);
    return () => document.removeEventListener('fullscreenchange', updateTarget);
  }, []);

  const canSend = connected && !qaPending && Boolean(qaDraft.trim());
  const status = qaError || (!connected ? 'Sem conexão. Aguarde a reconexão para enviar.' : qaPending ? 'Sincronizando…' : '');
  const nearLimit = qaDraft.length >= QA_LIMITS.questionLength * 0.8;

  const submitInlineAnswer = (questionId: string) => {
    if (!connected || qaPending || !replyText.trim()) return;
    if (onAnswerQuestionText?.(questionId, replyText)) {
      setReplyingId(null);
      setReplyText('');
    }
  };

  return <div ref={menuHost} id="room-tabpanel-qa" role="tabpanel" aria-labelledby="room-tab-qa" className={classes.tabPanel}>
    <div className={classes.logWrap}>
      <div className={classes.log} role="region" aria-label="Lista de perguntas da sala" aria-live="polite" tabIndex={0}>
        {questions.length === 0 && (
          <div className={`${classes.empty} ${classes.qaEmpty}`}>
            <span className={classes.emptyIcon} aria-hidden="true"><IconChat size={22} /></span>
            <strong>Nenhuma pergunta ainda</strong>
            <span>O que você gostaria de saber? Envie a primeira pergunta.</span>
          </div>
        )}

        {orderedQuestions.map(item => {
          const own = Boolean(localPeerId) && item.authorPeerId === localPeerId;
          const isHighlighted = item.id === highlightedQuestionId;
          const isOpen = item.status === 'open';
          const isReplying = isPresenter && replyingId === item.id;
          const name = formatDisplayName(item.authorNickname, false);
          const color = getAvatarColor(name);

          return (
            <article
              key={item.id}
              data-testid="qa-question-card"
              data-question-id={item.id}
              tabIndex={-1}
              data-status={item.status}
              data-highlighted={isHighlighted || undefined}
              className={`${classes.qaCard} ${!isOpen ? classes.qaCardAnswered : ''} ${isHighlighted ? classes.qaCardHighlighted : ''}`}
            >
              <div className={classes.qaCardHeader}>
                <div className={classes.qaAuthor}>
                  <span className={classes.avatar} aria-hidden="true" style={{ background: color.bg, color: color.text }}>
                    {getInitials(name)}
                  </span>
                  <div className={classes.qaAuthorMeta}>
                    <strong>{own ? 'Você' : (item.authorNickname || 'Visitante')}</strong>
                    <time dateTime={new Date(item.createdAt).toISOString()}>{formatTime(item.createdAt)}</time>
                  </div>
                </div>
                {(own || isPresenter) && <Menu position="bottom-end" width={196} offset={4} returnFocus
                  portalProps={{ target: menuTarget }}
                  zIndex={100}>
                  <Menu.Target>
                    <button type="button" className={classes.qaMenuTrigger} aria-label="Ações da pergunta" disabled={!connected || qaPending}>
                      <IconDots size={18} aria-hidden />
                    </button>
                  </Menu.Target>
                  <Menu.Dropdown className={classes.qaMenu} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
                    {isPresenter && <>
                      <Menu.Item disabled={!connected || qaPending} onClick={() => onUpdateQuestionStatus?.(item.id, isHighlighted ? 'unhighlight' : 'highlight')}>
                        {isHighlighted ? 'Remover destaque' : 'Destacar'}
                      </Menu.Item>
                      <Menu.Item disabled={!connected || qaPending} onClick={() => onUpdateQuestionStatus?.(item.id, isOpen ? 'answer-verbal' : 'reopen')}>
                        {isOpen ? 'Respondida ao vivo' : 'Reabrir'}
                      </Menu.Item>
                    </>}
                    {own && <Menu.Item color="red" disabled={!connected || qaPending} aria-label="Retirar pergunta" onClick={() => onWithdrawQuestion?.(item.id)}>Retirar</Menu.Item>}
                  </Menu.Dropdown>
                </Menu>}
              </div>
              <div className={classes.qaBadges}>
                {isHighlighted && <span className={classes.qaStatusHighlight}>Em destaque</span>}
                <span className={`${classes.qaStatusBadge} ${isOpen ? classes.qaStatusOpen : classes.qaStatusDone}`} data-testid="qa-question-status">
                  {statusLabel(item.status)}
                </span>
              </div>

              <p className={classes.qaText}>{item.text}</p>

              {item.status === 'answered-verbal' && (
                <p className={classes.qaVerbalMeta}>
                  Respondida verbalmente por {item.answer?.answeredByNickname || 'Apresentador'}
                </p>
              )}

              {item.answer?.text && (
                <div className={classes.qaAnswer} data-testid="qa-question-answer">
                  <span className={classes.qaAnswerMeta}>
                    Resposta de {item.answer.answeredByNickname || 'Apresentador'} · {formatTime(item.answer.answeredAt)}
                  </span>
                  <p className={classes.qaAnswerText}>{item.answer.text}</p>
                </div>
              )}

              {isReplying && (
                <div className={classes.qaReplyBox}>
                  <textarea
                    autoFocus
                    aria-label="Resposta da pergunta"
                    placeholder="Escreva a resposta…"
                    rows={2}
                    maxLength={QA_LIMITS.answerLength}
                    value={replyText}
                    onChange={event => setReplyText(event.currentTarget.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        submitInlineAnswer(item.id);
                      } else if (event.key === 'Escape') {
                        event.stopPropagation();
                        setReplyingId(null);
                        setReplyText('');
                      }
                    }}
                  />
                  <div className={classes.qaReplyActions}>
                    <button
                      type="button"
                      className={classes.qaActionBtn}
                      onClick={() => { setReplyingId(null); setReplyText(''); }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={`${classes.qaActionBtn} ${classes.qaActionPrimary}`}
                      disabled={!connected || qaPending || !replyText.trim()}
                      onClick={() => submitInlineAnswer(item.id)}
                    >
                      Publicar resposta
                    </button>
                  </div>
                </div>
              )}

              {isPresenter && !isReplying && <div className={classes.qaActions}>
                <button type="button" data-qa-reply-btn className={`${classes.qaActionBtn} ${isOpen ? classes.qaActionPrimary : ''}`}
                  disabled={!connected || qaPending}
                  onClick={() => { setReplyingId(item.id); setReplyText(item.answer?.text ?? ''); }}>
                  {item.answer?.text ? 'Editar resposta' : 'Responder'}
                </button>
              </div>}
            </article>
          );
        })}
      </div>
    </div>

    <form className={classes.composer} onSubmit={event => { event.preventDefault(); if (canSend) ui.submitQa(); }}>
      <div role="status" className={`${classes.status} ${qaError ? classes.statusError : ''}`}>
        {status}
      </div>
      <div className={classes.field} data-disabled={!connected || undefined}>
        <textarea
          ref={field}
          aria-label="Pergunta"
          placeholder="Faça uma pergunta para a sala"
          value={qaDraft}
          readOnly={qaPending}
          rows={1}
          maxLength={QA_LIMITS.questionLength}
          onChange={event => setQaDraft(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (canSend) ui.submitQa();
            }
          }}
        />
        <button type="submit" className={classes.send} aria-label="Enviar pergunta" aria-busy={qaPending} disabled={!canSend}>
          {qaPending ? <span className={classes.spinner} aria-hidden="true" /> : <IconSend size={16} aria-hidden />}
        </button>
      </div>
      {nearLimit && <div className={classes.footnote}><span className={classes.counter}>{qaDraft.length}/{QA_LIMITS.questionLength}</span></div>}
    </form>
  </div>;
}

