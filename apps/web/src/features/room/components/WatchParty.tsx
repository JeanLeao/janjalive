import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Group, Progress, Text } from '@mantine/core';
import type { WatchParty } from '../hooks/useWatchParty';
import type { RoomParticipant } from '../types';
import { useAudioOutput } from '../hooks/AudioOutput';
import { expectedPosition } from '../watch/timeline';
import { IconCinema, IconVolume, IconVolumeMute, IconUsers, IconCheck } from './Icons';
import { formatDisplayName, getAvatarColor, getInitials } from '../utils/avatar';
import styles from './WatchParty.module.css';

const labels: Record<string, string> = { waiting: 'Aguardando aceite', offered: 'Convite recebido', queued: 'Na fila', transferring: 'Transferindo', verifying: 'Verificando integridade', complete: 'Arquivo disponível', rejected: 'Recusado', cancelled: 'Cancelado', error: 'Falha na entrega' };
const readinessLabels: Record<string, string> = { ready: 'Pronto para assistir', buffering: 'Carregando no dispositivo', blocked: 'Aguardando ativação da reprodução', error: 'Vídeo indisponível neste navegador', unavailable: 'Indisponível' };
const time = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;

export function WatchPartyPanel({ watch, participants }: { watch: WatchParty; participants: RoomParticipant[] }) {
  const { state } = watch;
  const error = useRef<HTMLDivElement>(null);
  useEffect(() => { if (watch.error) error.current?.scrollIntoView({ block: 'nearest' }); }, [watch.error]);
  const controller = participants.find(p => p.peerId === state?.controllerId);
  const others = participants.filter(p => !p.isLocal);
  const canInvite = others.some(p => { const delivery = [...watch.deliveries].reverse().find(d => d.peerId === p.peerId); return !delivery || ['error', 'cancelled', 'rejected'].includes(delivery.state); });
  const prepared = others.filter(p => watch.availability[p.peerId] === 'ready').length;
  const incoming = watch.incoming;
  const receiving = !!incoming && ['queued', 'transferring', 'verifying'].includes(incoming.state);
  const progress = state && incoming ? Math.min(100, 100 * incoming.bytes / state.file.size) : 0;
  return <section className={styles.panel} aria-label="Watch Party" data-session={!!state}>
    {!state ? <div className={styles.prepare}>
      <div className={styles.mediaIcon}><IconCinema size={36} aria-hidden="true" /></div>
      <h2>Seu vídeo. A sala inteira.</h2>
      <p className={styles.intro}>Escolha um vídeo para assistir juntos.<br />Você dá o play e controla a reprodução da sala.</p>
      <label className={styles.picker} data-disabled={watch.busy || watch.pending || !watch.snapshot}>
        <IconCinema size={20} aria-hidden="true" />{watch.busy ? 'Preparando vídeo…' : watch.pending ? 'Criando sessão…' : 'Selecionar vídeo local'}
        <input aria-label="Selecionar vídeo local" type="file" accept="video/mp4,video/webm,.mp4,.webm" disabled={watch.busy || watch.pending || !watch.snapshot} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void watch.create(file); }} />
      </label>
      <p className={styles.format}>MP4 ou WebM · até 20 MiB</p>
      <p className={styles.consent}>Cada pessoa escolhe se deseja receber o vídeo.<br />O arquivo fica apenas temporariamente nesta página.</p>
      {(watch.busy || watch.pending) && <p role="status">{watch.busy ? 'Verificando e preparando vídeo…' : 'Aguardando confirmação da sala…'}</p>}
    </div> : <>
      <header className={styles.title}>
        <div className={styles.identity}><h2 className={styles.filename}>{state.file.name}</h2>
          <p>{watch.controller ? 'Você controla a reprodução' : `${controller ? formatDisplayName(controller.nickname, controller.isLocal) : 'Participante'} controla a reprodução`}</p>
        </div>
        <span className={styles.sessionBadge}><span />{state.playing ? 'Sessão em reprodução' : 'Sessão pausada'}</span>
      </header>
      {watch.blob ? <WatchPlayer key={state.sessionId} watch={watch} /> : <div className={styles.invitation}>
        <div className={styles.mediaIcon}>{receiving ? <IconCheck size={32} aria-hidden="true" /> : <IconCinema size={36} aria-hidden="true" />}</div>
        <h3>{incoming?.state === 'offered' ? 'Vamos assistir juntos?' : incoming ? labels[incoming.state] : 'Aguardando convite'}</h3>
        <p>{incoming?.state === 'offered' ? 'Aceite receber este vídeo para acompanhar a sessão.' : receiving ? incoming?.state === 'verifying' ? 'Conferindo o arquivo antes de liberar a reprodução.' : 'Você poderá assistir assim que o vídeo estiver pronto.' : 'O controlador pode enviar um novo convite para você.'}</p>
        <span className={styles.format}>{(state.file.size / 1024 / 1024).toFixed(1)} MiB · vídeo local compartilhado</span>
        {incoming?.state === 'offered' && <><Group justify="center" gap="sm"><Button onClick={watch.accept}>Aceitar vídeo</Button><Button variant="subtle" color="gray" onClick={watch.reject}>Recusar vídeo</Button></Group><p className={styles.consent}>O vídeo fica temporariamente nesta página.<br />Você decide se deseja recebê-lo.</p></>}
        {receiving && <div className={styles.transfer} role="status"><div><span>{labels[incoming!.state]}</span><strong>{Math.round(progress)}%</strong></div><Progress aria-label="Progresso do vídeo" value={progress} /></div>}
        {incoming && ['error', 'cancelled', 'rejected'].includes(incoming.state) && <p>Peça ao controlador um novo convite para tentar novamente.</p>}
      </div>}
      {watch.controller && <section className={styles.sessionInfo} aria-label="Participantes da Watch Party">
        <details className={styles.deliveries} open>
          <summary aria-label="Disponibilidade dos participantes"><IconUsers size={18} aria-hidden="true" /><span>Participantes</span><span className={styles.count}>{prepared}/{others.length} prontos</span></summary>
          <div className={styles.participants}>
            {others.map(p => {
              const delivery = [...watch.deliveries].reverse().find(d => d.peerId === p.peerId);
              const readiness = watch.availability[p.peerId];
              const transferring = delivery && ['queued', 'transferring', 'verifying'].includes(delivery.state);
              const name = formatDisplayName(p.nickname, p.isLocal);
              const value = delivery ? Math.min(100, 100 * delivery.bytes / state.file.size) : 0;
              return <div className={styles.participant} key={p.peerId}>
                <span className={styles.avatar} style={{ background: getAvatarColor(name).bg, color: getAvatarColor(name).text }}>{getInitials(name)}</span>
                <div className={styles.participantInfo}><strong>{name}</strong><span data-ready={readiness === 'ready'}>{transferring ? labels[delivery.state] : readiness ? readiness === 'ready' && state.playing ? 'Reproduzindo' : readinessLabels[readiness] : delivery ? labels[delivery.state] : 'Ainda sem convite'}{transferring && ` · ${Math.round(value)}%`}</span>{transferring && <Progress aria-label={`Progresso para ${p.nickname || 'participante'}`} value={value} size="xs" />}</div>
                {readiness === 'ready' && <IconCheck size={18} className={styles.readyIcon} aria-label="Preparado" />}
              </div>;
            })}
            {!others.length && <p className={styles.noGuests}>Quando alguém entrar na sala, receberá um convite para assistir.</p>}
          </div>
          {canInvite && <Button variant="subtle" size="sm" disabled={watch.inviting} onClick={() => void watch.invite(true)}>Convidar participantes indisponíveis</Button>}
        </details>
        <Button className={styles.endButton} variant="subtle" color="red" disabled={watch.pending} onClick={() => watch.command('end')}>Encerrar Watch Party</Button>
      </section>}
    </>}
    {watch.error && <div ref={error} className={styles.error} role="alert">{watch.error}</div>}
  </section>;
}

