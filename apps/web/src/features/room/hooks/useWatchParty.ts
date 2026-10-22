import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage, WatchOperation, WatchSnapshot, WatchAvailability } from '@screen-room/protocol';
import type { FileDelivery, FileTransferManager } from '../files/file-transfer-manager.ts';
import type { RoomParticipant } from '../types';
import { prepareVideo } from '../watch/prepare-video.ts';
import { ServerClock } from '../watch/timeline.ts';

export function useWatchParty(roomId: string, files: FileTransferManager, deliveries: FileDelivery[], send: (message: ClientMessage) => boolean, participants: RoomParticipant[]) {
  const [snapshot, setSnapshot] = useState<WatchSnapshot | null>(null);
  const [source, setSource] = useState<{ sessionId: string; blob: Blob } | null>(null);
  const [availability, setAvailability] = useState<Record<string, WatchAvailability>>({});
  const lastStatus = useRef<{ sessionId: string; status: WatchAvailability } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const attempts = useRef(new Set<string>());
  const invitationInFlight = useRef(false);
  const queuedInvitation = useRef(false);
  const [connectionChange, setConnectionChange] = useState(0);
  const clock = useMemo(() => new ServerClock(), [roomId]);
  const current = useRef(snapshot); current.current = snapshot;
  const sender = useRef(send); sender.current = send;
  const preparation = useRef<AbortController | null>(null);
  const request = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const own = participants.find(p => p.isLocal)?.peerId;
  const state = snapshot?.state ?? null;
  const cancelRequest = () => { if (request.current) clearTimeout(request.current.timer); request.current = null; setPending(false); };
  const reset = () => {
    preparation.current?.abort(); preparation.current = null;
    cancelRequest(); setBusy(false); setSource(null); current.current = null; setSnapshot(null); setAvailability({}); lastStatus.current = null; setError('');
  };
  const receive = (message: ServerMessage) => {
    if (message.type === 'peers') {
      clock.seed(message.serverTime ?? Date.now());
      if (message.watch) { current.current = message.watch; setSnapshot(message.watch); setAvailability(Object.fromEntries((message.watch.availability ?? []).map(p => [p.peerId, p.status]))); }
      sender.current({ type: 'watch-clock', sentAt: performance.now() });
    }
    if (message.type === 'watch-clock-reply' && current.current) clock.sample(message.sentAt, performance.now(), message.serverTime);
    if (message.type === 'watch-snapshot' && current.current && message.roomId === roomId && message.revision > (current.current?.revision ?? -1)) {
      current.current = message; setSnapshot(message); setAvailability(Object.fromEntries((message.availability ?? []).map(p => [p.peerId, p.status])));
    }
    // Signaling emits peer-joined for socket replacement too, without peer-left.
    // Coalesce repeated announcements until the next invitation batch.
    if (message.type === 'peer-joined' && attempts.current.delete(message.peerId)) {
      setConnectionChange(value => value + 1);
    }
    if (message.type === 'peer-left') {
      attempts.current.delete(message.peerId);
      setAvailability(previous => { const next = { ...previous }; delete next[message.peerId]; return next; });
    }
    if (message.type === 'watch-readiness-updated' && current.current?.state?.sessionId === message.sessionId && message.roomId === roomId) {
      setAvailability(previous => ({ ...previous, [message.peerId]: message.status }));
    }
    if (message.type === 'watch-result' && message.requestId === request.current?.id) {
      cancelRequest(); if (!message.ok) { setError(message.message); setSource(previous => previous?.sessionId === current.current?.state?.sessionId ? previous : null); }
    }
  };
  const reportStatus = (status: WatchAvailability) => {
    const sessionId = current.current?.state?.sessionId;
    if (!sessionId || lastStatus.current?.sessionId === sessionId && lastStatus.current.status === status) return;
    if (sender.current({ type: 'watch-readiness', sessionId, status })) lastStatus.current = { sessionId, status };
  };
  const operation = (op: Omit<WatchOperation, 'type' | 'requestId' | 'revision'>) => {
    if (request.current) return false;
    const id = crypto.randomUUID();
    request.current = { id, timer: setTimeout(() => { cancelRequest(); setSource(previous => previous?.sessionId === current.current?.state?.sessionId ? previous : null); setError('Sem confirmação. Confira a conexão e tente novamente.'); }, 10_000) };
    setPending(true); setError('');
    if (!sender.current({ type: 'watch-operation', requestId: id, revision: current.current?.revision ?? 0, ...op })) {
      cancelRequest(); setError('Aguarde a conexão com a sala.'); return false;
    }
    return true;
  };
  const create = async (file: File, options: { signal?: AbortSignal; recoverClipDuration?: boolean; isValid?: () => boolean } = {}) => {
    if (preparation.current || request.current || current.current?.state || options.signal?.aborted) return;
    const abort = new AbortController(); preparation.current = abort; setBusy(true); setError('');
    const cancel = () => abort.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const prepared = await prepareVideo(file, abort.signal, options.recoverClipDuration);
      if (abort.signal.aborted || preparation.current !== abort || current.current?.state || request.current || options.isValid?.() === false) return;
      const sessionId = crypto.randomUUID();
      setSource({ sessionId, blob: prepared.source });
      if (!operation({ action: 'create', sessionId, file: prepared.metadata, duration: prepared.duration })) setSource(null);
    } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); }
    finally { options.signal?.removeEventListener('abort', cancel); if (preparation.current === abort) { preparation.current = null; setBusy(false); } }
  };
  useEffect(() => {
    const timer = setInterval(() => { if (current.current) sender.current({ type: 'watch-clock', sentAt: performance.now() }); }, 15_000);
    return () => { clearInterval(timer); preparation.current?.abort(); if (request.current) clearTimeout(request.current.timer); };
  }, [roomId]);
  useEffect(() => {
    const id = state?.sessionId;
    if (!id) return;
    return () => { files.releaseWatch(id); setSource(previous => previous?.sessionId === id ? null : previous); };
  }, [state?.sessionId, files]);
  const incoming = [...deliveries].reverse().find(d => d.incoming && d.watchSessionId === state?.sessionId && d.peerId === state?.controllerId && d.file.sha256 === state?.file.sha256);
  const blob = source && source.sessionId === state?.sessionId ? source.blob : incoming ? files.verifiedBlob(incoming.id) : undefined;
  // F15 prunes old outgoing records when another file is offered. Retain only
  // status metadata for connected members of this session, never a second Blob.
  const history = useRef<{ sessionId?: string; byPeer: Map<string, FileDelivery> }>({ byPeer: new Map() });
  if (history.current.sessionId !== state?.sessionId) history.current = { sessionId: state?.sessionId, byPeer: new Map() };
  for (const delivery of deliveries) if (!delivery.incoming && delivery.watchSessionId === state?.sessionId) {
    const { download, ...metadata } = delivery;
    history.current.byPeer.set(delivery.peerId, metadata);
  }
  for (const id of history.current.byPeer.keys()) if (!participants.some(p => p.peerId === id)) history.current.byPeer.delete(id);
  const [inviting, setInviting] = useState(false);
  useEffect(() => { attempts.current.clear(); }, [state?.sessionId]);
  const invite = async (retry = false) => {
    if (!state || !source || state.controllerId !== own || invitationInFlight.current) return;
    const targets = participants.filter(p => !p.isLocal && !attempts.current.has(p.peerId));
    if (!targets.length && !retry) return;
    const recipients = (retry ? participants.filter(p => !p.isLocal && (!history.current.byPeer.has(p.peerId) || ['error', 'cancelled', 'rejected'].includes(history.current.byPeer.get(p.peerId)!.state))) : targets).slice(0, 8);
    if (!recipients.length) return;
    invitationInFlight.current = true;
    recipients.forEach(p => attempts.current.add(p.peerId));
    setInviting(true);
    try {
      await files.offer(source.blob, state.file.name, recipients.map(p => p.peerId), state.sessionId);
      setError('');
    } catch (e) { setError((e as Error).message); }
    finally { invitationInFlight.current = false; setInviting(false); }
  };
  // One batch on arrival; failures require an explicit retry, avoiding request/rate loops.
  const arrival = participants.map(p => p.peerId).join(',');
  useEffect(() => {
    const connected = new Set(participants.map(p => p.peerId));
    for (const id of attempts.current) if (!connected.has(id)) attempts.current.delete(id);
    if (invitationInFlight.current) queuedInvitation.current = true;
    else void invite();
  }, [state?.sessionId, arrival, connectionChange]);
  useEffect(() => {
    if (!inviting && queuedInvitation.current) {
      queuedInvitation.current = false;
      void invite();
    }
  }, [inviting]);
  return { state, snapshot, clock, blob, incoming, availability, reportStatus, deliveries: [...history.current.byPeer.values()],
    createdSessionId: source?.sessionId === state?.sessionId ? state?.sessionId : undefined,
    controller: !!own && state?.controllerId === own, error, busy, pending, inviting,
    create, receive, reset, invite, command: (action: 'play' | 'pause' | 'seek' | 'end', position?: number) => state && operation({ sessionId: state.sessionId, action, ...(position !== undefined ? { position } : {}) }),
    accept: () => { try { if (incoming) files.accept(incoming.id); } catch (e) { setError((e as Error).message); } },
    reject: () => { if (incoming) files.reject(incoming.id); },
    playbackError: () => {
      reportStatus('error');
      setError('Codec ou arquivo incompatível neste navegador. Peça outro vídeo ou um novo convite ao controlador.');
      if (state && state.controllerId !== own) files.releaseWatch(state.sessionId);
    },
  };
}
export type WatchParty = ReturnType<typeof useWatchParty>;
