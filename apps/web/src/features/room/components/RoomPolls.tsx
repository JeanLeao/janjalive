import { useEffect, useRef, useState } from 'react';
import { POLL_LIMITS, type Poll } from '@screen-room/protocol';
import type { InteractionsUi } from './RoomInteractions';
import classes from './RoomInteractions.module.css';

export interface PollTabProps {
  polls?: Poll[];
  pollsReady?: boolean;
  pollError?: string | null;
  pollPending?: boolean;
  onCreatePoll?: (question: string, options: string[]) => boolean;
  onVotePoll?: (pollId: string, option: number) => boolean;
  onClosePoll?: (pollId: string) => boolean;
}

export function PollTabView({ ui, connected, isPresenter, polls = [], pollsReady = false, pollError, pollPending = false,
  onCreatePoll, onVotePoll, onClosePoll }: PollTabProps & { ui: InteractionsUi; connected: boolean; isPresenter: boolean }) {
  const open = polls.find(poll => poll.closedAt === null);
  const history = polls.filter(poll => poll.closedAt !== null);
  const { pollDraft: draft, setPollDraft } = ui;
  const submitting = useRef(false);
  const disabled = !connected || !pollsReady || pollPending;
  useEffect(() => {
    if (submitting.current && !pollPending && (pollError || open)) {
      if (!pollError && open) setPollDraft({ question: '', options: ['', ''] });
      submitting.current = false;
    }
  }, [pollPending, pollError, open, setPollDraft]);
  const status = pollError || (!connected ? 'Sem conexão. Aguarde a reconexão para participar.' : !pollsReady ? 'Sincronizando enquetes…' : pollPending ? 'Enviando ação…' : '');
  return <div id="room-tabpanel-polls" role="tabpanel" aria-labelledby="room-tab-polls" className={classes.tabPanel}>
    <div className={classes.log} role="region" aria-label="Enquetes da sala" tabIndex={0}>
      <div role="status" className={`${classes.status} ${pollError ? classes.statusError : ''}`}>{status}</div>
      {open ? <PollCard key={open.id} poll={open} disabled={disabled} isPresenter={isPresenter} onVote={onVotePoll} onClose={onClosePoll} /> : <>
        {pollsReady && <div className={`${classes.empty} ${classes.qaEmpty}`}>
          <strong>Nenhuma enquete aberta</strong>
          <span>{isPresenter ? 'Crie uma votação rápida para ouvir a sala.' : 'Quando um apresentador criar uma enquete, você poderá votar aqui.'}</span>
        </div>}
        {isPresenter && <form className={classes.pollForm} aria-label="Criar enquete" onSubmit={event => {
          event.preventDefault();
          if (onCreatePoll?.(draft.question, draft.options)) submitting.current = true;
        }}>
          <h3 className={classes.pollHeading}>Nova enquete</h3>
          <label>Pergunta <textarea aria-label="Pergunta da enquete" required maxLength={POLL_LIMITS.questionLength}
            rows={2} value={draft.question} disabled={disabled} onChange={event => setPollDraft({ ...draft, question: event.target.value })} /></label>
          {draft.options.map((option, index) => <label key={index}>Alternativa {index + 1}
            <input aria-label={`Alternativa ${index + 1}`} required maxLength={POLL_LIMITS.optionLength} value={option} disabled={disabled}
              onChange={event => setPollDraft({ ...draft, options: draft.options.map((text, i) => i === index ? event.target.value : text) })} />
          </label>)}
          <div className={classes.qaActions}>
            {draft.options.length < POLL_LIMITS.maxOptions && <button type="button" className={classes.qaActionBtn} disabled={disabled}
              onClick={() => setPollDraft({ ...draft, options: [...draft.options, ''] })}>Adicionar alternativa</button>}
            {draft.options.length > POLL_LIMITS.minOptions && <button type="button" className={classes.qaActionBtn} disabled={disabled}
              onClick={() => setPollDraft({ ...draft, options: draft.options.slice(0, -1) })}>Remover última</button>}
          </div>
          <p className={classes.pollHint}>Até 300 caracteres na pergunta e 120 por alternativa. Uma enquete aberta por vez.</p>
          <button type="submit" className={`${classes.qaActionBtn} ${classes.qaActionPrimary}`} disabled={disabled || !draft.question.trim() || draft.options.some(option => !option.trim())}
            aria-busy={pollPending}>Criar enquete</button>
        </form>}
      </>}
      {history.length > 0 && <section aria-label="Histórico de enquetes" className={classes.pollHistory}>
        <h3 className={classes.pollHeading}>Encerradas <span>({history.length})</span></h3>
        {history.map(poll => <details key={poll.id} className={classes.pollDetails}>
          <summary>{poll.question}</summary><PollCard poll={poll} disabled isPresenter={false} />
        </details>)}
      </section>}
    </div>
  </div>;
}

function PollCard({ poll, disabled, isPresenter, onVote, onClose }: {
  poll: Poll; disabled: boolean; isPresenter: boolean;
  onVote?: (id: string, option: number) => boolean; onClose?: (id: string) => boolean;
}) {
  const [selection, setSelection] = useState<number | null>(poll.ownVote);
  useEffect(() => { setSelection(poll.ownVote); }, [poll.ownVote]);
  const closed = poll.closedAt !== null;
  const total = poll.counts?.reduce((sum, count) => sum + count, 0) ?? 0;
  return <article className={classes.pollCard} data-testid="poll-card" aria-label={poll.question}>
    <div className={classes.qaBadges}><span className={`${classes.qaStatusBadge} ${closed ? classes.qaStatusDone : classes.qaStatusOpen}`}>{closed ? 'Encerrada · resultado final' : 'Aberta'}</span></div>
    <h3 className={classes.pollQuestion}>{poll.question}</h3>
    <form onSubmit={event => { event.preventDefault(); if (selection !== null) onVote?.(poll.id, selection); }}>
      <fieldset className={classes.pollOptions} disabled={disabled || closed}>
        <legend className={classes.srOnly}>Escolha uma alternativa</legend>
        {poll.options.map((option, index) => {
          const count = poll.counts?.[index] ?? 0;
          const percent = total ? Math.round(count / total * 100) : 0;
          return <label className={classes.pollOption} key={index} data-selected={poll.ownVote === index || undefined}>
            <span className={classes.pollOptionLine}>
              {!closed && <input type="radio" name={`poll-${poll.id}`} value={index} checked={selection === index} onChange={() => setSelection(index)} />}
              <span>{option}{poll.ownVote === index && <small>Seu voto</small>}</span>
              {poll.counts && <span className={classes.pollNumbers}>{count} · {percent}%</span>}
            </span>
            {poll.counts && <span className={classes.pollBar} aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>}
          </label>;
        })}
      </fieldset>
      {poll.counts ? <p className={classes.pollHint} role="status">{total} {total === 1 ? 'voto' : 'votos'}{!closed && ' · Resultados ao vivo'}</p>
        : <p className={classes.pollHint}>Vote para acompanhar os resultados ao vivo.</p>}
      {!closed && <div className={classes.qaActions}>
        <button type="submit" className={`${classes.qaActionBtn} ${classes.qaActionPrimary}`} disabled={disabled || selection === null || selection === poll.ownVote}>
          {poll.ownVote === null ? 'Votar' : 'Alterar voto'}</button>
        {isPresenter && <button type="button" className={classes.qaActionBtn} disabled={disabled} onClick={() => onClose?.(poll.id)}>Encerrar enquete</button>}
      </div>}
    </form>
  </article>;
}
