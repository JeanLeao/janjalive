import {
  normalizeRoom, normalizePeer, type SharingState, type ParticipantInfo,
  type PresenterCollaborationMessage, type PointMessage, type SpectatorDrawingMessage,
  type ClearCollaborativeDrawingsMessage, COLLABORATION_LIMITS,
  type StageSelection, STAGE_SELECTION_LIMITS, type HandState, type HandsSnapshot, HAND_LIMITS,
  type RoomState, type QaQuestion, type QuestionsSnapshot, type UpdateQuestionMessage, QA_LIMITS,
} from '@screen-room/protocol';
import { RoomPolls } from './room-polls.js';
import * as crypto from 'node:crypto';

export interface InteractionBudget { chat: number[]; reaction: number[]; ids: string[] }

export interface QaBudget { times: number[]; ids: string[] }

export interface RoomQaState {
  revision: number;
  nextOrder: number;
  highlightedQuestionId: string | null;
  questions: Map<string, QaQuestion>;
}

export interface PointingSenderBudget {
  seq: number;
  times: number[];
  ids: string[];
}

export interface SpectatorDrawingSenderBudget {
  seq: number;
  times: number[];
  ids: string[];
}

export interface ParticipantMeta {
  hand?: Omit<HandState, 'peerId'>;
  handTimes?: number[];
  pollIdentity?: string;
  polls?: QaBudget;
  qa?: QaBudget;
  interactions?: InteractionBudget;
  collaboration?: {
    streamId: string;
    seq: number;
    laser: number[];
    drawing: number[];
    clear: number[];
    clearCollaborative?: number[];
    clearCollaborativeSeq?: number;
    pointingBySender?: Map<string, PointingSenderBudget>;
    drawingBySender?: Map<string, SpectatorDrawingSenderBudget>;
    aggregateDrawingTimes?: number[];
  };
  camera?: { active: boolean };
  sharing?: SharingState;
  nickname?: string;
  reconnectToken: string;
  /** F29: ephemeral stage selection; `selectionSeq` only grows so stale updates stay detectable. */
  selection?: StageSelection;
  selectionSeq?: number;
  selectionTimes?: number[];
}

export interface RecoveryReservation {
  hand?: Omit<HandState, 'peerId'>;
  handTimes?: number[];
  pollIdentity?: string;
  polls?: QaBudget;
  qa?: QaBudget;
  interactions?: InteractionBudget;
  sharing?: SharingState;
  selection?: StageSelection;
  selectionSeq?: number;
  reconnectToken: string;
  nickname?: string;
  timer: NodeJS.Timeout;
  expiresAt: number;
}

export class RoomCapacityError extends Error {
  readonly maxCapacity: number;
  constructor(maxCapacity: number) {
    super(`Sala cheia: capacidade máxima de ${maxCapacity} participantes atingida.`);
    this.name = 'RoomCapacityError';
    this.maxCapacity = maxCapacity;
  }
}

export class UnauthorizedReconnectError extends Error {
  constructor(message = 'Sessão ativa detectada para este peer. Credencial de reconexão inválida ou ausente.') {
    super(message);
    this.name = 'UnauthorizedReconnectError';
  }
}

export class RoomAdmissionError extends Error {
  constructor(readonly code: 'ROOM_NOT_FOUND' | 'ROOM_LOCKED' | 'UNAUTHORIZED_HOST' | 'KEY_REQUIRED' | 'KEY_INVALID') {
    super(
      code === 'ROOM_NOT_FOUND'
        ? 'Sala inexistente ou encerrada. Crie uma nova sala na página inicial.'
        : code === 'ROOM_LOCKED'
        ? 'Sala bloqueada pelo host. Novas entradas estão desativadas.'
        : code === 'UNAUTHORIZED_HOST'
        ? 'Credencial administrativa inválida ou revogada.'
        : code === 'KEY_REQUIRED'
        ? 'Esta sala é protegida por chave. Informe a chave de acesso para entrar.'
        : 'Chave de acesso incorreta. Verifique a chave e tente novamente.'
    );
    this.name = 'RoomAdmissionError';
  }
}

export interface RoomProtection {
  keySalt: string;
  keyVerifier: Buffer;
}

interface Administration {
  credential?: string;
  hostPeerId: string | null;
  locked: boolean;
  revision: number;
  timer?: NodeJS.Timeout;
  protection?: RoomProtection;
}

