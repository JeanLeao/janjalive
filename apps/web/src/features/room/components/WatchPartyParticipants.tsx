import { useEffect, useRef, useState } from 'react';
import { Button, Progress, Text } from '@mantine/core';
import type { WatchParty } from '../hooks/useWatchParty';
import type { RoomParticipant } from '../types';
import { IconCheck, IconClose, IconPlus, IconAlertTriangle } from './Icons';
import { formatDisplayName, getAvatarColor, getInitials } from '../utils/avatar';
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

const readinessLabels: Record<string, string> = {
  ready: 'Pronto para assistir',
  buffering: 'Carregando no dispositivo',
  blocked: 'Aguardando ativação da reprodução',
  error: 'Vídeo indisponível neste navegador',
  unavailable: 'Indisponível',
};

interface ParticipantsContentProps {
  watch: WatchParty;
  participants: RoomParticipant[];
  controllerName: string;
  canInvite: boolean;
  withEnd?: boolean;
}

export function ParticipantsContent({
  watch,
  participants,
  controllerName,
  canInvite,
  withEnd = true,
}: ParticipantsContentProps) {
  const { state } = watch;
  const localParticipant = participants.find((p) => p.isLocal);
  const localName = localParticipant ? formatDisplayName(localParticipant.nickname, false) : 'Você';
  const others = participants.filter((p) => !p.isLocal && p.peerId !== state?.controllerId);

  // Categorize participants into groups:
  // a: Assistindo (ready or playing)
  // b: A caminho (transferring, verifying, queued, waiting, buffering, blocked)
  // c: Indisponíveis (rejected, cancelled, error, unavailable, none)
  const groupA: RoomParticipant[] = [];
  const groupB: RoomParticipant[] = [];
  const groupC: RoomParticipant[] = [];

  others.forEach((p) => {
    const readiness = watch.availability[p.peerId];
    const delivery = [...watch.deliveries].reverse().find((d) => d.peerId === p.peerId);

    if (readiness === 'ready') {
      groupA.push(p);
    } else if (
      readiness === 'buffering' ||
      readiness === 'blocked' ||
      (delivery && ['queued', 'transferring', 'verifying', 'offered', 'waiting'].includes(delivery.state))
    ) {
      groupB.push(p);
    } else {
      groupC.push(p);
    }
  });

  const renderRow = (p: RoomParticipant) => {
    const name = formatDisplayName(p.nickname, false);
    const { bg, text } = getAvatarColor(name);
    const readiness = watch.availability[p.peerId];
    const delivery = [...watch.deliveries].reverse().find((d) => d.peerId === p.peerId);
    const transferring = delivery && ['queued', 'transferring', 'verifying'].includes(delivery.state);
    const percent = delivery && state ? Math.min(100, (100 * delivery.bytes) / state.file.size) : 0;

    let status = 'Ainda sem convite';
    let statusClass = '';

    if (transferring && delivery) {
      status = `${labels[delivery.state]} · ${Math.round(percent)}%`;
    } else if (readiness) {
      if (readiness === 'ready') {
        status = state?.playing ? 'Reproduzindo' : readinessLabels.ready;
        statusClass = styles.ok;
      } else if (readiness === 'buffering' || readiness === 'blocked') {
        status = readinessLabels[readiness];
        statusClass = styles.warn;
      } else {
        status = readinessLabels[readiness] || readiness;
        statusClass = styles.bad;
      }
    } else if (delivery) {
      status = labels[delivery.state] || delivery.state;
      if (delivery.state === 'rejected' || delivery.state === 'error') {
        statusClass = styles.bad;
      }
    }

    return (
      <div className={styles.prow} key={p.peerId}>
        <span className={styles.avatar} style={{ background: bg, color: text }} aria-hidden="true">
          {getInitials(name)}
        </span>
        <div className={styles.pi}>
          <div className={styles.pn}>
            <span className={styles.ellip}>{name}</span>
          </div>
          <div className={`${styles.ps} ${statusClass}`}>{status}</div>
          {transferring && (
            <Progress
              aria-label={`Progresso para ${p.nickname || 'participante'}`}
              value={percent}
              size="xs"
              radius="xl"
              style={{ marginTop: 4 }}
            />
          )}
        </div>
        {readiness === 'ready' && (
          <span className={`${styles.pend} ${styles.ok}`} aria-label="Preparado">
            <IconCheck size={15} />
          </span>
        )}
        {(readiness === 'buffering' || readiness === 'blocked') && (
          <span className={`${styles.pend} ${styles.warn}`}>
            <IconAlertTriangle size={15} />
          </span>
        )}
        {(statusClass === styles.bad || delivery?.state === 'rejected' || delivery?.state === 'error') && (
          <span className={`${styles.pend} ${styles.bad}`}>
            <IconClose size={14} />
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={styles.peopleContent}>
      {/* Linhas próprias / autoridade */}
      <div className={styles.peopleSelf}>
        {watch.controller ? (
          <div className={styles.prow}>
            <span
              className={styles.avatar}
              style={{ background: getAvatarColor(localName).bg, color: getAvatarColor(localName).text }}
              aria-hidden="true"
            >
              {getInitials(localName)}
            </span>
            <div className={styles.pi}>
              <div className={styles.pn}>
                <span className={styles.ellip}>{localName}</span>
                <em>você</em>
              </div>
              <div className={styles.ps}>Controla a reprodução</div>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.prow}>
              <span
                className={styles.avatar}
                style={{ background: getAvatarColor(controllerName).bg, color: getAvatarColor(controllerName).text }}
                aria-hidden="true"
              >
                {getInitials(controllerName)}
              </span>
              <div className={styles.pi}>
                <div className={styles.pn}>
                  <span className={styles.ellip}>{controllerName}</span>
                </div>
                <div className={styles.ps}>Controla a reprodução</div>
              </div>
            </div>
            <div className={styles.prow}>
              <span
                className={styles.avatar}
                style={{ background: getAvatarColor(localName).bg, color: getAvatarColor(localName).text }}
                aria-hidden="true"
              >
                {getInitials(localName)}
              </span>
              <div className={styles.pi}>
                <div className={styles.pn}>
                  <span className={styles.ellip}>{localName}</span>
                  <em>você</em>
                </div>
                <div className={`${styles.ps} ${styles.ok}`}>Assistindo</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Grupo 1: Assistindo */}
      {groupA.length > 0 && (
        <section className={styles.peopleGroup}>
          <h4>
            Assistindo <span>{groupA.length}</span>
          </h4>
          {groupA.map(renderRow)}
        </section>
      )}

      {/* Grupo 2: A caminho */}
      {groupB.length > 0 && (
        <section className={styles.peopleGroup}>
          <h4>
            A caminho <span>{groupB.length}</span>
          </h4>
          {groupB.map(renderRow)}
        </section>
      )}

      {/* Grupo 3: Indisponíveis */}
      {groupC.length > 0 && (
        <section className={styles.peopleGroup}>
          <h4>
            Indisponíveis <span>{groupC.length}</span>
          </h4>
          {groupC.map(renderRow)}
          {watch.controller && canInvite && (
            <Button
              variant="default"
              aria-label="Convidar participantes indisponíveis"
              size="sm"
              className={styles.wide}
              disabled={watch.inviting}
              onClick={() => void watch.invite(true)}
              leftSection={<IconPlus size={15} />}
            >
              Reenviar convites
            </Button>
          )}
        </section>
      )}

      {watch.controller && !others.length && (
        <p className={styles.peopleEmpty}>
          Só você por enquanto. Quem entrar na sala receberá um convite para assistir.
        </p>
      )}

      {/* Botão de encerramento para o controlador */}
      {watch.controller && withEnd && (
        <div className={styles.endZone}>
          <EndWatchParty watch={watch} />
        </div>
      )}
    </div>
  );
}

/** Same inline danger confirmation used by room moderation. */
function EndWatchParty({ watch }: { watch: WatchParty }) {
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) cancel.current?.focus();
    else if (wasConfirming.current) trigger.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  const dismiss = () => setConfirming(false);
  return confirming ? (
    <div onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); dismiss(); } }}>
      <Text size="sm">Encerrar o vídeo para todos?</Text>
      <Text size="sm" c="dimmed" mt={4}>O arquivo será removido desta sessão.</Text>
      <div className={styles.endActions}>
        <Button ref={cancel} data-mantine-stop-propagation="true" variant="default" onClick={dismiss}>Cancelar</Button>
        <Button color="red" data-mantine-stop-propagation="true" className={styles.confirmEnd} disabled={watch.pending} onClick={() => watch.command('end')}>Confirmar encerramento</Button>
      </div>
    </div>
  ) : <Button ref={trigger} className={styles.endButton} variant="subtle" color="red" fullWidth mih={44} disabled={watch.pending} onClick={() => setConfirming(true)}>Encerrar vídeo compartilhado</Button>;
}
