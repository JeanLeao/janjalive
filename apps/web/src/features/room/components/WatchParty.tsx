import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Group, Progress, Stack, Text } from '@mantine/core';
import type { WatchParty } from '../hooks/useWatchParty';
import type { RoomParticipant } from '../types';
import { useAudioOutput } from '../hooks/AudioOutput';
import { expectedPosition } from '../watch/timeline';
import styles from './WatchParty.module.css';

const labels: Record<string, string> = { waiting: 'Aguardando aceite', offered: 'Convite recebido', queued: 'Na fila', transferring: 'Transferindo', verifying: 'Verificando integridade', complete: 'Arquivo disponível', rejected: 'Recusado', cancelled: 'Cancelado', error: 'Falha na entrega' };
const readinessLabels: Record<string, string> = { ready: 'Pronto para assistir', buffering: 'Carregando no dispositivo', blocked: 'Aguardando ativação da reprodução', error: 'Vídeo indisponível neste navegador', unavailable: 'Indisponível' };
const time = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;

export function WatchPartyPanel({ watch, participants }: { watch: WatchParty; participants: RoomParticipant[] }) {
  const { state } = watch;
  return <section className={styles.panel} aria-label="Watch Party">
    {!state ? <Stack align="center" gap="md" className={styles.prepare}>
      <Text size="xl" fw={700} component="h2">Assista a um vídeo com a sala</Text>
      <Text c="dimmed" ta="center">Escolha um MP4 ou WebM de até 20 MiB. Cada participante aceita o recebimento antes de assistir. Você controla a reprodução.</Text>
      <label className={styles.picker}>Selecionar vídeo local<input aria-label="Selecionar vídeo local" type="file" accept="video/mp4,video/webm,.mp4,.webm" disabled={watch.busy || watch.pending || !watch.snapshot} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void watch.create(file); }} /></label>
      {(watch.busy || watch.pending) && <Text role="status">{watch.busy ? 'Verificando e preparando vídeo…' : 'Aguardando confirmação da sala…'}</Text>}
    </Stack> : <>
      <div className={styles.title}>
        <div><Text fw={600} className={styles.filename}>{state.file.name}</Text><Text size="sm" c="dimmed">Controle: {participants.find(p => p.peerId === state.controllerId)?.nickname || 'Participante'} · {watch.controller ? 'você controla a sala' : 'reprodução controlada pelo participante'}</Text></div>
        {watch.controller && <Button variant="default" disabled={watch.pending} onClick={() => watch.command('end')}>Encerrar Watch Party</Button>}
      </div>
      {watch.blob ? <WatchPlayer key={state.sessionId} watch={watch} /> : <Stack align="center" gap="md" className={styles.prepare}>
        <Text fw={600}>{watch.incoming ? labels[watch.incoming.state] : 'Aguardando convite do controlador'}</Text>
        <Text size="sm" c="dimmed" ta="center">{(state.file.size / 1024 / 1024).toFixed(1)} MiB · transferência P2P. O vídeo fica temporariamente na memória desta página.</Text>
        {watch.incoming?.state === 'offered' && <Group justify="center"><Button onClick={watch.accept}>Aceitar vídeo</Button><Button variant="default" onClick={watch.reject}>Recusar vídeo</Button></Group>}
        {watch.incoming && ['queued', 'transferring', 'verifying'].includes(watch.incoming.state) && <Progress aria-label="Progresso do vídeo" value={100 * watch.incoming.bytes / state.file.size} w="100%" />}
        {watch.incoming && ['error', 'cancelled', 'rejected'].includes(watch.incoming.state) && <Text size="sm">Peça ao controlador um novo convite para tentar novamente.</Text>}
      </Stack>}
      {watch.controller && <details className={styles.deliveries}><summary>Disponibilidade dos participantes</summary>
        <Stack gap="xs" mt="sm">
          {participants.filter(p => !p.isLocal).map(p => {
            const delivery = [...watch.deliveries].reverse().find(d => d.peerId === p.peerId);
            return <div key={p.peerId}><Text size="sm">{p.nickname || 'Participante'} · {watch.availability[p.peerId] ? readinessLabels[watch.availability[p.peerId]] : delivery ? labels[delivery.state] : 'Ainda sem convite'}</Text>{delivery && ['queued', 'transferring', 'verifying'].includes(delivery.state) && <Progress aria-label={`Progresso para ${p.nickname || 'participante'}`} value={100 * delivery.bytes / state.file.size} />}</div>;
          })}
          {!participants.some(p => !p.isLocal) && <Text size="sm" c="dimmed">Outros participantes serão convidados quando entrarem.</Text>}
          <Button variant="default" disabled={watch.inviting} onClick={() => void watch.invite(true)}>Convidar participantes indisponíveis</Button>
          <Text size="xs" c="dimmed">Até 8 destinatários por lote. A fila e os limites são compartilhados com arquivos do Chat.</Text>
        </Stack>
      </details>}
    </>}
    {watch.error && <Text role="alert" c="red.3">{watch.error}</Text>}
  </section>;
}