export class RoomRegistry {
  static readonly DEFAULT_RECOVERY_GRACE_MS = 30000;
  readonly polls = new RoomPolls();
  #administration = new Map<string, Administration>();
  onRoomStateChanged?: (roomId: string) => void;
  createRoom(
    roomId = crypto.randomBytes(16).toString('hex'),
    ttlMs = 60000,
    isProtected = false
  ): { roomId: string; hostCredential: string; roomKey?: string } {
    roomId = normalizeRoom(roomId);
    if (this.#rooms.has(roomId)) throw new Error('Sala já existe.');
    const hostCredential = crypto.randomBytes(32).toString('base64url');
    let protection: RoomProtection | undefined;
    let roomKey: string | undefined;
    if (isProtected) {
      roomKey = crypto.randomBytes(16).toString('base64url');
      const keySalt = crypto.randomBytes(16).toString('hex');
      const keyVerifier = crypto.createHmac('sha256', keySalt).update(roomKey).digest();
      protection = { keySalt, keyVerifier };
    }
    const admin: Administration = { credential: hostCredential, hostPeerId: null, locked: false, revision: 0, protection };
    this.#rooms.set(roomId, new Map());
    this.#administration.set(roomId, admin);
    admin.timer = setTimeout(() => {
      // An invited visitor cannot extend the unclaimed creation grant indefinitely.
      if (!admin.hostPeerId) {
        this.#revokeHost(roomId);
        if (!this.count(roomId) && !this.hasAnyRecoveryForRoom(roomId)) this.#destroyAdministration(roomId);
      }
    }, ttlMs);
    admin.timer.unref();
    return { roomId, hostCredential, ...(roomKey ? { roomKey } : {}) };
  }
  roomState(roomId: string): RoomState {
    const admin = this.#administration.get(roomId);
    return {
      hostPeerId: admin?.hostPeerId ?? null,
      hostConnected: Boolean(admin?.hostPeerId && this.hasPeer(roomId, admin.hostPeerId)),
      locked: admin?.locked ?? false,
      revision: admin?.revision ?? 0,
      isProtected: Boolean(admin?.protection),
    };
  }
  isProtected(roomId: unknown): boolean {
    try {
      const room = normalizeRoom(roomId);
      return Boolean(this.#administration.get(room)?.protection);
    } catch {
      return false;
    }
  }
  isLocked(roomId: unknown): boolean {
    try {
      const room = normalizeRoom(roomId);
      return Boolean(this.#administration.get(room)?.locked);
    } catch {
      return false;
    }
  }
  hasRoom(roomId: unknown): boolean {
    try {
      const room = normalizeRoom(roomId);
      return this.#rooms.has(room);
    } catch {
      return false;
    }
  }
  verifyRoomKey(roomId: unknown, candidateKey: unknown): boolean {
    try {
      const room = normalizeRoom(roomId);
      const admin = this.#administration.get(room);
      if (!admin?.protection) return false;
      if (typeof candidateKey !== 'string') return false;
      const trimmed = candidateKey.trim();
      if (!trimmed) return false;
      const candidateVerifier = crypto.createHmac('sha256', admin.protection.keySalt).update(trimmed).digest();
      return crypto.timingSafeEqual(admin.protection.keyVerifier, candidateVerifier);
    } catch {
      return false;
    }
  }
  canAuthorizeHost(room: unknown, peer: unknown, credential: unknown): boolean {
    try {
      const normalizedRoom = normalizeRoom(room);
      const normalizedPeer = normalizePeer(peer);
      const admin = this.#administration.get(normalizedRoom);
      return Boolean(
        admin?.credential &&
        credential === admin.credential &&
        (admin.hostPeerId === null || admin.hostPeerId === normalizedPeer)
      );
    } catch {
      return false;
    }
  }
  authorizeHost(room: string, peer: string, credential: unknown): boolean {
    const admin = this.#administration.get(room);
    return Boolean(admin?.credential && admin.hostPeerId === peer && credential === admin.credential && this.hasPeer(room, peer));
  }
  moderate(room: string, peer: string, revision: number, action: 'lock' | 'unlock' | 'remove', target?: string): void {
    const admin = this.#administration.get(room);
    if (!admin || admin.hostPeerId !== peer || !this.hasPeer(room, peer)) throw new Error('Somente o host pode moderar a sala.');
    if (admin.revision !== revision) throw new Error('O estado da sala mudou. Tente novamente.');
    if (action === 'remove') {
      if (!target || target === peer || !this.hasPeer(room, target)) throw new Error('Participante indisponível para remoção.');
    } else admin.locked = action === 'lock';
    admin.revision++;
  }
  #revokeHost(room: string): void {
    const admin = this.#administration.get(room);
    if (!admin) return;
    admin.credential = undefined;
    admin.hostPeerId = null;
    admin.locked = false;
    admin.revision++;
    this.onRoomStateChanged?.(room);
  }
  #destroyAdministration(room: string): void {
    clearTimeout(this.#administration.get(room)?.timer);
    this.#administration.delete(room);
    this.#rooms.delete(room);
    this.#qaByRoom.delete(room);
    this.polls.delete(room);
  }
  #expireRecovery(room: string, peer: string): void {
    this.clearRecovery(room, peer);
    if (this.#administration.get(room)?.hostPeerId === peer) this.#revokeHost(room);
    if (!this.count(room) && !this.hasAnyRecoveryForRoom(room)) this.#destroyAdministration(room);
  }
  #handClock = 0;
  #rooms = new Map<string, Map<string, ParticipantMeta>>();
  #qaByRoom = new Map<string, RoomQaState>();
  #recoveryReservations = new Map<string, RecoveryReservation>();
  readonly maxParticipants: number;

  constructor(maxParticipants = 10) {
    const parsed = Number(maxParticipants);
    this.maxParticipants = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 10;
  }

  join(
    roomId: unknown,
    peerId: unknown,
    nickname?: unknown,
    reconnectToken?: unknown,
    hostCredential?: unknown,
    roomKey?: unknown
  ): string[] {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    this.getReservedPeers(room);
    const participants = this.#rooms.get(room);
    if (!participants) throw new RoomAdmissionError('ROOM_NOT_FOUND');
    const admin = this.#administration.get(room)!;

    const isHostAttempt = hostCredential !== undefined;
    const isHostValid = Boolean(
      admin.credential &&
      hostCredential === admin.credential &&
      (admin.hostPeerId === null || admin.hostPeerId === peer)
    );

    if (isHostAttempt && !isHostValid) throw new RoomAdmissionError('UNAUTHORIZED_HOST');
    if (admin.hostPeerId === peer && (!admin.credential || hostCredential !== admin.credential)) throw new RoomAdmissionError('UNAUTHORIZED_HOST');

    const existingMeta = participants.get(peer);
    const reservation = this.getRecoveryReservation(room, peer);

    if (existingMeta) {
      const provided = typeof reconnectToken === 'string' ? reconnectToken.trim() : '';
      if (!provided || provided !== existingMeta.reconnectToken) {
        throw new UnauthorizedReconnectError(
          'Sessão ativa detectada para este peer. Credencial de reconexão inválida ou ausente.'
        );
      }
    } else if (reservation) {
      const provided = typeof reconnectToken === 'string' ? reconnectToken.trim() : '';
      if (!provided || provided !== reservation.reconnectToken) {
        throw new UnauthorizedReconnectError(
          'Identidade em período de recuperação efêmera. Credencial de reconexão inválida ou ausente.'
        );
      }
      this.clearRecovery(room, peer);
    } else {
      if (reconnectToken !== undefined) throw new UnauthorizedReconnectError('Sessão anterior expirada ou removida. Entre novamente pela página inicial.');

      if (admin.protection && !isHostValid) {
        if (roomKey === undefined || roomKey === null || (typeof roomKey === 'string' && !roomKey.trim())) {
          throw new RoomAdmissionError('KEY_REQUIRED');
        }
        if (!this.verifyRoomKey(room, roomKey)) {
          throw new RoomAdmissionError('KEY_INVALID');
        }
      }

      if (admin.locked) throw new RoomAdmissionError('ROOM_LOCKED');
      if (this.occupiedSlots(room) >= this.maxParticipants) {
        throw new RoomCapacityError(this.maxParticipants);
      }
    }

    if (hostCredential && !admin.hostPeerId) {
      admin.hostPeerId = peer;
      admin.revision++;
      clearTimeout(admin.timer);
    }
    const existingPeers = Array.from(participants.keys()).filter((p) => p !== peer);

    const cleanNickname =
      typeof nickname === 'string' && nickname.trim()
        ? nickname.trim().slice(0, 32)
        : existingMeta?.nickname ?? reservation?.nickname;

    const token =
      existingMeta?.reconnectToken ??
      reservation?.reconnectToken ??
      crypto.randomUUID();

    const preservedSharing = existingMeta?.sharing ?? reservation?.sharing;
    participants.set(peer, {
      hand: existingMeta?.hand ?? reservation?.hand,
      handTimes: existingMeta?.handTimes ?? reservation?.handTimes,
      pollIdentity: existingMeta?.pollIdentity ?? reservation?.pollIdentity ?? crypto.randomUUID(),
      polls: existingMeta?.polls ?? reservation?.polls,
      qa: existingMeta?.qa ?? reservation?.qa,
      interactions: existingMeta?.interactions ?? reservation?.interactions,
      nickname: cleanNickname,
      reconnectToken: token,
      ...(preservedSharing ? { sharing: preservedSharing } : {}),
      ...(existingMeta?.collaboration ? { collaboration: existingMeta.collaboration } : {}),
      ...((existingMeta?.selection ?? reservation?.selection) ? { selection: existingMeta?.selection ?? reservation?.selection } : {}),
      ...((existingMeta?.selectionSeq ?? reservation?.selectionSeq) !== undefined ? { selectionSeq: existingMeta?.selectionSeq ?? reservation?.selectionSeq } : {}),
    });
    admin.revision++;
    const restored = participants.get(peer)!;
    if (restored.selection && !this.#validSelection(participants, restored)) restored.selection = undefined;
    this.#syncQaNicknames(room, peer, cleanNickname);
    return existingPeers;
  }

  leave(
    roomId: unknown,
    peerId: unknown,
    isVoluntary = true,
    graceMs = RoomRegistry.DEFAULT_RECOVERY_GRACE_MS
  ): string[] {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const reservationKey = `${room}:${peer}`;
    const participants = this.#rooms.get(room);
    if (!participants) return [];

    const existingMeta = participants.get(peer);
    participants.delete(peer);
    const admin = this.#administration.get(room);
    if (existingMeta && admin) admin.revision++;

    if (isVoluntary) {
      this.clearRecovery(room, peer);
      if (this.#administration.get(room)?.hostPeerId === peer) this.#revokeHost(room);
      if (participants.size === 0 && !this.hasAnyRecoveryForRoom(room)) {
        this.#destroyAdministration(room);
      }
    } else if (existingMeta) {
      this.clearRecovery(room, peer);
      const timer = setTimeout(() => {
        this.#expireRecovery(room, peer);
      }, graceMs);

      if (typeof timer.unref === 'function') {
        timer.unref();
      }

      this.#recoveryReservations.set(reservationKey, {
        reconnectToken: existingMeta.reconnectToken,
        nickname: existingMeta.nickname,
        hand: existingMeta.hand,
        handTimes: existingMeta.handTimes,
        pollIdentity: existingMeta.pollIdentity,
        polls: existingMeta.polls,
        qa: existingMeta.qa,
        interactions: existingMeta.interactions,
        sharing: existingMeta.sharing,
        selection: existingMeta.selection,
        selectionSeq: existingMeta.selectionSeq,
        timer,
        expiresAt: Date.now() + graceMs,
      });
    }

    const remaining = Array.from(participants.keys());
    return remaining;
  }

  peers(roomId: unknown): string[] {
    const room = normalizeRoom(roomId);
    return Array.from(this.#rooms.get(room)?.keys() ?? []);
  }

  getParticipants(roomId: unknown): ParticipantInfo[] {
    const room = normalizeRoom(roomId);
    const participants = this.#rooms.get(room);
    if (!participants) return [];
    return Array.from(participants.entries()).map(([peerId, meta]) => ({
      peerId,
      ...(meta.sharing ? { sharing: meta.sharing } : {}),
      ...(meta.camera ? { camera: meta.camera } : {}),
      ...(meta.selection && this.#validSelection(participants, meta) ? { selection: meta.selection } : {}),
      ...(meta.nickname ? { nickname: meta.nickname } : {}),
    }));
  }

  /** Connected identities only; reservations keep their hand privately until recovery. */
  handsSnapshot(roomId: string): HandsSnapshot {
    return { type: 'hands-snapshot', roomId, revision: ++this.#handClock,
      hands: Array.from(this.#rooms.get(roomId) ?? [], ([peerId, meta]) => ({
        peerId, order: meta.hand?.order ?? null, version: meta.hand?.version ?? 0,
      })) };
  }

  setHand(roomId: string, peerId: string, raised: boolean, version: number, now = Date.now()): boolean {
    const meta = this.#rooms.get(roomId)?.get(peerId);
    if (!meta) return false;
    meta.handTimes = (meta.handTimes ?? []).filter(time => now - time < HAND_LIMITS.windowMs);
    if (meta.handTimes.length >= HAND_LIMITS.burst) return false;
    meta.handTimes.push(now);
    if (version !== (meta.hand?.version ?? 0)) return false;
    if (raised === Boolean(meta.hand?.order)) return true;
    meta.hand = { order: raised ? ++this.#handClock : null, version: version + 1 };
    return true;
  }

  pollParticipant(roomId: string, peerId: string): ParticipantMeta | undefined {
    return this.#rooms.get(roomId)?.get(peerId);
  }

  #ensureQaState(roomId: string): RoomQaState {
    let state = this.#qaByRoom.get(roomId);
    if (!state) {
      state = {
        revision: 1,
        nextOrder: 1,
        highlightedQuestionId: null,
        questions: new Map(),
      };
      this.#qaByRoom.set(roomId, state);
    }
    return state;
  }

  #consumeQaBudget(meta: ParticipantMeta, requestId: string, now: number): string | null {
    const budget = (meta.qa ||= { times: [], ids: [] });
    budget.times = budget.times.filter((time) => now - time < QA_LIMITS.windowMs);
    if (budget.times.length >= QA_LIMITS.burst) {
      return 'Muitas ações de perguntas. Aguarde alguns segundos.';
    }
    budget.times.push(now);
    if (budget.ids.includes(requestId)) {
      return 'Esta ação já foi processada.';
    }
    budget.ids = [...budget.ids.slice(-63), requestId];
    return null;
  }

  /**
   * Returns current Q&A snapshot for a room, sorted with open questions first (by arrival order),
   * followed by answered questions (by arrival order).
   */
  questionsSnapshot(roomId: string): QuestionsSnapshot {
    const room = normalizeRoom(roomId);
    const state = this.#qaByRoom.get(room);
    if (!state) {
      return {
        type: 'questions-snapshot',
        roomId: room,
        revision: 1,
        highlightedQuestionId: null,
        questions: [],
      };
    }
    const sorted = Array.from(state.questions.values()).sort((a, b) => {
      const aOpen = a.status === 'open' ? 0 : 1;
      const bOpen = b.status === 'open' ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return a.order - b.order;
    });
    return {
      type: 'questions-snapshot',
      roomId: room,
      revision: state.revision,
      highlightedQuestionId:
        state.highlightedQuestionId && state.questions.has(state.highlightedQuestionId)
          ? state.highlightedQuestionId
          : null,
      questions: sorted,
    };
  }

  submitQuestion(
    roomId: string,
    peerId: string,
    requestId: string,
    text: string,
    now = Date.now()
  ): { ok: true; question: QaQuestion; snapshot: QuestionsSnapshot } | { ok: false; message: string } {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const participants = this.#rooms.get(room);
    const meta = participants?.get(peer);
    if (!participants || !meta) {
      return { ok: false, message: 'Entre na sala antes de enviar uma pergunta.' };
    }
    const budgetErr = this.#consumeQaBudget(meta, requestId, now);
    if (budgetErr) return { ok: false, message: budgetErr };

    const state = this.#ensureQaState(room);
    if (state.questions.size >= QA_LIMITS.maxQuestionsPerRoom) {
      return {
        ok: false,
        message: `Limite de ${QA_LIMITS.maxQuestionsPerRoom} perguntas na sala atingido.`,
      };
    }

    const question: QaQuestion = {
      id: crypto.randomUUID(),
      order: state.nextOrder++,
      authorPeerId: peer,
      ...(meta.nickname ? { authorNickname: meta.nickname } : {}),
      text,
      createdAt: now,
      status: 'open',
    };
    state.questions.set(question.id, question);
    state.revision++;
    return { ok: true, question, snapshot: this.questionsSnapshot(room) };
  }

  withdrawQuestion(
    roomId: string,
    peerId: string,
    requestId: string,
    questionId: string,
    now = Date.now()
  ): { ok: true; snapshot: QuestionsSnapshot } | { ok: false; message: string } {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const participants = this.#rooms.get(room);
    const meta = participants?.get(peer);
    if (!participants || !meta) {
      return { ok: false, message: 'Entre na sala antes de retirar a pergunta.' };
    }
    const budgetErr = this.#consumeQaBudget(meta, requestId, now);
    if (budgetErr) return { ok: false, message: budgetErr };

    const state = this.#qaByRoom.get(room);
    const question = state?.questions.get(questionId);
    if (!state || !question) {
      return { ok: false, message: 'Pergunta não encontrada ou já retirada.' };
    }
    if (question.authorPeerId !== peer) {
      return { ok: false, message: 'Apenas o autor pode retirar a própria pergunta.' };
    }

    state.questions.delete(questionId);
    if (state.highlightedQuestionId === questionId) {
      state.highlightedQuestionId = null;
    }
    state.revision++;
    return { ok: true, snapshot: this.questionsSnapshot(room) };
  }

  updateQuestion(
    roomId: string,
    peerId: string,
    update: UpdateQuestionMessage,
    now = Date.now()
  ): { ok: true; snapshot: QuestionsSnapshot } | { ok: false; message: string } {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const participants = this.#rooms.get(room);
    const meta = participants?.get(peer);
    if (!participants || !meta) {
      return { ok: false, message: 'Entre na sala antes de atualizar perguntas.' };
    }
    const budgetErr = this.#consumeQaBudget(meta, update.requestId, now);
    if (budgetErr) return { ok: false, message: budgetErr };

    if (!meta.sharing?.active) {
      return {
        ok: false,
        message: 'Apenas apresentadores compartilhando tela podem gerenciar perguntas.',
      };
    }

    const state = this.#qaByRoom.get(room);
    const question = state?.questions.get(update.questionId);
    if (!state || !question) {
      return { ok: false, message: 'Pergunta não encontrada.' };
    }

    if (update.action === 'answer-text') {
      state.questions.set(question.id, {
        ...question,
        status: 'answered-text',
        answer: {
          text: update.answerText ?? '',
          answeredByPeerId: peer,
          ...(meta.nickname ? { answeredByNickname: meta.nickname } : {}),
          answeredAt: now,
        },
      });
    } else if (update.action === 'answer-verbal') {
      state.questions.set(question.id, {
        ...question,
        status: 'answered-verbal',
        answer: {
          answeredByPeerId: peer,
          ...(meta.nickname ? { answeredByNickname: meta.nickname } : {}),
          answeredAt: now,
        },
      });
    } else if (update.action === 'reopen') {
      const { answer: _discarded, ...rest } = question;
      state.questions.set(question.id, {
        ...rest,
        status: 'open',
      });
    } else if (update.action === 'highlight') {
      state.highlightedQuestionId = question.id;
    } else if (update.action === 'unhighlight') {
      if (state.highlightedQuestionId === question.id) {
        state.highlightedQuestionId = null;
      }
    }

    state.revision++;
    return { ok: true, snapshot: this.questionsSnapshot(room) };
  }

  #validSelection(participants: Map<string, ParticipantMeta>, presenter: ParticipantMeta): boolean {
    const selection = presenter.selection;
    return Boolean(selection && presenter.sharing?.active && participants.get(selection.targetPeerId)?.sharing?.active);
  }

