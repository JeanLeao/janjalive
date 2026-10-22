import { FILE_LIMITS } from '@screen-room/protocol';
import { useState, useRef, useEffect } from 'react';
import type { FileAttachmentState } from '../hooks/useFileAttachment';
import type { RoomParticipant } from '../types';
import type { FileDelivery, FileTransferManager } from '../files/file-transfer-manager';
import { IconClose } from './Icons';
import classes from './FileTransfers.module.css';

const labels = { waiting: 'Aguardando aceitação', offered: 'Solicitação recebida', queued: 'Aceito · conectando', transferring: 'Transferindo', verifying: 'Verificando integridade', complete: 'Concluído', rejected: 'Recusado', cancelled: 'Cancelado', error: 'Falha na transferência' };
const size = (bytes: number) => bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KiB` : `${(bytes / 1048576).toFixed(2)} MiB`;
const name = (participants: RoomParticipant[], id: string) => participants.find(p => p.peerId === id)?.nickname || `Visitante (${id.slice(-6)})`;
function AttachmentIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2"/><path d="m6 15 9-9"/></svg>; }
export function FileAttachment({ participants, connected, state }: { participants: RoomParticipant[]; connected: boolean; state: FileAttachmentState }) {
  const { selected, setSelected, file, busy, error, setError, choosing, setChoosing } = state;
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const peers = participants.filter(p => !p.isLocal);
  const targets = selected.filter(id => peers.some(p => p.peerId === id));
  const focusTrigger = () => requestAnimationFrame(() => trigger.current?.focus());
  const clear = () => { state.clear(); if (input.current) input.current.value = ''; focusTrigger(); };
  useEffect(() => {
    if (!file) { if (input.current) input.current.value = ''; return; }
    const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[aria-label="Preparar arquivo"] button')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [file]);
  return <div ref={root} className={classes.attachment}>
    <input ref={input} type="file" aria-label="Escolher arquivo" className={classes.hidden} disabled={!connected || busy} onChange={e => {
      const next = e.target.files?.[0]; if (!next) return;
      // A failed replacement invalidates the conventional draft, as before.
      if (!state.prepare({ blob: next, name: next.name })) {
        const message = next.size > FILE_LIMITS.maxBytes ? 'O arquivo excede 20 MiB. Escolha um menor.' : 'Nome, tipo ou tamanho de arquivo inválido. Escolha outro arquivo.';
        clear(); setError(message);
      }
    }} />
    {!file ? <div className={classes.attachRow}><button ref={trigger} type="button" className={classes.attach} disabled={!connected || busy} onClick={() => input.current?.click()}><AttachmentIcon /> Anexar arquivo</button><span>Privado · até 20 MiB</span></div> : <div className={classes.draft} aria-label="Preparar arquivo">
      <div className={classes.header}><AttachmentIcon /><div className={classes.identity}><strong>{file.name}</strong><span>{size(file.blob.size)} · envio privado</span></div><button type="button" className={classes.icon} disabled={busy} aria-label="Remover arquivo" onClick={clear}><IconClose size={16} /></button></div>
      <div className={classes.tools}><button type="button" disabled={busy} onClick={() => input.current?.click()}>Substituir</button><button type="button" disabled={busy} aria-expanded={choosing} onClick={() => setChoosing(v => !v)}>{targets.length ? `${targets.length} destinatário${targets.length > 1 ? 's' : ''}` : 'Selecionar destinatários'}</button></div>
      {choosing && <fieldset className={classes.recipients}><legend>Enviar para · selecione até 8</legend>{peers.length === 0 ? <p>Ninguém conectado para receber. Convide alguém para a sala.</p> : peers.map(p => <label key={p.peerId}><input type="checkbox" checked={targets.includes(p.peerId)} disabled={busy || (!targets.includes(p.peerId) && targets.length >= 8)} onChange={e => { const checked = e.target.checked; setSelected(ids => checked ? [...ids, p.peerId] : ids.filter(id => id !== p.peerId)); }} /><span>{name(participants, p.peerId)}</span></label>)}</fieldset>}
      <p className={classes.hint}>Cada pessoa decide se aceita. Só ela e você veem a entrega.</p>
      <button type="button" className={classes.primary} disabled={!connected || !targets.length || busy} aria-busy={busy} onClick={async () => {
        if (await state.offer(targets)) { if (input.current) input.current.value = ''; focusTrigger(); }
      }}>{busy ? 'Preparando arquivo…' : `Solicitar envio${targets.length ? ` para ${targets.length}` : ''}`}</button>
    </div>}
    {error && <p role="alert" className={classes.error}>{error}</p>}
  </div>;
}
export function groupDeliveries(deliveries: FileDelivery[]) {
  const groups: FileDelivery[][] = [];
  for (const d of deliveries) {
    // The manager shares the metadata object only within a single outgoing offer.
    const group = !d.incoming && groups.find(g => !g[0].incoming && g[0].file === d.file);
    if (group) group.push(d); else groups.push([d]);
  }
  return groups;
}
export function FileTransferCard({ manager, deliveries, participants }: { manager: FileTransferManager; deliveries: FileDelivery[]; participants: RoomParticipant[] }) {
  const [error, setError] = useState('');
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => { for (const [url, timer] of downloads.current) { clearTimeout(timer); URL.revokeObjectURL(url); } downloads.current.clear(); }, []);
  const first = deliveries[0];
  return <article className={classes.card} data-file-card data-pending-file={first.incoming && first.state === 'offered' || undefined} tabIndex={-1} aria-label={`Arquivo privado: ${first.file.name}`}>
    <div className={classes.header}><AttachmentIcon /><div className={classes.identity}><strong>{first.file.name}</strong><span>{size(first.file.size)} · Privado</span></div></div>
    <p className={classes.context}>{first.incoming ? `De ${name(participants, first.peerId)} para você` : `Você → ${deliveries.length === 1 ? name(participants, first.peerId) : `${deliveries.length} destinatários`}`}</p>
    {deliveries.map(d => <div key={d.id} data-transfer-id={d.id} className={classes.delivery}>
      {!d.incoming && deliveries.length > 1 && <strong className={classes.person}>{name(participants, d.peerId)}</strong>}
      <div role="status" className={classes.state} data-state={d.state}>{labels[d.state]}{d.state === 'transferring' && ` · ${Math.floor(d.bytes / (d.file.size || 1) * 100)}%`}</div>
      {['transferring', 'verifying'].includes(d.state) && <progress className={classes.progress} max={d.file.size || 1} value={d.bytes} aria-label={`Progresso de ${d.file.name}`} />}
      {d.state === 'offered' && <p className={classes.hint}>Baixe somente se confiar no remetente. Até dois recebimentos podem ficar retidos.</p>}
      {d.state === 'complete' && d.incoming && <p className={classes.hint}>Integridade verificada. Pronto para baixar.</p>}
      {d.state === 'cancelled' && <p className={classes.hint}>Para tentar novamente, solicite um novo envio.</p>}
      <div className={classes.tools}>
        {d.state === 'offered' && <><button type="button" className={classes.primary} onClick={() => { try { manager.accept(d.id); setError(''); } catch (e) { setError((e as Error).message); } }}>Aceitar</button><button type="button" onClick={() => manager.reject(d.id)}>Recusar</button></>}
        {!['offered', 'complete', 'rejected', 'cancelled', 'error'].includes(d.state) && <button type="button" onClick={() => manager.cancel(d.id)}>Cancelar entrega</button>}
        {d.state === 'complete' && d.download && <button type="button" className={classes.primary} onClick={() => {
          const url = URL.createObjectURL(d.download!); const link = document.createElement('a'); link.href = url; link.download = d.file.name; document.body.append(link); link.click(); link.remove();
          downloads.current.set(url, setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 1000));
        }}>Baixar arquivo</button>}
        {['complete', 'rejected', 'cancelled', 'error'].includes(d.state) && <button type="button" onClick={() => manager.dismiss(d.id)}>Dispensar</button>}
      </div>
    </div>)}
    {error && <p role="alert" className={classes.error}>{error}</p>}
  </article>;
}
