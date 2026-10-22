import { FILE_LIMITS } from '@screen-room/protocol';
import { useEffect, useRef, useState } from 'react';
import { Button, Group, Modal, Popover, Text } from '@mantine/core';
import type { WatchParty } from '../hooks/useWatchParty';
import type { ClipFile } from '../media/local-clip';
import type { useLocalClips } from '../hooks/useLocalClips';
import type { RoomParticipant, RemoteStreamEntry } from '../types';
import classes from './ClipControls.module.css';

type Props = {
  watch?: WatchParty;
  onSendClip: () => boolean;
  attachmentBusy: boolean;
  attachmentPrepared: boolean;
  connected: boolean;
  clips: ReturnType<typeof useLocalClips>;
  participants: RoomParticipant[];
  localStream: MediaStream | null;
  remoteStreams: RemoteStreamEntry[];
  featuredStreamId: string | null;
};

export function ClipControls({
  clips, watch, onSendClip, attachmentBusy, attachmentPrepared, connected,
  participants,
  localStream,
  remoteStreams,
  featuredStreamId,
}: Props) {
  const [returnFocus, setReturnFocus] = useState(true);
  const [audio, setAudio] = useState(false);
  const [opened, setOpened] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [confirmation, setConfirmation] = useState<ClipFile | null>(null);
  const preparation = useRef<AbortController | null>(null);
  const watchButton = useRef<HTMLButtonElement>(null);
  const latest = useRef({ file: clips.file, own: clips.source?.own, connected });
  latest.current = { file: clips.file, own: clips.source?.own, connected };
  const watchUnavailable = !connected || !watch?.snapshot ? 'Aguarde a conexão com a sala.'
    : watch.state ? 'Já existe um vídeo compartilhado nesta sala.'
    : watch.busy ? 'Verificando e preparando vídeo…'
    : watch.pending ? 'Aguardando confirmação da sala…'
    : !clips.file?.blob.size ? 'O clipe está vazio.'
    : clips.file.blob.size > FILE_LIMITS.maxBytes ? 'Assistir juntos aceita clipes de até 20 MiB. Você ainda pode salvar ou descartar.' : '';

  useEffect(() => {
    setConfirmation(null);
    return () => { preparation.current?.abort(); preparation.current = null; };
  }, [clips.file, connected]);

  const closeConfirmation = () => {
    setConfirmation(null);
  };
  const confirmWatch = () => {
    const file = confirmation;
    if (!file || preparation.current || watchUnavailable || !clips.source?.own || file !== clips.file || !watch) return;
    setConfirmation(null);
    const abort = new AbortController();
    preparation.current = abort;
    const video = new File([file.blob], `janjalive-${Date.now()}.${file.extension}`, {
      type: file.blob.type || `video/${file.extension}`,
    });
    void watch.create(video, {
      signal: abort.signal, recoverClipDuration: true,
      isValid: () => latest.current.file === file && latest.current.own === true && latest.current.connected,
    }).finally(() => {
      if (preparation.current === abort) preparation.current = null;
    });
  };

  useEffect(() => {
    if (!opened) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || confirmation) return;
      event.stopPropagation();
      setOpened(false);
      triggerRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [opened, confirmation]);

  const own = participants.find(p => p.isLocal);
  const target =
    participants.find(p => (featuredStreamId === 'local' ? p.isLocal : p.peerId === featuredStreamId)) ??
    participants.find(p => p.isSharing);
  const stream = target?.isLocal
    ? localStream
    : remoteStreams.find(r => r.peerId === target?.peerId)?.stream;
  const permission = clips.snapshot?.permissions.find(
    p => p.presenterId === target?.peerId && p.streamId === target.streamId,
  );
  const ownPermission = clips.snapshot?.permissions.find(
    p => p.presenterId === own?.peerId && p.streamId === own.streamId,
  );
  const busy = clips.status !== 'idle';
  const recordings = clips.snapshot?.recordings ?? [];
  const name = (id: string) => participants.find(p => p.peerId === id)?.nickname || id.slice(0, 8);

  const canStart =
    clips.supported &&
    Boolean(stream) &&
    Boolean(target?.isSharing) &&
    !target?.isPaused &&
    Boolean(permission) &&
    (Boolean(target?.isLocal) || Boolean(permission?.allowed)) &&
    !clips.file;

  const statusLine =
    clips.status === 'recording'
      ? 'Gravação local ativa.'
      : clips.status === 'pending'
      ? 'Solicitando autorização…'
      : clips.status === 'finishing'
      ? 'Finalizando clipe…'
      : clips.notice;

  const hasAmbientStatus =
    !opened &&
    Boolean(clips.source || clips.status === 'recording' || clips.notice || recordings.length > 0);

  const triggerLabel = busy
    ? clips.status === 'recording'
      ? `● Gravando / ${clips.elapsed}s`
      : clips.status === 'pending'
      ? 'Aguardando autorização'
      : 'Finalizando clipe'
    : `Clipes${clips.file ? ' · prévia' : ''}${recordings.length ? ` (${recordings.length})` : ''}`;

  return (
    <div className={classes.root} data-clip-controls>
      <p role="status" aria-live="polite" className={classes.announcement}>
        {[statusLine, clips.file && clips.source?.own && opened ? (watchUnavailable || watch?.error) : '', clips.status !== 'idle' ? clips.notice : '', ...recordings.map(r =>
          `${name(r.recorderId)} está gravando ${name(r.presenterId)}.`,
        )].filter(Boolean).join(' ')}
      </p>
      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-end"
        offset={8}
        withinPortal={false}
        closeOnClickOutside={!confirmation}
        closeOnEscape={!confirmation}
        trapFocus={!confirmation}
        returnFocus={returnFocus}
        middlewares={{ flip: false, shift: { padding: 10 } }}
        classNames={{ dropdown: classes.dropdown }}
      >
        <Popover.Target>
          <button
            ref={triggerRef}
            type="button"
            className={classes.trigger}
            data-opened={opened || undefined}
            data-state={busy ? clips.status : undefined}
            data-preview={clips.file ? true : undefined}
            aria-expanded={opened}
            aria-label={clips.status === 'recording' ? '● Gravando' : undefined}
            onClick={() => { setReturnFocus(true); setOpened(v => !v); }}
          >
            {clips.status === 'recording' || recordings.length > 0 ? (
              <span className={classes.recDot} aria-hidden="true" />
            ) : (
              <svg
                className={classes.triggerIcon}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="5" width="14" height="14" rx="2" />
                <path d="m16 10 6-3v10l-6-3z" />
              </svg>
            )}
            <span>{triggerLabel}</span>
          </button>
        </Popover.Target>

        <Popover.Dropdown>
          <div className={classes.panel}>
            <div className={classes.header}>
              <div className={classes.titleRow}>
                <p className={classes.title}>Clipe local · até 60 segundos</p>
                {clips.status === 'recording' && (
                  <span className={classes.badge} data-recording role="timer" aria-live="off">
                    {clips.elapsed}s / 60s
                  </span>
                )}
              </div>
              <p className={classes.lead}>
                Somente a transmissão original selecionada. O consentimento vale para o gravador do
                Janjalive; ferramentas externas não são controladas.
              </p>
            </div>

            <div className={classes.section}>
              {own?.isSharing && (
                <label className={classes.checkbox} data-disabled={!ownPermission || undefined}>
                  <input
                    type="checkbox"
                    checked={ownPermission?.allowed ?? false}
                    disabled={!ownPermission}
                    onChange={e => clips.permission(own.peerId, e.currentTarget.checked)}
                  />
                  <span>Permitir que outros gravem minha transmissão</span>
                </label>
              )}

              <div className={classes.sourceRow}>
                <span>
                  {clips.source
                    ? `Fonte do clipe: ${clips.source.displayName}`
                    : `Transmissão selecionada: ${target ? name(target.peerId) : 'nenhuma'}`}
                </span>
              </div>

              <label className={classes.checkbox} data-disabled={busy || undefined}>
                <input
                  type="checkbox"
                  checked={audio}
                  disabled={busy}
                  onChange={e => setAudio(e.currentTarget.checked)}
                />
                <span>Incluir áudio da transmissão</span>
              </label>
              <p className={classes.hint}>
                Áudio opcional da aba/sistema, independente do volume ou mudo do seu reprodutor. Sem
                microfone ou câmera.
              </p>

              {!clips.supported && (
                <p className={classes.warning}>Gravação indisponível neste navegador.</p>
              )}
              {!busy && !clips.file && target && !target.isLocal && !permission?.allowed && (
                <p className={classes.warning}>
                  O apresentador ainda não permitiu gravar esta transmissão.
                </p>
              )}

              {busy ? (
                <button
                  type="button"
                  className={`${classes.actionBtn} ${classes.actionStop}`}
                  disabled={clips.status === 'finishing'}
                  onClick={() => clips.stop()}
                >
                  {clips.status === 'pending'
                    ? 'Cancelar solicitação'
                    : clips.status === 'finishing'
                    ? 'Finalizando…'
                    : 'Parar gravação'}
                </button>
              ) : (
                <button
                  type="button"
                  className={classes.actionBtn}
                  disabled={!canStart}
                  onClick={() => target && stream && clips.start(target, stream, audio)}
                >
                  Iniciar gravação
                </button>
              )}

              <p className={classes.statusText}>
                {clips.status === 'recording'
                  ? `Gravação ativa: ${clips.elapsed} de 60 segundos.`
                  : statusLine}
              </p>
            </div>

            {recordings.length > 0 && (
              <div className={classes.activeList}>
                {recordings.map(r => (
                  <p key={r.recordingId} className={classes.activeItem}>
                    ● {name(r.recorderId)} está gravando {name(r.presenterId)}
                  </p>
                ))}
              </div>
            )}

            {clips.file && (
              <div className={classes.previewCard}>
                {clips.url && (
                  <video
                    controls
                    playsInline
                    src={clips.url}
                    className={classes.video}
                    aria-label="Prévia local do clipe"
                  />
                )}
                <p className={classes.hint}>
                  Prévia somente neste dispositivo. Nada é enviado ao servidor. Formato:{' '}
                  {clips.file.extension.toUpperCase()}.
                </p>
                {clips.source?.own && <p className={classes.hint} id="clip-send-hint">
                  {clips.file.blob.size > FILE_LIMITS.maxBytes
                    ? 'Este clipe excede 20 MiB para envio no Chat. Você ainda pode salvar ou descartar.'
                    : attachmentPrepared ? 'Já há um anexo preparado no Chat. Remova-o para preparar este clipe.'
                    : 'Envio privado de até 20 MiB. Selecione os destinatários e confirme no Chat.'}
                </p>}
                {clips.source?.own && watch && <p className={classes.hint} id="clip-watch-hint">
                  {watchUnavailable || watch.error || 'Assista com a sala. Cada participante poderá aceitar ou recusar o clipe.'}
                </p>}
                <div className={classes.previewActions}>
                  <button type="button" className={classes.actionBtn} onClick={clips.save}>
                    Salvar clipe
                  </button>
                  {clips.source?.own && <button type="button" className={classes.actionBtn} aria-describedby="clip-send-hint"
                    disabled={!connected || attachmentBusy || attachmentPrepared || clips.file.blob.size > FILE_LIMITS.maxBytes}
                    onClick={() => { if (onSendClip()) { setReturnFocus(false); setOpened(false); } }}>
                    Enviar no Chat
                  </button>}
                  {clips.source?.own && watch && <button type="button" ref={watchButton} className={classes.actionBtn}
                    aria-describedby="clip-watch-hint" disabled={Boolean(watchUnavailable)}
                    onClick={() => setConfirmation(clips.file)}>
                    Assistir juntos
                  </button>}
                  <button
                    type="button"
                    className={`${classes.actionBtn} ${classes.actionSecondary}`}
                    onClick={() => { preparation.current?.abort(); preparation.current = null; setConfirmation(null); clips.discard(); }}
                  >
                    Descartar clipe
                  </button>
                </div>
              </div>
            )}
          </div>
        </Popover.Dropdown>
      </Popover>

      <Modal opened={Boolean(confirmation)} onClose={closeConfirmation} title="Assistir juntos?"
        portalProps={{ target: typeof document === 'undefined' ? undefined : document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : document.body }} returnFocus={false} onExitTransitionEnd={() => watchButton.current?.focus()} centered size="sm"
        styles={{ content: { maxWidth: 'calc(100vw - 24px)' } }}>
        <Text size="sm">O clipe da sua transmissão será oferecido aos participantes da sala. Cada pessoa poderá aceitar ou recusar o recebimento.</Text>
        {watchUnavailable && <Text size="sm" mt="sm">{watchUnavailable}</Text>}
        <Group mt="md" justify="flex-end">
          <Button variant="default" mih={44} data-autofocus onClick={closeConfirmation}>Cancelar</Button>
          <Button mih={44} disabled={Boolean(watchUnavailable)} onClick={confirmWatch}>Confirmar e iniciar</Button>
        </Group>
      </Modal>

      {hasAmbientStatus && (
        <div
          className={classes.ambientPill}
          data-recording={clips.status === 'recording' || recordings.length > 0 || undefined}
        >
          {clips.source && (
            <span className={classes.ambientLine}>Fonte do clipe: {clips.source.displayName}</span>
          )}
          {(clips.status === 'recording' || clips.notice) && (
            <span className={classes.ambientLine}>
              {clips.status === 'recording'
                ? `● Gravação local ativa · ${clips.elapsed}s`
                : clips.notice}
            </span>
          )}
          {recordings.map(r => (
            <span key={r.recordingId} className={classes.ambientLine}>
              ● {name(r.recorderId)} gravando {name(r.presenterId)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