  /** The valid selection currently held by a connected presenter, if any. */
  getSelection(roomId: unknown, peerId: unknown): StageSelection | undefined {
    const participants = this.#rooms.get(normalizeRoom(roomId));
    const meta = participants?.get(normalizePeer(peerId));
    return participants && meta?.selection && this.#validSelection(participants, meta) ? meta.selection : undefined;
  }

  /**
   * F29: the sender (actively sharing) points followers at a currently shared stream of the room.
   * Identity comes from the authenticated socket, never from the payload.
   */
  selectStage(roomId: string, senderPeerId: string, targetPeerId: string, now = Date.now()): StageSelection | undefined {
    const participants = this.#rooms.get(roomId);
    const meta = participants?.get(senderPeerId);
    if (!participants || !meta?.sharing?.active) return undefined;
    let target: string;
    try { target = normalizePeer(targetPeerId); } catch { return undefined; }
    if (!participants.get(target)?.sharing?.active) return undefined;
    meta.selectionTimes = (meta.selectionTimes ?? []).filter((time) => now - time < 1000);
    if (meta.selectionTimes.length >= STAGE_SELECTION_LIMITS.perSecond) return undefined;
    meta.selectionTimes.push(now);
    meta.selectionSeq = (meta.selectionSeq ?? 0) + 1;
    meta.selection = { targetPeerId: target, seq: meta.selectionSeq };
    return meta.selection;
  }

