import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CreatePollSchema, VotePollSchema, ClosePollSchema, type PollOperation, type PollsSnapshot,
  ChatTextSchema, INTERACTION_LIMITS, QaQuestionTextSchema, QaAnswerTextSchema, QA_LIMITS,
  type HandsSnapshot, type QuestionsSnapshot, type ChatMessage, type Reaction, type ReactionEvent, type ServerMessage,
} from '@screen-room/protocol';
import type { SignalingClient } from '../signaling/signaling-client';

export function acceptHandsSnapshot(previous: HandsSnapshot | null, message: HandsSnapshot, roomId: string): HandsSnapshot | null {
  return message.roomId === roomId && message.revision > (previous?.revision ?? 0) ? message : previous;
}

export function acceptQuestionsSnapshot(previous: QuestionsSnapshot | null, message: QuestionsSnapshot, roomId: string): QuestionsSnapshot | null {
  return message.roomId === roomId && message.revision > (previous?.revision ?? 0) ? message : previous;
}

export function acceptPollsSnapshot(previous: PollsSnapshot | null, message: PollsSnapshot, roomId: string): PollsSnapshot | null {
  return message.roomId === roomId && message.revision > (previous?.revision ?? 0) ? message : previous;
}

export function appendChatMessage(previous: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return previous.some(item => item.id === message.id) ? previous : [...previous, message].slice(-INTERACTION_LIMITS.history);
}

