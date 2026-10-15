import { useState } from 'react';
import { resolveQuality, type QualitySelection } from '@screen-room/protocol';
import { QualityControls } from './QualityControls';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useMediaStreamVideo } from '../hooks/useMediaStreamVideo';
import classes from './CapturePreview.module.css';
import { IconChevronDown, IconVolume, IconVolumeMute } from './Icons';

export function CapturePreview({ stream, pending, replacing = false, onConfirm, onCancel, quality, onChangeQuality, qualityPending = false, qualityNotice }: {
  quality: QualitySelection; onChangeQuality?: (quality: QualitySelection) => void; qualityPending?: boolean; qualityNotice?: string | null;
  replacing?: boolean; stream: MediaStream; pending: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const [showControls, setShowControls] = useState(false);
  const settings = stream.getVideoTracks()[0]?.getSettings?.();
  const profile = resolveQuality(quality);
  const hasAudio = stream.getAudioTracks().length > 0;
  const priorityLabel = quality.priority === 'sharpness' ? 'Nitidez' : 'Fluidez';

  return (
    <Modal opened onClose={onCancel} title={replacing ? "Trocar tela" : "Pré-visualização"} yOffset="max(4dvh, 20px)" size={780} padding="md"
      closeButtonProps={{ 'aria-label': replacing && pending ? 'Parar compartilhamento' : 'Cancelar pré-visualização', size: 40 }}
      classNames={{ content: classes.content, body: classes.body }}
      styles={{
        header: { background: '#161b22', paddingTop: 8, paddingBottom: 8, flexShrink: 0 },
        title: { fontSize: 18, fontWeight: 600 },
      }}>
      <div className={classes.scrollArea}>
        <PreviewVideo stream={stream} />
        <Group className={classes.metadata} justify="space-between" gap="xs" aria-live="polite">
          <Text size="xs" c="#c9d1d9">{pending ? 'Entrando ao vivo…' : replacing ? 'Nova origem — não está ao vivo' : 'Não está ao vivo'}</Text>
          <Group gap={6} c="#9da7b3">
            {hasAudio ? <IconVolume size={16} aria-hidden /> : <IconVolumeMute size={16} aria-hidden />}
            <Text size="xs">{hasAudio ? 'Áudio disponível' : 'Sem áudio'}</Text>
          </Group>
        </Group>

        <div className={classes.qualityCard}>
          <div className={classes.summaryRow}>
            <div className={classes.summaryText}>
              <Text size="sm" fw={600} c="#e6edf3">
                {priorityLabel} · {profile.label} · {quality.fps} FPS
              </Text>
              <Text size="xs" c="#8b949e">
                {profile.height}p · {profile.maxBitrate / 1_000_000} Mbps
              </Text>
            </div>
            {!replacing && onChangeQuality && (
              <Button
                variant="subtle"
                size="xs"
                h={36}
                px={12}
                disabled={pending}
                onClick={() => setShowControls((prev) => !prev)}
                aria-expanded={showControls}
                className={classes.toggleQualityBtn}
              >
                {showControls ? 'Ocultar qualidade' : 'Alterar qualidade'}
              </Button>
            )}
          </div>

          {showControls && !replacing && (
            <div className={classes.controlsWrapper}>
              <QualityControls
                compact
                quality={quality}
                onChange={onChangeQuality}
                disabled={pending}
              />
            </div>
          )}
        </div>

        <details className={classes.details}>
          <summary>
            <span>Detalhes da captura</span>
            <IconChevronDown size={14} aria-hidden />
          </summary>
          <Stack gap={4} mt={6}>
            <Text size="xs">{priorityLabel} · {profile.label} · {quality.fps} FPS</Text>
            <Text size="xs">Resolução desejada: {profile.width} × {profile.height}</Text>
            <Text size="xs">{settings?.width && settings?.height ? `Captura observada: ${settings.width} × ${settings.height}` : 'Resolução da captura indisponível.'}</Text>
            <Text size="xs">A captura observada não indica a resolução enviada ou recebida. A fonte, o navegador e a rede podem limitar a qualidade.</Text>
          </Stack>
        </details>

        <div role="status" aria-live="polite" aria-atomic="true" className={classes.statusArea}>
          {qualityPending && <Text size="xs" c="#c9d1d9">Aplicando qualidade…</Text>}
          {!qualityPending && qualityNotice && <Text size="xs" c="#e3b341">{qualityNotice}</Text>}
        </div>
        {replacing && <Text size="sm" c="#c9d1d9" mt="xs">{pending ? 'Publicando a nova origem. Você pode parar o compartilhamento.' : 'A transmissão está suspensa. Confirme para transmitir a nova origem ou cancele para voltar à anterior.'}</Text>}
      </div>
      <Group className={classes.footer} justify="flex-end" gap="sm" wrap="nowrap">
        <Button variant="default" h={44} onClick={onCancel}>{replacing && pending ? 'Parar' : 'Cancelar'}</Button>
        <Button h={44} disabled={qualityPending} loading={pending} onClick={onConfirm}>{replacing ? 'Confirmar troca' : 'Entrar ao vivo'}</Button>
      </Group>
    </Modal>
  );
}

// Mount the binding with the portal content, after Modal creates the video element.
function PreviewVideo({ stream }: { stream: MediaStream }) {
  const ref = useMediaStreamVideo(stream, true);
  return <video ref={ref} autoPlay muted playsInline aria-label="Pré-visualização local silenciosa"
    className={classes.video} />;
}