  /**
   * Drops selections that point at `peerId` (its stream ended or it left) and, when
   * `includeOwn` is set, the one it issued itself. Returns the cleared presenters with a fresh seq.
   * Also invalidates references maintained in ephemeral recovery reservations.
   */
  clearSelections(roomId: string, peerId: string, includeOwn: boolean): Array<{ presenterPeerId: string; seq: number }> {
    const cleared: Array<{ presenterPeerId: string; seq: number }> = [];
    for (const [presenterPeerId, meta] of this.#rooms.get(roomId) ?? []) {
      if (!meta.selection) continue;
      if (meta.selection.targetPeerId !== peerId && !(includeOwn && presenterPeerId === peerId)) continue;
      meta.selectionSeq = (meta.selectionSeq ?? 0) + 1;
      meta.selection = undefined;
      cleared.push({ presenterPeerId, seq: meta.selectionSeq });
    }
    const room = normalizeRoom(roomId);
    const prefix = `${room}:`;
    for (const [key, res] of this.#recoveryReservations.entries()) {
      if (!key.startsWith(prefix)) continue;
      const reservedPeerId = key.slice(prefix.length);
      if (!res.selection) continue;
      if (res.selection.targetPeerId !== peerId && !(includeOwn && reservedPeerId === peerId)) continue;
      res.selectionSeq = (res.selectionSeq ?? 0) + 1;
      res.selection = undefined;
    }
    return cleared;
  }

