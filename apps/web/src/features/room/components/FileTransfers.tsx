import { useState, useRef, useId, useEffect } from 'react';
import { Box, Button, Checkbox, Group, Progress, Stack, Text } from '@mantine/core';
import type { RoomParticipant } from '../types';
import type { FileDelivery, FileTransferManager } from '../files/file-transfer-manager';

const labels = { waiting: 'Aguardando aceitação', offered: 'Solicitação recebida', queued: 'Aceito · na fila / conectando', transferring: 'Transferindo', verifying: 'Verificando integridade', complete: 'Concluído', rejected: 'Recusado', cancelled: 'Cancelado', error: 'Falha na transferência' };
const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
export function FileSendForm({ manager, participants, connected }: { manager: FileTransferManager; participants: RoomParticipant[]; connected: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const formId = useId();
  return <Stack gap="xs" p="md">
    <Button variant="default" mih={44} aria-expanded={expanded} aria-controls={formId} onClick={() => setExpanded(value => !value)}>Enviar arquivo</Button>
    <Stack id={formId} gap="xs" style={{ display: expanded ? undefined : 'none' }}>
      <Text size="xs" c="dimmed">Até 20 MiB. Cada destinatário precisa aceitar. Arquivos são enviados diretamente, sem armazenamento no servidor.</Text>
      <input ref={input} type="file" aria-label="Escolher arquivo" disabled={!connected || busy} style={{ maxWidth: '100%', minHeight: 44 }} onChange={e => { setFile(e.target.files?.[0] ?? null); setError(''); }} />
      <Text size="sm">Destinatários</Text>
      {participants.filter(p => !p.isLocal).map(p => <Checkbox key={p.peerId} label={p.nickname || `Visitante (${p.peerId.slice(-6)})`} checked={selected.includes(p.peerId)} disabled={!connected || busy}
        styles={{ root: { minHeight: 44 }, body: { minHeight: 44, alignItems: 'center' }, labelWrapper: { flex: 1 }, label: { display: 'flex', alignItems: 'center', minHeight: 44, paddingTop: 0, paddingBottom: 0 } }}
        onChange={e => { const checked = e.currentTarget.checked; setSelected(ids => checked ? [...ids, p.peerId] : ids.filter(id => id !== p.peerId)); }} />)}
      <Button mih={44} disabled={!connected || !file || !selected.some(id => participants.some(p => p.peerId === id && !p.isLocal)) || busy} loading={busy} onClick={async () => {
        if (!file) return; setBusy(true); setError('');
        try { await manager.offer(file, file.name, selected.filter(id => participants.some(p => p.peerId === id && !p.isLocal))); setFile(null); if (input.current) input.current.value = ''; }
        catch (e) { setError(e instanceof Error ? e.message : 'Falha ao preparar arquivo.'); } finally { setBusy(false); }
      }}>Confirmar envio</Button>
      {error && <Text role="alert" c="red" size="sm">{error}</Text>}
    </Stack>
  </Stack>;
}
export function FileTransferList({ manager, deliveries, participants }: { manager: FileTransferManager; deliveries: FileDelivery[]; participants: RoomParticipant[] }) {
  const [error, setError] = useState('');
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => {
    for (const [url, timer] of downloads.current) { clearTimeout(timer); URL.revokeObjectURL(url); }
    downloads.current.clear();
  }, []);
  return <Stack gap="sm" p="md" aria-label="Transferências de arquivos">
    {error && <Text role="alert" c="red">{error}</Text>}
    {deliveries.map(d => <Box key={d.id} p="sm" style={{ border: '1px solid #30363d', borderRadius: 8, overflowWrap: 'anywhere' }} data-transfer-id={d.id}>
      <Text fw={600} size="sm">{d.file.name}</Text>
      <Text size="xs">{d.incoming ? 'De' : 'Para'} {participants.find(p => p.peerId === d.peerId)?.nickname || `Visitante (${d.peerId.slice(-6)})`} · {size(d.file.size)}</Text>
      {d.incoming && <Text size="xs">Tipo declarado: {d.file.mime || 'desconhecido'}. Baixe somente se confiar no remetente.</Text>}
      <Text size="sm" role="status">{labels[d.state]}</Text>
      {['transferring', 'verifying', 'complete'].includes(d.state) && <Progress mt="xs" value={d.file.size ? 100 * d.bytes / d.file.size : 100} aria-label={`Progresso de ${d.file.name}`} />}
      <Group gap="xs" mt="xs">
        {d.state === 'offered' && <><Button mih={44} onClick={() => { try { manager.accept(d.id); setError(''); } catch (e) { setError((e as Error).message); } }}>Aceitar</Button><Button mih={44} variant="default" onClick={() => manager.reject(d.id)}>Recusar</Button></>}
        {!['complete', 'rejected', 'cancelled', 'error'].includes(d.state) && <Button mih={44} variant="subtle" color="red" onClick={() => manager.cancel(d.id)}>Cancelar entrega</Button>}
        {d.state === 'complete' && d.download && <Button mih={44} onClick={() => {
          const url = URL.createObjectURL(d.download!); const link = document.createElement('a'); link.href = url; link.download = d.file.name;
          document.body.append(link); link.click(); link.remove();
          downloads.current.set(url, setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 1000));
        }}>Baixar arquivo</Button>}
        {['complete', 'rejected', 'cancelled', 'error'].includes(d.state) && <Button mih={44} variant="subtle" onClick={() => manager.dismiss(d.id)}>Dispensar</Button>}
      </Group>
    </Box>)}
  </Stack>;
}
