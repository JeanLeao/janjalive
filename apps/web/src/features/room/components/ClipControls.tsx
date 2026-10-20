import { useState } from 'react';
import { Button, Checkbox, Popover, Stack, Text } from '@mantine/core';
import type { useLocalClips } from '../hooks/useLocalClips';
import type { RoomParticipant, RemoteStreamEntry } from '../types';

type Props = {
  clips: ReturnType<typeof useLocalClips>; participants: RoomParticipant[];
  localStream: MediaStream | null; remoteStreams: RemoteStreamEntry[]; featuredStreamId: string | null;
};
export function ClipControls({ clips, participants, localStream, remoteStreams, featuredStreamId }: Props) {
  const [audio, setAudio] = useState(false);
  const [opened, setOpened] = useState(false);
  const own = participants.find(p => p.isLocal);
  const target = participants.find(p => featuredStreamId === 'local' ? p.isLocal : p.peerId === featuredStreamId)
    ?? participants.find(p => p.isSharing);
  const stream = target?.isLocal ? localStream : remoteStreams.find(r => r.peerId === target?.peerId)?.stream;
  const permission = clips.snapshot?.permissions.find(p => p.presenterId === target?.peerId && p.streamId === target.streamId);
  const ownPermission = clips.snapshot?.permissions.find(p => p.presenterId === own?.peerId && p.streamId === own.streamId);
  const busy = clips.status !== 'idle';
  const name = (id: string) => participants.find(p => p.peerId === id)?.nickname || id.slice(0, 8);
  return <div style={{ maxWidth: 'min(280px, calc(100vw - 40px))' }}><Popover opened={opened} onChange={setOpened} width={320} position="bottom-end" withinPortal={false} trapFocus returnFocus>
    <Popover.Target><Button size="compact-sm" style={{ minHeight: 44 }} color={busy ? 'red' : 'gray'} onClick={() => setOpened(v => !v)} aria-expanded={opened}>
      {busy ? (clips.status === 'recording' ? `● Gravando / ${clips.elapsed}s` : clips.status === 'pending' ? 'Aguardando autorização' : 'Finalizando clipe') : `Clipes${clips.file ? ' · prévia' : ''}${clips.snapshot?.recordings.length ? ` (${clips.snapshot.recordings.length})` : ''}`}
    </Button></Popover.Target>
    <Popover.Dropdown style={{ background: '#161b22', color: '#e6edf3', border: '1px solid rgba(255,255,255,.12)', maxWidth: 'calc(100vw - 24px)', maxHeight: '70dvh', overflowY: 'auto' }}>
      <Stack gap="xs">
        <Text fw={600}>Clipe local · até 60 segundos</Text>
        <Text size="xs">Somente a transmissão original selecionada. O consentimento vale para o gravador do Screen Room; ferramentas externas não são controladas.</Text>
        {own?.isSharing && <Checkbox styles={{ body: { minHeight: 44, alignItems: 'center' }, label: { minHeight: 44, display: 'flex', alignItems: 'center' } }} label="Permitir que outros gravem minha transmissão" checked={ownPermission?.allowed ?? false}
          disabled={!ownPermission} onChange={e => clips.permission(own.peerId, e.currentTarget.checked)} />}
        <Text size="sm">{clips.source ? `Fonte do clipe: ${clips.source.displayName}` : `Transmissão selecionada: ${target ? name(target.peerId) : 'nenhuma'}`}</Text>
        <Checkbox styles={{ body: { minHeight: 44, alignItems: 'center' }, label: { minHeight: 44, display: 'flex', alignItems: 'center' } }} label="Incluir áudio da transmissão" checked={audio} disabled={busy} onChange={e => setAudio(e.currentTarget.checked)} />
        <Text size="xs">Áudio opcional da aba/sistema, independente do volume ou mudo do seu reprodutor. Sem microfone ou câmera.</Text>
        {!clips.supported && <Text size="sm">Gravação indisponível neste navegador.</Text>}
        {!busy && !clips.file && target && !target.isLocal && !permission?.allowed && <Text size="sm">O apresentador ainda não permitiu gravar esta transmissão.</Text>}
        {busy ? <Button style={{ minHeight: 44 }} color="red" disabled={clips.status === 'finishing'} onClick={() => clips.stop()}>{clips.status === 'pending' ? 'Cancelar solicitação' : clips.status === 'finishing' ? 'Finalizando…' : 'Parar gravação'}</Button>
          : <Button style={{ minHeight: 44 }} disabled={!clips.supported || !stream || !target?.isSharing || target.isPaused || !permission || (!target.isLocal && !permission.allowed) || !!clips.file}
            onClick={() => target && stream && clips.start(target, stream, audio)}>Iniciar gravação</Button>}
        <Text role="status" aria-live="polite" size="sm">{clips.status === 'recording' ? `Gravação ativa: ${clips.elapsed} de 60 segundos.` : clips.notice}</Text>
        {clips.snapshot?.recordings.map(r => <Text size="sm" key={r.recordingId}>● {name(r.recorderId)} está gravando {name(r.presenterId)}</Text>)}
        {clips.file && <>
          {clips.url && <video controls playsInline src={clips.url} style={{ width: '100%' }} aria-label="Prévia local do clipe" />}
          <Text size="xs">Prévia somente neste dispositivo. Nada é enviado ao servidor. Formato: {clips.file.extension.toUpperCase()}.</Text>
          <Button style={{ minHeight: 44 }} onClick={clips.save}>Salvar clipe</Button><Button style={{ minHeight: 44 }} variant="subtle" onClick={clips.discard}>Descartar clipe</Button>
        </>}
      </Stack>
    </Popover.Dropdown>
  </Popover>
    <Text size="xs" role="status" aria-live="polite" style={{ background: '#0d1117', borderRadius: 6, maxHeight: 72, overflowY: 'auto' }}>
      {clips.source && <span style={{ display: 'block' }}>Fonte do clipe: {clips.source.displayName}</span>}
      {clips.status === 'recording' ? `● Gravação local ativa · ${clips.elapsed}s` : clips.notice}
      {clips.snapshot?.recordings.map(r => <span key={r.recordingId} style={{ display: 'block' }}>● {name(r.recorderId)} gravando {name(r.presenterId)}</span>)}
    </Text>
  </div>;
}