  updateCamera(roomId: string, peerId: string, active: boolean): { active: boolean } | undefined {
    const meta = this.#rooms.get(roomId)?.get(peerId);
    if (!meta) return;
    meta.camera = { active: active && Boolean(meta.sharing?.active) };
    return meta.camera;
  }

  updateSharing(roomId: string, peerId: string, sharing: SharingState): SharingState | undefined {
    const meta = this.#rooms.get(roomId)?.get(peerId);
    if (!meta) return undefined;
    const sameCapture = Boolean(sharing.active && sharing.streamId && sharing.streamId === meta.sharing?.streamId);
    if (!sameCapture) meta.collaboration = undefined;
    const resolvedPointing =
      sharing.pointingEnabled !== undefined
        ? sharing.pointingEnabled
        : sameCapture
        ? meta.sharing?.pointingEnabled
        : undefined;
    const resolvedDrawing =
      sharing.drawingEnabled !== undefined
        ? sharing.drawingEnabled
        : sameCapture
        ? meta.sharing?.drawingEnabled
        : undefined;
    const nextSharing: SharingState = sharing.active
      ? {
          ...sharing,
          ...(resolvedPointing !== undefined ? { pointingEnabled: resolvedPointing } : {}),
          ...(resolvedDrawing !== undefined ? { drawingEnabled: resolvedDrawing } : {}),
        }
      : { ...sharing, active: false };
    if (nextSharing.drawingEnabled === false && meta.collaboration) {
      meta.collaboration.drawingBySender?.clear();
      meta.collaboration.aggregateDrawingTimes = undefined;
    }
    if (!nextSharing.active) meta.camera = { active: false };
    meta.sharing = nextSharing;
    return nextSharing;
  }

