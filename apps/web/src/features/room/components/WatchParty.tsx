import { StageViewControls, CinemaControl, FullscreenControl } from './StageViewControls';
import { ParticipantsContent } from './WatchPartyParticipants';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Drawer, FileButton, Progress, Text } from '@mantine/core';
import type { WatchParty } from '../hooks/useWatchParty';
import type { RoomParticipant } from '../types';
import { useAudioOutput } from '../hooks/AudioOutput';
import { videoReadiness } from '../watch/video-readiness';
import { expectedPosition } from '../watch/timeline';
import {
  IconCinema,
  IconScreen,
  IconVolume,
  IconVolumeMute,
  IconCheck,
  IconChevronDown,
  IconPlay,
  IconPause,
  IconLock,
  IconAlertTriangle,
  IconShield,
} from './Icons';
import { formatDisplayName } from '../utils/avatar';
import styles from './WatchParty.module.css';

const labels: Record<string, string> = {
  waiting: 'Aguardando aceite',
  offered: 'Convite recebido',
  queued: 'Na fila',
  transferring: 'Transferindo',
  verifying: 'Verificando integridade',
  complete: 'Arquivo disponível',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
  error: 'Falha na entrega',
};

export const time = (value: number) => {
  const safe = Number.isFinite(value) && value >= 0 ? value : 0;
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
};

export interface StageContentSelectorProps {
  watchMode: boolean;
  hasSession: boolean;
  streamCount: number;
  onSelectMode: (mode: 'streams' | 'watch') => void;
}

export function StageContentSelector({
  watchMode,
  hasSession,
  streamCount,
  onSelectMode,
}: StageContentSelectorProps) {
  const streamsActive = !watchMode;
  const watchActive = watchMode;
  const streamsLabel = 'Transmissões';
  const watchLabel = 'Vídeo compartilhado';

  return (
    <nav className={styles.stageNav} aria-label="Conteúdo do palco">
      <button
        type="button"
        className={`${styles.stageTab} ${streamsActive ? styles.selected : ''}`}
        onClick={() => onSelectMode('streams')}
        aria-current={streamsActive ? 'page' : undefined}
        aria-label={watchMode ? 'Voltar às transmissões' : 'Ver transmissões de tela'}
        title="Ver transmissões de tela"
        data-control-id="watch-back"
      >
        <IconScreen size={15} aria-hidden="true" />
        <span>{streamsLabel}</span>
        {streamCount > 0 && <span className={styles.countTag}>{streamCount}</span>}
      </button>
      <button
        type="button"
        className={`${styles.stageTab} ${watchActive ? styles.selected : ''}`}
        onClick={() => onSelectMode('watch')}
        aria-current={watchActive ? 'page' : undefined}
        aria-label={hasSession ? 'Vídeo compartilhado' : 'Assistir vídeo com a sala'}
        title={hasSession ? 'Sessão de vídeo ativa' : 'Iniciar vídeo compartilhado'}
        data-control-id="watch-party"
      >
        <IconCinema size={15} aria-hidden="true" />
        <span className={styles.fullLabel}>{watchLabel}</span>
        <span className={styles.shortLabel} aria-hidden="true">Vídeo</span>
        {hasSession && <span className={styles.livePip} title="Sessão de vídeo ativa" aria-hidden="true" />}
      </button>
    </nav>
  );
}