function WatchPlayer({ watch }: { watch: WatchParty }) {
  const video = useRef<HTMLVideoElement>(null);
  const output = useAudioOutput();
  const latest = useRef(watch); latest.current = watch;
  const [ratio, setRatio] = useState(16 / 9);
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
  return <div className={styles.player} style={{ maxWidth: `max(min(100%, 600px), min(100%, calc(var(--watch-video-height) * ${ratio})))` }}>
    <div className={styles.mediaFrame}>
    <video data-testid="watch-video" ref={video} playsInline preload="auto" disablePictureInPicture
      onLoadedMetadata={() => { const element = video.current; if (element?.videoWidth && element.videoHeight) setRatio(element.videoWidth / element.videoHeight); }}
      onLoadedData={() => { latest.current.reportStatus('ready'); syncRef.current(); }} onCanPlay={() => { setBuffering(false); latest.current.reportStatus('ready'); syncRef.current(); }}
      onWaiting={() => { setBuffering(true); latest.current.reportStatus('buffering'); }} onPlaying={() => { setBuffering(false); latest.current.reportStatus('ready'); if (!latest.current.state?.playing) video.current?.pause(); }}
      onError={() => { mediaFailed.current = true; setFailed(true); latest.current.playbackError(); }} />
    </div>
    <div className={styles.transport}>
      <div className={styles.timeline}>
        <input aria-label="Posição do vídeo" aria-valuetext={`${time(seekDraft ?? position)} de ${time(state.duration)}`} type="range" min={0} max={state.duration} step={0.1} value={seekDraft ?? position} disabled={!watch.controller || watch.pending || failed} onChange={event => setSeekDraft(Number(event.target.value))} onPointerUp={commitSeek} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commitSeek(); }} onBlur={commitSeek} />
        <span className={styles.time}>{time(seekDraft ?? position)} <span>/ {time(state.duration)}</span></span>
      </div>
      <div className={styles.controls}>
        {watch.controller && <Button className={styles.playButton} aria-label={state.playing ? 'Pausar para todos' : 'Reproduzir para todos'} disabled={watch.pending || failed} onClick={() => watch.command(state.playing ? 'pause' : 'play')} leftSection={<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">{state.playing ? <path d="M6 4h4v16H6zm8 0h4v16h-4z" /> : <path d="m7 4 14 8-14 8z" />}</svg>}>{state.playing ? 'Pausar' : 'Reproduzir'}<span className={styles.forEveryone}>{'\u00a0'}para todos</span></Button>}
        <Text className={styles.playbackStatus} size="sm" role="status">{failed ? 'Vídeo incompatível. Tente outro arquivo.' : blocked ? 'Reprodução bloqueada pelo navegador' : buffering ? 'Carregando neste dispositivo · os demais continuam assistindo' : state.playing ? 'Reproduzindo · sincronização aproximada' : 'Pausado para a sala'}</Text>
        <div className={styles.localAudio} role="group" aria-label="Áudio neste dispositivo">
          <button className={styles.muteButton} aria-label={muted ? 'Ativar som do vídeo' : 'Silenciar vídeo'} title={muted ? 'Ativar som do vídeo' : 'Silenciar vídeo'} aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted || volume === 0 ? <IconVolumeMute size={20} /> : <IconVolume size={20} />}</button>
          {deviceVolume ? <span className={styles.deviceVolume}>Volume no dispositivo</span> : <label className={styles.volume}><span>Seu volume</span><input aria-label="Volume do vídeo" type="range" min={0} max={1} step={0.05} value={volume} onChange={event => setVolume(Number(event.target.value))} /></label>}
        </div>
      </div>
      {blocked && !failed && <div className={styles.blocked}><span>O navegador precisa da sua permissão para reproduzir aqui.</span><Button onClick={() => { play(); syncRef.current(); }}>Ativar reprodução neste dispositivo</Button></div>}
    </div>
    {output?.router.unavailable && <Text size="sm" role="alert">Saída de áudio indisponível. Escolha uma saída nas configurações.</Text>}
  </div>;
}