  /** Operational counters only: never retain points, strokes or event payloads. */
  acceptCollaboration(roomId: string, peerId: string, event: PresenterCollaborationMessage, now = Date.now()): boolean {
    const meta = this.#rooms.get(roomId)?.get(peerId);
    if (!meta?.sharing?.active || meta.sharing.streamId !== event.streamId ||
        (meta.sharing.paused && event.type !== 'clear-annotations')) return false;
    const budget = meta.collaboration ||= { streamId: event.streamId, seq: 0, laser: [], drawing: [], clear: [] };
    if (event.seq <= budget.seq) return false;
    const kind = event.type === 'laser' ? 'laser' : event.type === 'drawing' ? 'drawing' : 'clear';
    const max = kind === 'laser' ? COLLABORATION_LIMITS.laserPerSecond : kind === 'drawing' ? COLLABORATION_LIMITS.drawingPerSecond : COLLABORATION_LIMITS.clearPerSecond;
    budget[kind] = budget[kind].filter(time => now - time < 1000);
    if (budget[kind].length >= max) return false;
    budget[kind].push(now);
    budget.seq = event.seq;
    return true;
  }

  /** Independent per-spectator validation and deduplication for quick pointing. */
  acceptPointing(roomId: string, senderPeerId: string, event: PointMessage, now = Date.now()): boolean {
    const participants = this.#rooms.get(roomId);
    if (!participants || !participants.has(senderPeerId)) return false;
    let targetPeer: string;
    try {
      targetPeer = normalizePeer(event.targetPeerId);
    } catch {
      return false;
    }
    if (targetPeer === senderPeerId) return false;
    const targetMeta = participants.get(targetPeer);
    if (
      !targetMeta?.sharing?.active ||
      targetMeta.sharing.paused ||
      targetMeta.sharing.streamId !== event.streamId ||
      targetMeta.sharing.pointingEnabled === false
    ) {
      return false;
    }
    const collab = (targetMeta.collaboration ||= {
      streamId: event.streamId,
      seq: 0,
      laser: [],
      drawing: [],
      clear: [],
    });
    const bySender = (collab.pointingBySender ||= new Map<string, PointingSenderBudget>());
    let senderBudget = bySender.get(senderPeerId);
    if (!senderBudget) {
      if (bySender.size >= this.maxParticipants * 2) {
        for (const [id] of bySender) {
          if (!participants.has(id)) bySender.delete(id);
        }
        if (bySender.size >= this.maxParticipants * 2) return false;
      }
      senderBudget = { seq: 0, times: [], ids: [] };
      bySender.set(senderPeerId, senderBudget);
    }
    if (event.seq <= senderBudget.seq || senderBudget.ids.includes(event.eventId)) return false;
    senderBudget.times = senderBudget.times.filter((time) => now - time < 1000);
    if (senderBudget.times.length >= COLLABORATION_LIMITS.pointPerSecond) return false;
    senderBudget.times.push(now);
    senderBudget.seq = event.seq;
    senderBudget.ids = [...senderBudget.ids.slice(-31), event.eventId];
    return true;
  }

