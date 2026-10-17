import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatTextSchema, INTERACTION_LIMITS, type HandsSnapshot, type ChatMessage, type Reaction, type ReactionEvent, type ServerMessage } from '@screen-room/protocol';
import type { SignalingClient } from '../signaling/signaling-client';

export function acceptHandsSnapshot(previous: HandsSnapshot | null, message: HandsSnapshot, roomId: string): HandsSnapshot | null {
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
  const ready = useRef(false);
  const [hands, setHands] = useState<HandsSnapshot | null>(null);
  const handsRef = useRef<HandsSnapshot | null>(null);
  const pendingRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const finish = useCallback(() => {
    if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    pendingRef.current = null;
    setPending(false);
  }, []);
  const resetConnection = useCallback(() => {
    ready.current = false;
    handsRef.current = null;
    setHands(null);
    if (pendingRef.current) setError('Conexão interrompida. O envio não foi confirmado; não será reenviado.');
    finish();
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    setReactions([]);
  }, [finish]);
  useEffect(() => {
    setDataRoom(roomId);
    setMessages([]);
    setError(null);
    resetConnection();
    return resetConnection;
  }, [roomId, resetConnection]);
  const receive = useCallback((message: ServerMessage) => {
    if (message.type === 'peers') ready.current = true;
    if (message.type === 'hands-snapshot' && ready.current) {
      handsRef.current = acceptHandsSnapshot(handsRef.current, message, roomId);
      setHands(handsRef.current);
    }
    if (message.type === 'interaction-rejected') {
      setError(message.message);
      if (pendingRef.current?.id === message.requestId) finish();
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
  }, [roomId, finish]);
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
  return { hands: dataRoom === roomId ? hands?.hands ?? [] : [], toggleHand,
    messages: dataRoom === roomId ? messages : [], reactions: dataRoom === roomId ? reactions : [],
    error: dataRoom === roomId ? error : null, pending: dataRoom === roomId && pending,
    receive, resetConnection, sendChat, sendReaction };
}
