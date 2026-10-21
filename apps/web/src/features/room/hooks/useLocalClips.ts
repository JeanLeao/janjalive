import { useEffect, useRef, useState } from 'react';
import { type ClipOperation, type ClipsSnapshot, type ServerMessage } from '@screen-room/protocol';
import { LocalClip, clipMimeType, type ClipFile } from '../media/local-clip.ts';
import type { SignalingClient } from '../signaling/signaling-client';
import type { RoomParticipant, RemoteStreamEntry } from '../types';

type ClipSource = { presenterId: string; streamId: string; displayName: string };
type Target = { presenterId: string; streamId: string; stream: MediaStream; version: number };
type Pending = Target & { own: boolean; id: string; audio: boolean; phase: 'request' | 'starting' | 'active'; timer: ReturnType<typeof setTimeout> };
export function useLocalClips(roomId: string) {
  const [snapshot, setSnapshot] = useState<ClipsSnapshot | null>(null);
  const snapshotRef = useRef<ClipsSnapshot | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'recording' | 'finishing'>('idle');
  const [source, setSource] = useState<ClipSource | null>(null);
  const [notice, updateNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setNotice = (message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    updateNotice(message);
    noticeTimer.current = message ? setTimeout(() => {
      noticeTimer.current = null;
      updateNotice('');
    }, 8000) : null;
  };
  const [file, setFile] = useState<ClipFile | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pending = useRef<Pending | null>(null);
  const recorder = useRef<LocalClip | null>(null);
  const client = useRef<SignalingClient | null>(null);
  const seq = useRef(0);
  const permissionRequest = useRef<string | null>(null);
  const namesRef = useRef(new Map<string, string>());
  const ready = useRef(false);
  const mounted = useRef(true);
  const send = (action: ClipOperation['action'], target: Target, id: string, allowed?: boolean) => client.current?.send({
    type: 'clip-operation', seq: ++seq.current, action, presenterId: target.presenterId, streamId: target.streamId,
    version: target.version, recordingId: id, ...(allowed === undefined ? {} : { allowed }),
  });
  const stop = (message = 'Gravação encerrada. A prévia fica apenas neste dispositivo.') => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer); pending.current = null;
    send('stop', p, p.id);
    setNotice(message);
    if (recorder.current) { setStatus('finishing'); recorder.current.stop(); }
    else { setSource(null); setStatus('idle'); }
  };
  const reset = () => {
    stop('Gravação interrompida pela desconexão da sala.');
    ready.current = false; snapshotRef.current = null; setSnapshot(null);
  };
  const receive = (message: ServerMessage, signaling: SignalingClient) => {
    client.current = signaling;
    if (message.type === 'peers') ready.current = true;
    if (message.type === 'clips-snapshot' && ready.current && message.roomId === roomId && message.revision >= (snapshotRef.current?.revision ?? -1)) {
      const previous = snapshotRef.current;
      snapshotRef.current = message; setSnapshot(message);
      const names = (id: string) => namesRef.current.get(id) || id.slice(0, 8);
      for (const permission of message.permissions) if (!permission.allowed && previous?.permissions.some(p => p.presenterId === permission.presenterId && p.streamId === permission.streamId && p.allowed)) setNotice(`${names(permission.presenterId)} revogou a permissão de gravação.`);
      for (const r of message.recordings) if (!previous?.recordings.some(old => old.recordingId === r.recordingId)) setNotice(`${names(r.recorderId)} iniciou gravação da transmissão de ${names(r.presenterId)}.`);
      for (const r of previous?.recordings ?? []) if (!message.recordings.some(next => next.recordingId === r.recordingId)) setNotice(`${names(r.recorderId)} encerrou gravação da transmissão de ${names(r.presenterId)}.`);
      const p = pending.current;
      if (p) {
        const permission = message.permissions.find(item => item.presenterId === p.presenterId && item.streamId === p.streamId);
        if (!permission || (!p.own && permission.version !== p.version) || (p.phase === 'active' && !message.recordings.some(r => r.recordingId === p.id))) stop('Gravação interrompida: autorização ou transmissão alterada.');
      }
    }
    if (message.type === 'clip-result' && message.recordingId === permissionRequest.current) {
      permissionRequest.current = null; setNotice(message.ok ? 'Permissão de gravação atualizada.' : message.message); return;
    }
    if (message.type !== 'clip-result' || message.recordingId !== pending.current?.id) return;
    const p = pending.current;
    if (!message.ok) { stop(message.message); return; }
    if (p.phase !== 'request') return;
    p.phase = 'starting';
    try {
      const local = new LocalClip(p.stream, p.audio, {
        started: () => {
          if (pending.current !== p || !ready.current) { local.stop(); return; }
          p.phase = 'active'; clearTimeout(p.timer);
          if (!send('started', p, p.id)) { stop('Sem conexão para confirmar a gravação.'); return; }
          setNotice(''); setStatus('recording');
        },
        stopping: () => { if (pending.current === p) stop(); },
        finished: (result, error) => {
          if (!mounted.current) return;
          if (pending.current === p) stop();
          recorder.current = null; setFile(result);
          if (!result) setSource(null);
          setStatus('idle');
          if (error) setNotice(error);
        },
      });
      recorder.current = local; local.start();
    } catch { recorder.current?.dispose(); recorder.current = null; stop('Não foi possível iniciar a gravação neste navegador.'); setStatus('idle'); }
  };
  useEffect(() => {
    mounted.current = true;
    setSource(null); setFile(null); setSnapshot(null); setStatus('idle'); setNotice('');
    return () => {
      mounted.current = false;
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      const p = pending.current;
      if (p) { clearTimeout(p.timer); send('stop', p, p.id); }
      pending.current = null; recorder.current?.dispose(); recorder.current = null;
      ready.current = false; snapshotRef.current = null;
    };
  }, [roomId]);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    try { const next = URL.createObjectURL(file.blob); setUrl(next); return () => URL.revokeObjectURL(next); }
    catch { setNotice('Falha ao criar a prévia local.'); setFile(null); setSource(null); }
  }, [file]);
  useEffect(() => { if (status !== 'recording') return; const timer = setInterval(() => setElapsed(recorder.current?.elapsed() ?? 0), 250); return () => clearInterval(timer); }, [status]);
  return {
    snapshot, status, source, notice, file, url, elapsed,
    supported: clipMimeType() !== null, receive, reset, stop,
    syncTracks: () => recorder.current?.syncTracks(),
    validate(participants: RoomParticipant[], local: MediaStream | null, remotes: RemoteStreamEntry[], localState: string, connections: Record<string, RTCPeerConnectionState>) {
      namesRef.current = new Map(participants.map(p => [p.peerId, p.nickname || p.peerId.slice(0, 8)]));
      const p = pending.current; if (!p) return;
      const target = participants.find(item => item.peerId === p.presenterId);
      const stream = target?.isLocal ? local : remotes.find(item => item.peerId === p.presenterId)?.stream;
      if (!target || !target.isSharing || target.isPaused || target.streamId !== p.streamId || stream !== p.stream ||
        (target.isLocal ? localState !== 'sharing' : ['failed', 'closed', 'disconnected'].includes(connections[p.presenterId]))) stop('Gravação interrompida pela mudança ou perda da transmissão.');
    },
    permission(presenterId: string, allowed: boolean) {
      setNotice('');
      const p = snapshotRef.current?.permissions.find(item => item.presenterId === presenterId);
      if (p && ready.current) {
        const id = crypto.randomUUID(); permissionRequest.current = id;
        if (!send('permission', { ...p, stream: null as unknown as MediaStream }, id, allowed)) setNotice('Sem conexão para atualizar a permissão.');
      }
    },
    start(target: RoomParticipant, stream: MediaStream, audio: boolean) {
      if (pending.current || recorder.current || file) return;
      setNotice('');
      const p = snapshotRef.current?.permissions.find(item => item.presenterId === target.peerId && item.streamId === target.streamId);
      if (!p || !ready.current || target.isPaused || (!target.isLocal && !p.allowed)) { setNotice('O apresentador não autorizou a gravação desta transmissão.'); return; }
      const operation: Pending = { presenterId: target.peerId, streamId: p.streamId, version: p.version, stream,
        own: target.isLocal, id: crypto.randomUUID(), audio, phase: 'request', timer: setTimeout(() => { if (pending.current === operation) stop('A autorização não foi confirmada.'); }, 5000) };
      setSource({ presenterId: target.peerId, streamId: p.streamId, displayName: target.nickname || target.peerId.slice(0, 8) });
      pending.current = operation; setElapsed(0); setStatus('pending');
      if (!send('request', operation, operation.id)) stop('Sem conexão com a sala.');
    },
    discard() { setNotice(''); setFile(null); setSource(null); },
    save() {
      if (!file || !url) return;
      try { const a = document.createElement('a'); a.href = url; a.download = `screen-room-${Date.now()}.${file.extension}`; document.body.append(a); a.click(); a.remove(); setNotice('Download solicitado. Confira os arquivos salvos pelo navegador.'); }
      catch { setNotice('Não foi possível exportar o clipe. Tente salvar novamente.'); }
    },
  };
}