  /** Authoritative validation, sequencing and rate limiting for spectator collaborative drawing. */
  acceptSpectatorDrawing(roomId: string, senderPeerId: string, event: SpectatorDrawingMessage, now = Date.now()): boolean {
    const participants = this.#rooms.get(roomId);
    if (!participants || !participants.has(senderPeerId)) return false;
    let targetPeer: string;
    try {
      targetPeer = normalizePeer(event.targetPeerId);
    } catch {
      return false;
    }
    if (targetPeer === senderPeerId) return false;
    const targetMeta = participants.get(targetPeer);
    if (
      !targetMeta?.sharing?.active ||
      targetMeta.sharing.paused ||
      targetMeta.sharing.streamId !== event.streamId ||
      targetMeta.sharing.drawingEnabled !== true
    ) {
      return false;
    }
    const collab = (targetMeta.collaboration ||= {
      streamId: event.streamId,
      seq: 0,
      laser: [],
      drawing: [],
      clear: [],
    });

    collab.aggregateDrawingTimes = (collab.aggregateDrawingTimes || []).filter((time) => now - time < 1000);
    if (collab.aggregateDrawingTimes.length >= COLLABORATION_LIMITS.aggregateCollaborativeDrawingPerSecond) {
      return false;
    }

    const bySender = (collab.drawingBySender ||= new Map<string, SpectatorDrawingSenderBudget>());
    let senderBudget = bySender.get(senderPeerId);
    if (!senderBudget) {
      const maxTracked = COLLABORATION_LIMITS.trackedDrawersPerCapture ?? (this.maxParticipants * 2);
      if (bySender.size >= maxTracked) {
        for (const [id] of bySender) {
          if (!participants.has(id)) bySender.delete(id);
        }
        if (bySender.size >= maxTracked) {
          const oldestKey = bySender.keys().next().value;
          if (oldestKey !== undefined) bySender.delete(oldestKey);
        }
      }
      senderBudget = { seq: 0, times: [], ids: [] };
      bySender.set(senderPeerId, senderBudget);
    }
    if (event.seq <= senderBudget.seq || senderBudget.ids.includes(event.eventId)) return false;
    senderBudget.times = senderBudget.times.filter((time) => now - time < 1000);
    if (senderBudget.times.length >= COLLABORATION_LIMITS.spectatorDrawingPerSecond) return false;

    senderBudget.times.push(now);
    collab.aggregateDrawingTimes.push(now);
    senderBudget.seq = event.seq;
    senderBudget.ids = [...senderBudget.ids.slice(-31), event.eventId];
    return true;
  }

  /** Presenter-exclusive clear of all spectator collaborative drawings on active capture. */
  acceptClearCollaborativeDrawings(roomId: string, presenterPeerId: string, event: ClearCollaborativeDrawingsMessage, now = Date.now()): boolean {
    const meta = this.#rooms.get(roomId)?.get(presenterPeerId);
    if (!meta?.sharing?.active || meta.sharing.streamId !== event.streamId) return false;
    const budget = (meta.collaboration ||= { streamId: event.streamId, seq: 0, laser: [], drawing: [], clear: [] });
    const clearSeq = budget.clearCollaborativeSeq ?? 0;
    if (event.seq <= clearSeq) return false;
    budget.clearCollaborative = (budget.clearCollaborative || []).filter((time) => now - time < 1000);
    if (budget.clearCollaborative.length >= COLLABORATION_LIMITS.clearPerSecond) return false;
    budget.clearCollaborative.push(now);
    budget.clearCollaborativeSeq = event.seq;
    budget.drawingBySender?.clear();
    budget.aggregateDrawingTimes = undefined;
    return true;
  }

  interactionBudget(roomId: string, peerId: string): InteractionBudget {
    const meta = this.#rooms.get(roomId)?.get(peerId);
    if (!meta) throw new Error('Participante ausente.');
    return meta.interactions ||= { chat: [], reaction: [], ids: [] };
  }

  getNickname(roomId: unknown, peerId: unknown): string | undefined {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    return this.#rooms.get(room)?.get(peer)?.nickname;
  }

  updateNickname(
    roomId: unknown,
    peerId: unknown,
    nickname?: unknown
  ): { changed: boolean; nickname: string | undefined } {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const participants = this.#rooms.get(room);
    if (!participants || !participants.has(peer)) {
      return { changed: false, nickname: undefined };
    }
    const cleanNickname =
      typeof nickname === 'string' && nickname.trim()
        ? nickname.trim().slice(0, 32)
        : undefined;
    const meta = participants.get(peer)!;
    if (meta.nickname === cleanNickname) {
      return { changed: false, nickname: cleanNickname };
    }
    meta.nickname = cleanNickname;
    this.#syncQaNicknames(room, peer, cleanNickname);
    return { changed: true, nickname: cleanNickname };
  }