function WatchPlayer({ watch }: { watch: WatchParty }) {
  const video = useRef<HTMLVideoElement>(null);
  const output = useAudioOutput();
  const latest = useRef(watch); latest.current = watch;
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const playPending = useRef(false);
  const generation = useRef(0);
  const mediaFailed = useRef(false);
  const audio = useRef({ muted, volume, output }); audio.current = { muted, volume, output };
  const syncRef = useRef<() => void>(() => {});
  const play = () => {
    const element = video.current;
    if (!element || playPending.current) return;
    const epoch = generation.current;
    playPending.current = true;
    element.muted = audio.current.muted || !!audio.current.output && !audio.current.output.router.allowed(element);
    void element.play().then(() => { if (epoch === generation.current) { setBlocked(false); latest.current.reportStatus('ready'); } }, () => { if (epoch === generation.current) { setBlocked(true); latest.current.reportStatus('blocked'); } }).finally(() => { if (epoch === generation.current) playPending.current = false; });
  };
  useLayoutEffect(() => {
    const element = video.current;
    if (!element || !watch.blob || !watch.state) return;
    const url = URL.createObjectURL(watch.blob.slice(0, watch.blob.size, watch.state.file.mime));
    mediaFailed.current = false; element.src = url;
    const cleanup = output?.router.register(element, () => { element.muted = audio.current.muted || !output.router.allowed(element); syncRef.current(); });
    return () => { if (!mediaFailed.current) latest.current.reportStatus('unavailable'); generation.current++; playPending.current = false; cleanup?.(); element.muted = true; element.pause(); element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url); };
  }, [watch.blob, output?.router]);
  useLayoutEffect(() => {
    const element = video.current;
    if (element) { element.volume = volume; element.muted = muted || !!output && !output.router.allowed(element); }
  }, [muted, volume, output?.router]);
  useEffect(() => {
    let disposed = false;
    const sync = () => {
      const element = video.current;
      const current = latest.current;
      if (disposed || !element || !current.state || element.readyState < 1 || failed) return;
      const target = expectedPosition(current.state, current.clock.now());
      if (Math.abs(element.currentTime - target) > 0.65) element.currentTime = target;
      if (current.state.playing && target < current.state.duration) {
        if (element.paused && !blocked) play();
      } else element.pause();
      setPosition(element.currentTime);
    };
    syncRef.current = sync;
    const timer = setInterval(sync, 500); sync();
    return () => { disposed = true; clearInterval(timer); };
  }, [watch.snapshot?.revision, blocked, failed]);
  const deviceVolume = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const state = watch.state!;
  const commitSeek = () => { if (seekDraft !== null) { watch.command('seek', seekDraft); setSeekDraft(null); } };
  return <div className={styles.player}>
    <video data-testid="watch-video" ref={video} playsInline preload="auto" disablePictureInPicture
      onLoadedData={() => { latest.current.reportStatus('ready'); syncRef.current(); }} onCanPlay={() => { setBuffering(false); latest.current.reportStatus('ready'); syncRef.current(); }}
      onWaiting={() => { setBuffering(true); latest.current.reportStatus('buffering'); }} onPlaying={() => { setBuffering(false); latest.current.reportStatus('ready'); if (!latest.current.state?.playing) video.current?.pause(); }}
      onError={() => { mediaFailed.current = true; setFailed(true); latest.current.playbackError(); }} />
    <Text size="sm" role="status">{failed ? 'Codec ou arquivo incompatível neste navegador. Tente outro vídeo.' : blocked ? 'Reprodução bloqueada pelo navegador' : buffering ? 'Carregando neste dispositivo · os demais continuam assistindo' : state.playing ? 'Reproduzindo · sincronização aproximada' : 'Pausado para a sala'}</Text>
    {blocked && !failed && <Button onClick={() => { play(); syncRef.current(); }}>Ativar reprodução neste dispositivo</Button>}
    <div className={styles.controls}>
      {watch.controller && <Button disabled={watch.pending || failed} onClick={() => watch.command(state.playing ? 'pause' : 'play')}>{state.playing ? 'Pausar para todos' : 'Reproduzir para todos'}</Button>}
      <label className={styles.seek}>Posição · {time(position)} / {time(state.duration)}<input aria-label="Posição do vídeo" type="range" min={0} max={state.duration} step={0.1} value={seekDraft ?? position} disabled={!watch.controller || watch.pending || failed} onChange={event => setSeekDraft(Number(event.target.value))} onPointerUp={commitSeek} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commitSeek(); }} onBlur={commitSeek} /></label>
      <Button variant="default" aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted ? 'Ativar som do vídeo' : 'Silenciar vídeo'}</Button>
      {deviceVolume ? <Text size="sm">Ajuste o volume pelos controles do dispositivo.</Text> : <label className={styles.volume}>Volume local<input aria-label="Volume do vídeo" type="range" min={0} max={1} step={0.05} value={volume} onChange={event => setVolume(Number(event.target.value))} /></label>}
    </div>
    {output?.router.unavailable && <Text size="sm" role="alert">Saída de áudio indisponível. Escolha uma saída nas configurações.</Text>}
    <Text size="xs" c="dimmed">Volume e bloqueios de reprodução afetam somente este dispositivo. PiP e Comparar estão disponíveis nas transmissões.</Text>
  </div>;
}