export function useRoomInteractions(roomId: string) {
  const [dataRoom, setDataRoom] = useState(roomId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaPending, setQaPending] = useState(false);
  const [qaSubmitPending, setQaSubmitPending] = useState(false);
  const [polls, setPolls] = useState<PollsSnapshot | null>(null);
  const pollsRef = useRef<PollsSnapshot | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollPending, setPollPending] = useState(false);
  const pollPendingRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const finishPoll = useCallback(() => {
    if (pollPendingRef.current) clearTimeout(pollPendingRef.current.timer);
    pollPendingRef.current = null;
    setPollPending(false);
  }, []);
  const ready = useRef(false);
  const [hands, setHands] = useState<HandsSnapshot | null>(null);
  const handsRef = useRef<HandsSnapshot | null>(null);
  const [questions, setQuestions] = useState<QuestionsSnapshot | null>(null);
  const questionsRef = useRef<QuestionsSnapshot | null>(null);
  const pendingRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const qaPendingRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout>; kind: 'submit' | 'action' } | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const finish = useCallback(() => {
    if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    pendingRef.current = null;
    setPending(false);
  }, []);
  const finishQa = useCallback(() => {
    if (qaPendingRef.current) clearTimeout(qaPendingRef.current.timer);
    qaPendingRef.current = null;
    setQaPending(false);
    setQaSubmitPending(false);
  }, []);
  const resetConnection = useCallback(() => {
    ready.current = false;
    pollsRef.current = null;
    setPolls(null);
    if (pollPendingRef.current) setPollError('Conexão interrompida. A ação não foi confirmada; não será reenviada.');
    finishPoll();
    handsRef.current = null;
    setHands(null);
    questionsRef.current = null;
    setQuestions(null);
    if (pendingRef.current) setError('Conexão interrompida. O envio não foi confirmado; não será reenviado.');
    if (qaPendingRef.current) setQaError('Conexão interrompida. A ação não foi confirmada; não será reenviada.');
    finish();
    finishQa();
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    setReactions([]);
  }, [finish, finishQa, finishPoll]);
  useEffect(() => {
    setDataRoom(roomId);
    setMessages([]);
    setError(null);
    setQaError(null);
    setPollError(null);
    resetConnection();
    return resetConnection;
  }, [roomId, resetConnection]);
  const receive = useCallback((message: ServerMessage) => {
    if (message.type === 'peers') ready.current = true;
    if (message.type === 'polls-snapshot' && ready.current) {
      pollsRef.current = acceptPollsSnapshot(pollsRef.current, message, roomId);
      setPolls(pollsRef.current);
    }
    if (message.type === 'poll-accepted' && ready.current && message.roomId === roomId && pollPendingRef.current?.id === message.requestId) finishPoll();
    if (message.type === 'hands-snapshot' && ready.current) {
      handsRef.current = acceptHandsSnapshot(handsRef.current, message, roomId);
      setHands(handsRef.current);
    }
    if (message.type === 'questions-snapshot' && ready.current) {
      questionsRef.current = acceptQuestionsSnapshot(questionsRef.current, message, roomId);
      setQuestions(questionsRef.current);
    }
    if (message.type === 'question-accepted' && message.roomId === roomId) {
      if (qaPendingRef.current?.id === message.requestId) finishQa();
    }
    if (message.type === 'interaction-rejected') {
      if (pollPendingRef.current?.id === message.requestId) {
        setPollError(message.message);
        finishPoll();
      } else if (qaPendingRef.current?.id === message.requestId) {
        setQaError(message.message);
        finishQa();
      } else {
        setError(message.message);
        if (pendingRef.current?.id === message.requestId) finish();
      }
    }
    if (message.type === 'chat-message' && message.roomId === roomId) {
      setMessages(previous => appendChatMessage(previous, message));
      if (pendingRef.current?.id === message.requestId) finish();
    }
    if (message.type === 'reaction' && message.roomId === roomId) {
      setReactions(previous => [...previous, message].slice(-INTERACTION_LIMITS.visibleReactions));
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setReactions(previous => previous.filter(item => item.id !== message.id));
      }, INTERACTION_LIMITS.reactionDurationMs);
      timers.current.add(timer);
    }
  }, [roomId, finish, finishQa, finishPoll]);
  const sendChat = (client: SignalingClient | null, text: string) => {
    if (pendingRef.current) return false;
    const parsed = ChatTextSchema.safeParse(text);
    if (!parsed.success) { setError('Use de 1 a 1000 caracteres, sem caracteres de controle.'); return false; }
    const requestId = crypto.randomUUID();
    if (!ready.current || !client?.send({ type: 'send-chat', requestId, text: parsed.data })) {
      setError('Sem conexão com a sala. Tente enviar novamente quando reconectar.');
      return false;
    }
    setError(null);
    setPending(true);
    pendingRef.current = { id: requestId, timer: setTimeout(() => {
      finish();
      setError('O envio não foi confirmado. Não haverá reenvio automático.');
    }, 8000) };
    return true;
  };
  const sendReaction = (client: SignalingClient | null, reaction: Reaction) => {
    if (!ready.current || !client?.send({ type: 'send-reaction', requestId: crypto.randomUUID(), reaction })) {
      setError('Reconecte à sala para reagir.');
      return;
    }
    setError(null);
  };
  const toggleHand = (client: SignalingClient | null, peerId: string) => {
    const own = handsRef.current?.hands.find(hand => hand.peerId === peerId);
    if (!ready.current || !own || !client?.send({ type: 'set-hand', raised: own.order === null, version: own.version })) {
      setError('Reconecte à sala para levantar ou abaixar a mão.');
      return;
    }
    setError(null);
  };
  const startQaRequest = (requestId: string, kind: 'submit' | 'action') => {
    setQaError(null);
    setQaPending(true);
    setQaSubmitPending(kind === 'submit');
    qaPendingRef.current = {
      id: requestId,
      kind,
      timer: setTimeout(() => {
        finishQa();
        setQaError('A ação não foi confirmada. Não haverá reenvio automático.');
      }, 8000),
    };
  };
  const submitQuestion = (client: SignalingClient | null, text: string) => {
    if (qaPendingRef.current) return false;
    const parsed = QaQuestionTextSchema.safeParse(text);
    if (!parsed.success) {
      setQaError(`Use de 1 a ${QA_LIMITS.questionLength} caracteres, sem caracteres de controle.`);
      return false;
    }
    const requestId = crypto.randomUUID();
    if (!ready.current || !client?.send({ type: 'submit-question', requestId, text: parsed.data })) {
      setQaError('Sem conexão com a sala. Tente enviar novamente quando reconectar.');
      return false;
    }
    startQaRequest(requestId, 'submit');
    return true;
  };
  const withdrawQuestion = (client: SignalingClient | null, questionId: string) => {
    if (qaPendingRef.current) return false;
    const requestId = crypto.randomUUID();
    if (!ready.current || !client?.send({ type: 'withdraw-question', requestId, questionId })) {
      setQaError('Sem conexão com a sala. Reconecte para retirar a pergunta.');
      return false;
    }
    startQaRequest(requestId, 'action');
    return true;
  };
  const answerQuestionText = (client: SignalingClient | null, questionId: string, answerText: string) => {
    if (qaPendingRef.current) return false;
    const parsed = QaAnswerTextSchema.safeParse(answerText);
    if (!parsed.success) {
      setQaError(`Use de 1 a ${QA_LIMITS.answerLength} caracteres na resposta, sem caracteres de controle.`);
      return false;
    }
    const requestId = crypto.randomUUID();
    if (!ready.current || !client?.send({ type: 'update-question', requestId, questionId, action: 'answer-text', answerText: parsed.data })) {
      setQaError('Sem conexão com a sala. Reconecte para responder.');
      return false;
    }
    startQaRequest(requestId, 'action');
    return true;
  };
  const updateQuestionStatus = (
    client: SignalingClient | null,
    questionId: string,
    action: 'answer-verbal' | 'reopen' | 'highlight' | 'unhighlight'
  ) => {
    if (qaPendingRef.current) return false;
    const requestId = crypto.randomUUID();
    if (!ready.current || !client?.send({ type: 'update-question', requestId, questionId, action })) {
      setQaError('Sem conexão com a sala. Reconecte para atualizar a pergunta.');
      return false;
    }
    startQaRequest(requestId, 'action');
    return true;
  };
  const sendPoll = (client: SignalingClient | null, operation: PollOperation) => {
    if (pollPendingRef.current) return false;
    const schema = operation.type === 'create-poll' ? CreatePollSchema : operation.type === 'vote-poll' ? VotePollSchema : ClosePollSchema;
    const parsed = schema.safeParse(operation);
    if (!parsed.success) { setPollError('Revise a pergunta (até 300 caracteres) e as 2 a 5 alternativas (até 120 caracteres cada).'); return false; }
    if (!ready.current || !client?.send(parsed.data)) {
      setPollError('Sem conexão com a sala. Aguarde a reconexão para tentar novamente.');
      return false;
    }
    setPollError(null);
    setPollPending(true);
    pollPendingRef.current = { id: operation.requestId, timer: setTimeout(() => {
      finishPoll();
      setPollError('A ação não foi confirmada. Não haverá reenvio automático.');
    }, 8000) };
    return true;
  };
  return {
    polls: dataRoom === roomId ? polls?.polls ?? [] : [],
    pollsReady: dataRoom === roomId && polls !== null,
    pollError: dataRoom === roomId ? pollError : null,
    pollPending: dataRoom === roomId && pollPending,
    sendPoll,
    hands: dataRoom === roomId ? hands?.hands ?? [] : [],
    toggleHand,
    questions: dataRoom === roomId ? questions?.questions ?? [] : [],
    highlightedQuestionId: dataRoom === roomId ? questions?.highlightedQuestionId ?? null : null,
    qaError: dataRoom === roomId ? qaError : null,
    qaPending: dataRoom === roomId && qaPending,
    qaSubmitPending: dataRoom === roomId && qaSubmitPending,
    submitQuestion,
    withdrawQuestion,
    answerQuestionText,
    updateQuestionStatus,
    messages: dataRoom === roomId ? messages : [],
    reactions: dataRoom === roomId ? reactions : [],
    error: dataRoom === roomId ? error : null,
    pending: dataRoom === roomId && pending,
    receive,
    resetConnection,
    sendChat,
    sendReaction,
  };
}