  #syncQaNicknames(room: string, peer: string, cleanNickname: string | undefined): void {
    const qaState = this.#qaByRoom.get(room);
    if (!qaState || qaState.questions.size === 0) return;
    let qaUpdated = false;
    for (const [qId, q] of qaState.questions.entries()) {
      let nextQ = q;
      if (q.authorPeerId === peer && q.authorNickname !== cleanNickname) {
        const { authorNickname: _old, ...rest } = nextQ;
        nextQ = { ...rest, ...(cleanNickname ? { authorNickname: cleanNickname } : {}) };
        qaUpdated = true;
      }
      if (nextQ.answer && nextQ.answer.answeredByPeerId === peer && nextQ.answer.answeredByNickname !== cleanNickname) {
        const { answeredByNickname: _oldAns, ...ansRest } = nextQ.answer;
        nextQ = {
          ...nextQ,
          answer: { ...ansRest, ...(cleanNickname ? { answeredByNickname: cleanNickname } : {}) },
        };
        qaUpdated = true;
      }
      if (nextQ !== q) {
        qaState.questions.set(qId, nextQ);
      }
    }
    if (qaUpdated) {
      qaState.revision++;
    }
  }

  has(roomId: unknown): boolean {
    return this.#rooms.has(normalizeRoom(roomId));
  }

  hasPeer(roomId: unknown, peerId: unknown): boolean {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    return this.#rooms.get(room)?.has(peer) ?? false;
  }

  /**
   * Returns the count of actively connected participants.
   * This is what is broadcasted to users in presence messages.
   */
  count(roomId: unknown): number {
    const room = normalizeRoom(roomId);
    return this.#rooms.get(room)?.size ?? 0;
  }

  /**
   * Returns the number of valid ephemeral recovery reservations currently held for this room.
   */
  reservationCount(roomId: unknown): number {
    const room = normalizeRoom(roomId);
    const prefix = `${room}:`;
    const now = Date.now();
    let count = 0;
    for (const [key, res] of this.#recoveryReservations.entries()) {
      if (key.startsWith(prefix)) {
        if (now > res.expiresAt) {
          this.#expireRecovery(room, key.slice(prefix.length));
        } else {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Returns total committed slots in the room (active participants + active recovery reservations).
   * Policy A invariant: occupiedSlots(roomId) <= maxParticipants.
   */
  occupiedSlots(roomId: unknown): number {
    const room = normalizeRoom(roomId);
    const active = this.#rooms.get(room)?.size ?? 0;
    return active + this.reservationCount(room);
  }

  /**
   * Returns whether admission is full for new participants.
   * Considers both actively connected participants and ephemeral slot reservations (Policy A).
   */
  isFull(roomId: unknown): boolean {
    const room = normalizeRoom(roomId);
    return this.occupiedSlots(room) >= this.maxParticipants;
  }

  getReconnectToken(roomId: unknown, peerId: unknown): string | undefined {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    return this.#rooms.get(room)?.get(peer)?.reconnectToken;
  }

  hasRecoveryReservation(roomId: unknown, peerId: unknown): boolean {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const res = this.#recoveryReservations.get(`${room}:${peer}`);
    if (!res) return false;
    if (Date.now() > res.expiresAt) {
      this.#expireRecovery(room, peer);
      return false;
    }
    return true;
  }

  getRecoveryReservation(roomId: unknown, peerId: unknown): RecoveryReservation | undefined {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const res = this.#recoveryReservations.get(`${room}:${peer}`);
    if (!res) return undefined;
    if (Date.now() > res.expiresAt) {
      this.#expireRecovery(room, peer);
      return undefined;
    }
    return res;
  }

  getReservedReconnectToken(roomId: unknown, peerId: unknown): string | undefined {
    return this.getRecoveryReservation(roomId, peerId)?.reconnectToken;
  }

  /**
   * Returns authoritative list of reserved peers and their remaining recovery grace in milliseconds.
   * Never exposes reconnect tokens or credentials.
   */
  getReservedPeers(roomId: unknown, now = Date.now()): Array<{ peerId: string; reconnectGraceMs: number }> {
    const room = normalizeRoom(roomId);
    const prefix = `${room}:`;
    const result: Array<{ peerId: string; reconnectGraceMs: number }> = [];
    for (const [key, res] of this.#recoveryReservations.entries()) {
      if (key.startsWith(prefix)) {
        const remaining = res.expiresAt - now;
        if (remaining <= 0) {
          this.#expireRecovery(room, key.slice(prefix.length));
        } else {
          const peerId = key.slice(prefix.length);
          result.push({ peerId, reconnectGraceMs: Math.max(1, Math.round(remaining)) });
        }
      }
    }
    return result;
  }

  clearRecovery(roomId: unknown, peerId: unknown): void {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const key = `${room}:${peer}`;
    const res = this.#recoveryReservations.get(key);
    if (res) {
      clearTimeout(res.timer);
      this.#recoveryReservations.delete(key);
    }
  }

  hasAnyRecoveryForRoom(roomId: unknown): boolean {
    const room = normalizeRoom(roomId);
    const prefix = `${room}:`;
    for (const key of this.#recoveryReservations.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  clearAllRecovery(): void {
    for (const room of this.#administration.keys()) this.#destroyAdministration(room);
    for (const res of this.#recoveryReservations.values()) {
      clearTimeout(res.timer);
    }
    this.#recoveryReservations.clear();
  }

  validateReconnectToken(roomId: unknown, peerId: unknown, token: unknown): boolean {
    if (typeof token !== 'string' || !token.trim()) return false;
    const cleanToken = token.trim();
    const active = this.getReconnectToken(roomId, peerId);
    if (active && active === cleanToken) return true;
    const reserved = this.getReservedReconnectToken(roomId, peerId);
    return Boolean(reserved && reserved === cleanToken);
  }
}
