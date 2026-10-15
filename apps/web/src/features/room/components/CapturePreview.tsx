import type { QualitySelection } from '@screen-room/protocol';
import { QualityControls } from './QualityControls';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useMediaStreamVideo } from '../hooks/useMediaStreamVideo';
import { IconVolume, IconVolumeMute } from './Icons';

export function CapturePreview({ stream, pending, replacing = false, onConfirm, onCancel, quality, onChangeQuality, qualityPending = false, qualityNotice }: {
  quality: QualitySelection; onChangeQuality?: (quality: QualitySelection) => void; qualityPending?: boolean; qualityNotice?: string | null;
  replacing?: boolean; stream: MediaStream; pending: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const settings = stream.getVideoTracks()[0]?.getSettings?.();
  const hasAudio = stream.getAudioTracks().length > 0;
  return (
    <Modal opened onClose={onCancel} title={replacing ? "Trocar tela" : "Pré-visualização"} centered size={780} padding="md"
      closeButtonProps={{ 'aria-label': replacing && pending ? 'Parar compartilhamento' : 'Cancelar pré-visualização', size: 40 }}
      styles={{
        content: { background: '#161b22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, display: 'flex', flexDirection: 'column' },
        header: { background: '#161b22', paddingTop: 8, paddingBottom: 8, flexShrink: 0 },
        body: { display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' },
        title: { fontSize: 18, fontWeight: 600 },
      }}>
      <Stack gap="md" style={{ minHeight: 0 }}>
        <Stack gap="md" style={{ minHeight: 0, overflowY: 'auto' }}>
          <PreviewVideo stream={stream} replacing={replacing} />
          <QualityControls compact quality={quality} onChange={replacing ? undefined : onChangeQuality} disabled={pending} />
          <div role="status" aria-live="polite" aria-atomic="true">
            <Text size="xs" c="#c9d1d9">{qualityPending ? 'Aplicando qualidade…' : settings?.width && settings?.height
              ? `Captura observada: ${settings.width} × ${settings.height}` : 'Resolução da captura indisponível.'}</Text>
            <Text size="xs" c="#9da7b3">A captura observada não indica a resolução enviada ou recebida.</Text>
            {!qualityPending && qualityNotice && <Text size="xs" c="#e3b341">{qualityNotice}</Text>}
          </div>
          {replacing && <Text size="sm" c="#c9d1d9">{pending ? 'Publicando a nova origem. Você pode parar o compartilhamento.' : 'A transmissão está suspensa. Confirme para transmitir a nova origem ou cancele para voltar à anterior.'}</Text>}
          <Group justify="space-between" gap="xs" aria-live="polite">
            <Text size="sm" c="#c9d1d9">{pending ? 'Entrando ao vivo…' : replacing ? 'Nova origem — não está ao vivo' : 'Não está ao vivo'}</Text>
            <Group gap={6} c="#9da7b3">
              {hasAudio ? <IconVolume size={16} aria-hidden /> : <IconVolumeMute size={16} aria-hidden />}
              <Text size="xs">{hasAudio ? 'Áudio disponível' : 'Sem áudio'}</Text>
            </Group>
          </Group>
        </Stack>
        <Group justify="flex-end" gap="sm" wrap="nowrap" pt="sm"
          style={{ borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, background: '#161b22' }}>
          <Button variant="default" h={44} onClick={onCancel}>{replacing && pending ? 'Parar' : 'Cancelar'}</Button>
          <Button h={44} disabled={qualityPending} loading={pending} onClick={onConfirm}>{replacing ? 'Confirmar troca' : 'Entrar ao vivo'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// Mount the binding with the portal content, after Modal creates the video element.
function PreviewVideo({ stream, replacing }: { stream: MediaStream; replacing: boolean }) {
  const ref = useMediaStreamVideo(stream, true);
  return <video ref={ref} autoPlay muted playsInline aria-label="Pré-visualização local silenciosa"
    style={{ display: 'block', flexShrink: 0, width: '100%', aspectRatio: '16 / 9', maxHeight: replacing ? 'max(64px, calc(100dvh - 300px))' : 'max(96px, calc(100dvh - 540px))', objectFit: 'contain', background: '#080a0f', borderRadius: 6 }} />;
}
