import { randomUUID } from 'node:crypto';
import { POLL_LIMITS, type Poll, type PollOperation, type PollsSnapshot } from '@screen-room/protocol';
import type { ParticipantMeta } from './room-state.js';

type StoredPoll = Omit<Poll, 'ownVote' | 'counts'> & { votes: Map<string, number>; counts: number[] };

/** Only aggregate results and the recipient's own choice leave this in-memory store. */
export class RoomPolls {
  #rooms = new Map<string, StoredPoll[]>();
  #clock = 0;

  delete(room: string) { this.#rooms.delete(room); }

  snapshot(roomId: string, participant?: ParticipantMeta): PollsSnapshot {
    return {
      type: 'polls-snapshot', roomId, revision: ++this.#clock,
      polls: (this.#rooms.get(roomId) ?? []).map(({ votes, counts, ...poll }) => {
        const ownVote = participant?.pollIdentity ? votes.get(participant.pollIdentity) ?? null : null;
        return { ...poll, ownVote, counts: poll.closedAt !== null || participant?.sharing?.active || ownVote !== null ? [...counts] : null };
      }),
    };
  }

  apply(room: string, meta: ParticipantMeta | undefined, operation: PollOperation, now = Date.now()): string | null {
    if (!meta?.pollIdentity) return 'Entre na sala antes de usar enquetes.';
    const budget = meta.polls ||= { times: [], ids: [] };
    budget.times = budget.times.filter(time => now - time < POLL_LIMITS.windowMs);
    if (budget.times.length >= POLL_LIMITS.burst) return 'Muitas ações de enquetes. Aguarde alguns segundos.';
    budget.times.push(now);
    if (budget.ids.includes(operation.requestId)) return 'Esta ação já foi processada.';
    budget.ids = [...budget.ids.slice(-63), operation.requestId];
    if (operation.type !== 'vote-poll' && !meta.sharing?.active) return 'Apenas apresentadores compartilhando tela podem criar ou encerrar enquetes.';
    const polls = this.#rooms.get(room) ?? [];
    if (operation.type === 'create-poll') {
      if (polls.some(poll => poll.closedAt === null)) return 'Já existe uma enquete aberta nesta sala.';
      polls.unshift({ id: randomUUID(), question: operation.question, options: [...operation.options], createdAt: now,
        closedAt: null, votes: new Map(), counts: operation.options.map(() => 0) });
      this.#rooms.set(room, polls);
      return null;
    }
    const poll = polls.find(item => item.id === operation.pollId);
    if (!poll || poll.closedAt !== null) return 'Enquete não encontrada ou já encerrada.';
    if (operation.type === 'close-poll') {
      poll.closedAt = now;
      this.#rooms.set(room, polls.slice(0, POLL_LIMITS.closedHistory));
      return null;
    }
    if (operation.option >= poll.options.length) return 'Alternativa inválida.';
    const previous = poll.votes.get(meta.pollIdentity);
    if (previous === undefined && poll.votes.size >= POLL_LIMITS.votersPerPoll) return 'Limite de votos desta enquete atingido.';
    if (previous !== undefined) poll.counts[previous]!--;
    poll.votes.set(meta.pollIdentity, operation.option);
    poll.counts[operation.option]!++;
    return null;
  }
}