export interface WatchPartyPanelProps {
  controlsExpanded: boolean;
  onControlsExpandedChange: (expanded: boolean) => void;
  watch: WatchParty;
  participants: RoomParticipant[];
  isCinema?: boolean;
  onToggleCinema?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  showAccess?: boolean;
  interactionAccess?: React.ReactNode;
  interactions?: React.ReactNode;
  stageContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export function WatchPartyPanel({
  controlsExpanded,
  onControlsExpandedChange,
  watch,
  participants,
  isCinema = false,
  onToggleCinema,
  isFullscreen = false,
  onToggleFullscreen,
  showAccess = false,
  interactionAccess,
  interactions,
  stageContainerRef,
}: WatchPartyPanelProps) {
  const { state } = watch;
  const [panelOpen, setPanelOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const resetPicker = useRef<(() => void) | null>(null);
  const participantsTrigger = useRef<HTMLButtonElement>(null);
  const wasPanelOpen = useRef(false);
  useEffect(() => { setPanelOpen(false); }, [state?.sessionId]);
  useEffect(() => {
    if (!panelOpen && wasPanelOpen.current) participantsTrigger.current?.focus();
    wasPanelOpen.current = panelOpen;
  }, [panelOpen]);

  useEffect(() => {
    if (watch.error) {
      errorRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [watch.error]);

  const controller = participants.find((p) => p.peerId === state?.controllerId);
  const controllerName = controller ? formatDisplayName(controller.nickname, controller.isLocal) : 'Participante';
  const others = participants.filter((p) => !p.isLocal);
  const audience = participants.filter((p) => p.peerId !== state?.controllerId);
  const readyCount = audience.filter((p) => watch.availability[p.peerId] === 'ready').length;
  const unavailableCount = audience.filter((p) => {
    const readiness = watch.availability[p.peerId];
    const delivery = [...watch.deliveries].reverse().find((d) => d.peerId === p.peerId);
    return readiness === 'error' || readiness === 'unavailable' || delivery?.state === 'rejected' || delivery?.state === 'error';
  }).length;

  const canInvite = others.some((p) => {
    const delivery = [...watch.deliveries].reverse().find((d) => d.peerId === p.peerId);
    return !delivery || ['error', 'cancelled', 'rejected'].includes(delivery.state);
  });

  const incoming = watch.incoming;
  const receiving = !!incoming && ['queued', 'transferring', 'verifying'].includes(incoming.state);
  const progress = state && incoming ? Math.min(100, (100 * incoming.bytes) / state.file.size) : 0;

  return (
    <section
      ref={stageContainerRef}
      tabIndex={-1}
      role="region"
      aria-label="Vídeo compartilhado"
      data-session={!!state}
      data-contextual-access={showAccess || undefined}
      className={`stage-main-container ${styles.watchStage}`}
      style={{
        marginBottom: isFullscreen ? 0 : 'var(--room-dock-reserve, calc(88px + env(safe-area-inset-bottom, 0px)))',
      }}
    >
      {interactions}

      <StageViewControls expanded={controlsExpanded} onExpandedChange={onControlsExpandedChange} label="Visualização do vídeo compartilhado">
        <div className="stage-display-controls" role="group" aria-label="Controles de visualização">
          {onToggleCinema && <CinemaControl active={isCinema} onClick={onToggleCinema} />}
          {onToggleFullscreen && <FullscreenControl active={isFullscreen} onClick={onToggleFullscreen} />}
        </div>
      </StageViewControls>
      <div className={styles.stageAccess}>
          {state && watch.blob && (
            <Button variant="subtle"
              type="button"
              className={styles.crewPill}
              ref={participantsTrigger}
              aria-label={audience.length ? `Participantes da sessão: ${readyCount} de ${audience.length} prontos` : 'Participantes da sessão: só você'}
              aria-expanded={panelOpen}
              onClick={() => setPanelOpen((v) => !v)}
            >
              <span className={styles.crewLabel}>
                {audience.length ? `${readyCount}/${audience.length}` : 'Só você'}
                {audience.length > 0 && <span className={styles.w}> prontos</span>}
              </span>
              {unavailableCount > 0 && <i className={styles.warnDot} title={`${unavailableCount} indisponíveis`} />}
              <IconChevronDown size={13} aria-hidden="true" />
            </Button>
          )}

          {showAccess && interactionAccess}
      </div>

        <div className={styles.topbarLeft}>
          {state && (
            <div className={styles.videoMetaPill}>
              <b className={styles.ellip}>{state.file.name}</b>
            </div>
          )}
        </div>

      {/* Conteúdo Central */}
      {!state ? (
        // Estado 1: Preparação do vídeo
        <div className={styles.theaterCenter}>
          <div className={styles.stagecard}>
            <section className={styles.prepBox} aria-label="Preparação do vídeo compartilhado">
              <div className={styles.prepIcon}>
                <IconCinema size={34} aria-hidden="true" />
              </div>
              <h2>Escolha um vídeo</h2>
              <p className={styles.prepLede}>
                Você controla a reprodução do arquivo local para todos.
              </p>

              {(watch.busy || watch.pending) && (
                <div className={styles.prepStatus} role="status">
                  <Progress size="sm" radius="xl" style={{ width: '100%' }} value={100} animated />
                  <span>{watch.busy ? 'Verificando e preparando vídeo…' : 'Aguardando confirmação da sala…'}</span>
                </div>
              )}

              {watch.error && (
                <div ref={errorRef} className={styles.alertBox} role="alert">
                  <IconAlertTriangle size={18} aria-hidden="true" />
                  <span>{watch.error}</span>
                </div>
              )}

              <div className={styles.prepActions}>
                <FileButton
                  accept="video/mp4,video/webm,.mp4,.webm"
                  disabled={watch.busy || watch.pending || !watch.snapshot}
                  resetRef={resetPicker}
                  inputProps={{ 'aria-label': 'Selecionar vídeo local', disabled: watch.busy || watch.pending || !watch.snapshot }}
                  onChange={(file) => { resetPicker.current?.(); if (file) void watch.create(file); }}
                >
                  {(props) => <Button {...props} disabled={watch.busy || watch.pending || !watch.snapshot} mih={44} leftSection={<IconCinema size={18} />} loading={watch.busy || watch.pending}>
                    {watch.error ? 'Selecionar outro vídeo' : 'Selecionar vídeo local'}
                  </Button>}
                </FileButton>
              </div>

              <small className={styles.fmtHint}>MP4 ou WebM · até 20 MiB</small>
            </section>

            <p className={styles.consentNotice}>
              <IconShield size={16} aria-hidden="true" />
              <span>
                Cada pessoa escolhe se deseja receber o vídeo. O arquivo fica apenas temporariamente nesta página.
              </span>
            </p>


          </div>
        </div>
      ) : !watch.blob ? (
        // Estado 2: Espectador convidado ou transferindo
        <div className={styles.theaterCenter}>
          <div className={styles.stagecard}>
            {incoming?.state === 'offered' ? (
              <section className={styles.prepBox} aria-label="Convite para vídeo compartilhado">
                <div className={styles.prepIcon}>
                  <IconCinema size={34} aria-hidden="true" />
                </div>
                <h2>Vamos assistir juntos?</h2>
                <p className={styles.prepLede}>
                  {controllerName} quer assistir a um vídeo com você. Aceite receber o arquivo para acompanhar a sessão.
                </p>
                <div className={styles.fileChip}>
                  <IconCinema size={18} aria-hidden="true" />
                  <span className={styles.ellip}>{state.file.name}</span>
                  <em>{(state.file.size / 1024 / 1024).toFixed(1)} MiB</em>
                </div>
                <div className={styles.prepActions}>
                  <Button size="md" onClick={watch.accept}>
                    Aceitar vídeo
                  </Button>
                  <Button variant="subtle" color="gray" size="md" onClick={watch.reject}>
                    Recusar vídeo
                  </Button>
                </div>
              </section>
            ) : receiving ? (
              <section className={styles.prepBox} aria-label="Recebendo o vídeo compartilhado">
                <div className={styles.prepIcon}>
                  <IconCheck size={32} aria-hidden="true" />
                </div>
                <h2>{incoming?.state === 'verifying' ? 'Verificando integridade' : 'Transferindo vídeo'}</h2>
                <p className={styles.prepLede}>
                  {incoming?.state === 'verifying'
                    ? 'Conferindo o arquivo antes de liberar a reprodução.'
                    : 'Você poderá assistir assim que o vídeo estiver pronto.'}
                </p>
                <div className={styles.fileChip}>
                  <IconCinema size={18} aria-hidden="true" />
                  <span className={styles.ellip}>{state.file.name}</span>
                  <em>{(state.file.size / 1024 / 1024).toFixed(1)} MiB</em>
                </div>
                <div className={styles.xferBlock} role="status">
                  <div className={styles.xferLabel}>
                    <span>{labels[incoming!.state]}</span>
                    <b>{Math.round(progress)}%</b>
                  </div>
                  <Progress
                    aria-label="Progresso do vídeo"
                    value={progress}
                    size="sm"
                    radius="xl"
                  />
                  <ol className={styles.stepTrail}>
                    <li className={styles.done}>Convite aceito</li>
                    <li className={incoming?.state === 'verifying' ? styles.done : styles.on}>Transferindo</li>
                    <li className={incoming?.state === 'verifying' ? styles.on : undefined}>Integridade</li>
                    <li>Pronto</li>
                  </ol>
                </div>
              </section>
            ) : (
              <section className={styles.prepBox} aria-label="Aguardando convite">
                <div className={styles.prepIcon}>
                  <IconCinema size={34} aria-hidden="true" />
                </div>
                <h3>{incoming ? labels[incoming.state] : 'Aguardando convite'}</h3>
                <p className={styles.prepLede}>
                  {incoming && ['error', 'cancelled', 'rejected'].includes(incoming.state)
                    ? 'Peça ao controlador um novo convite para tentar novamente.'
                    : 'O controlador pode enviar um novo convite para você.'}
                </p>
                <div className={styles.fileChip}>
                  <IconCinema size={18} aria-hidden="true" />
                  <span className={styles.ellip}>{state.file.name}</span>
                  <em>{(state.file.size / 1024 / 1024).toFixed(1)} MiB</em>
                </div>
                {incoming?.state === 'rejected' && (
                  <Button variant="subtle" onClick={watch.accept}>
                    Mudar de ideia e aceitar
                  </Button>
                )}
              </section>
            )}

            <p className={styles.consentNotice}>
              <IconShield size={16} aria-hidden="true" />
              <span>
                O vídeo fica temporariamente nesta página. Cada pessoa escolhe se deseja recebê-lo.
              </span>
            </p>

            {watch.error && (
              <div ref={errorRef} className={styles.alertBox} role="alert">
                <IconAlertTriangle size={18} aria-hidden="true" />
                <span>{watch.error}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        // Estado 3: Player ativo
        <WatchPlayer
          key={state.sessionId}
          watch={watch}
          controllerName={controllerName}
        />
      )}

      {state && watch.blob && (
        <Drawer
          opened={panelOpen}
          onClose={() => setPanelOpen(false)}
          position="right"
          size="sm"
          title="Participantes do vídeo"
          closeButtonProps={{ 'aria-label': 'Fechar participantes' }}
          portalProps={{ target: isFullscreen ? stageContainerRef?.current ?? undefined : undefined }}
          styles={{
            content: { background: 'var(--mantine-color-dark-8)', color: 'var(--mantine-color-dark-0)' },
            header: { background: 'var(--mantine-color-dark-8)', borderBottom: '1px solid var(--mantine-color-dark-5)' },
            body: { padding: 20 },
          }}
        >
          <ParticipantsContent watch={watch} participants={participants} controllerName={controllerName} canInvite={canInvite} />
        </Drawer>
      )}
    </section>
  );
}

interface WatchPlayerProps {
  watch: WatchParty;
  controllerName: string;
}

function WatchPlayer({ watch, controllerName }: WatchPlayerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const output = useAudioOutput();
  const latest = useRef(watch);
  latest.current = watch;

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
  const mediaReady = useRef(false);
  const audio = useRef({ muted, volume, output });
  audio.current = { muted, volume, output };
  const syncRef = useRef<() => void>(() => {});


  const play = () => {
    const element = video.current;
    if (!element || !mediaReady.current || playPending.current) return;
    const epoch = generation.current;
    playPending.current = true;
    element.muted = audio.current.muted || (!!audio.current.output && !audio.current.output.router.allowed(element));
    void element
      .play()
      .then(
        () => {
          if (epoch === generation.current) {
            setBlocked(false);
            latest.current.reportStatus('ready');
          }
        },
        () => {
          if (epoch === generation.current) {
            setBlocked(true);
            latest.current.reportStatus('blocked');
          }
        }
      )
      .finally(() => {
        if (epoch === generation.current) playPending.current = false;
      });
  };

  useLayoutEffect(() => {
    const element = video.current;
    if (!element || !watch.blob || !watch.state) return;
    const url = URL.createObjectURL(watch.blob.slice(0, watch.blob.size, watch.state.file.mime));
    mediaFailed.current = false;
    mediaReady.current = false;
    const abort = new AbortController();
    const readiness = videoReadiness(element, abort.signal, {
      recoverWebmDuration: watch.state.file.mime === 'video/webm',
      expectedDuration: watch.state.duration,
    });
    element.src = url;
    void readiness.then(() => {
      if (abort.signal.aborted) return;
      mediaReady.current = true;
      setBuffering(false);
      latest.current.reportStatus('ready');
      syncRef.current();
    }, () => {
      if (abort.signal.aborted || mediaFailed.current) return;
      mediaFailed.current = true;
      setFailed(true);
      latest.current.playbackError();
    });

    const cleanup = output?.router.register(element, () => {
      element.muted = audio.current.muted || !output.router.allowed(element);
      syncRef.current();
    });

    return () => {
      abort.abort();
      mediaReady.current = false;
      if (!mediaFailed.current) latest.current.reportStatus('unavailable');
      generation.current++;
      playPending.current = false;
      cleanup?.();
      element.muted = true;
      element.pause();
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
    };
  }, [watch.blob, output?.router]);

  useLayoutEffect(() => {
    const element = video.current;
    if (element) {
      element.volume = volume;
      element.muted = muted || (!!output && !output.router.allowed(element));
    }
  }, [muted, volume, output?.router]);

  useEffect(() => {
    let disposed = false;
    const sync = () => {
      const element = video.current;
      const current = latest.current;
      if (disposed || !mediaReady.current || !element || !current.state || element.readyState < 1 || failed) return;
      const target = expectedPosition(current.state, current.clock.now());
      if (Math.abs(element.currentTime - target) > 0.65) {
        element.currentTime = target;
      }
      if (current.state.playing && target < current.state.duration) {
        if (element.paused && !blocked) play();
      } else {
        element.pause();
      }
      setPosition(element.currentTime);
    };

    syncRef.current = sync;
    const timer = setInterval(sync, 500);
    sync();
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [watch.snapshot?.revision, blocked, failed]);

  const state = watch.state!;
  const commitSeek = () => {
    if (seekDraft !== null) {
      watch.command('seek', seekDraft);
      setSeekDraft(null);
    }
  };

  const statusText = failed
    ? 'Vídeo incompatível. Tente outro arquivo.'
    : blocked
      ? 'Reprodução bloqueada pelo navegador'
      : buffering
        ? 'Carregando neste dispositivo · os demais continuam assistindo'
        : state.playing
          ? 'Reproduzindo · sincronização aproximada'
          : 'Pausado para a sala';

  const pct = state.duration > 0 ? (100 * (seekDraft ?? position)) / state.duration : 0;

  const transportControls = (
    <div className={styles.transportBar} role="region" aria-label="Controles de reprodução do vídeo">
      <div className={styles.timelineRow}>
        <span className={styles.tVal}>{time(seekDraft ?? position)}</span>
        <input
          aria-label="Posição do vídeo"
          aria-valuetext={`${time(seekDraft ?? position)} de ${time(state.duration)}`}
          className={styles.rng}
          type="range"
          min={0}
          max={state.duration}
          step={0.1}
          value={seekDraft ?? position}
          disabled={!watch.controller || watch.pending || failed}
          onChange={(event) => setSeekDraft(Number(event.target.value))}
          onPointerUp={commitSeek}
          onKeyUp={(event) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
              commitSeek();
            }
          }}
          onBlur={commitSeek}
          style={{ '--v': `${pct}%` } as React.CSSProperties}
        />
        <span className={`${styles.tVal} ${styles.dim}`}>{time(state.duration)}</span>
      </div>

      <div className={styles.controlsRow}>
        {watch.controller ? (
          <Button variant="filled"
            type="button"
            className={styles.playBtn}
            aria-label={state.playing ? 'Pausar para todos' : 'Reproduzir para todos'}
            disabled={watch.pending || failed}
            onClick={() => watch.command(state.playing ? 'pause' : 'play')}
          >
            {state.playing ? <IconPause size={18} /> : <IconPlay size={18} />}
            <span>
              {state.playing ? 'Pausar' : 'Reproduzir'}
              <span className={styles.fe}> para todos</span>
            </span>
          </Button>
        ) : (
          <span className={styles.authorityBadge} id="seekhint">
            <IconLock size={14} />
            <span>{controllerName} controla</span>
          </span>
        )}

        <span className={styles.statusMsg} role="status">
          {statusText}
        </span>

        <div className={styles.localAudio} role="group" aria-label="Áudio neste dispositivo">
          <Button variant="subtle"
            type="button"
            className={styles.muteBtn}
            aria-label={muted || volume === 0 ? 'Ativar som do vídeo' : 'Silenciar vídeo'}
            title={muted || volume === 0 ? 'Ativar som do vídeo' : 'Silenciar vídeo'}
            aria-pressed={muted}
            onClick={() => setMuted((v) => !v)}
          >
            {muted || volume === 0 ? <IconVolumeMute size={20} /> : <IconVolume size={20} />}
          </Button>
          <input
            aria-label="Volume do vídeo"
            className={`${styles.rng} ${styles.vol}`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => {
              const val = Number(event.target.value);
              setVolume(val);
              if (muted && val > 0) setMuted(false);
            }}
            style={{ '--v': `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
          />
          <small>Só você</small>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={styles.theaterStage}
    >
      <div className={styles.playerUnit}>
        <div className={styles.videoFrame}>
          <video
            data-testid="watch-video"
            ref={video}
            playsInline
            preload="auto"
            disablePictureInPicture
            onCanPlay={() => {
              if (!mediaReady.current) return;
              setBuffering(false);
              latest.current.reportStatus('ready');
              syncRef.current();
            }}
            onWaiting={() => {
              if (!mediaReady.current) return;
              setBuffering(true);
              latest.current.reportStatus('buffering');
            }}
            onPlaying={() => {
              setBuffering(false);
              latest.current.reportStatus('ready');
              if (!latest.current.state?.playing) video.current?.pause();
            }}
            onError={() => {
              mediaFailed.current = true;
              setFailed(true);
              latest.current.playbackError();
            }}
          />

          {blocked && !failed && (
            <div className={styles.blockedVeil}>
              <p>O navegador precisa da sua permissão para reproduzir o vídeo aqui.</p>
              <Button
                onClick={() => {
                  play();
                  syncRef.current();
                }}
              >
                Ativar reprodução neste dispositivo
              </Button>
            </div>
          )}
        </div>

        {transportControls}
      </div>

      {output?.router.unavailable && (
        <Text size="sm" role="alert" c="#fca5a5" style={{ position: 'absolute', bottom: 8, zIndex: 10 }}>
          Saída de áudio indisponível. Escolha uma saída nas configurações.
        </Text>
      )}
    </div>
  );
}
