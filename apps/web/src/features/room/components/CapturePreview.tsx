import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useMediaStreamVideo } from '../hooks/useMediaStreamVideo';
import { IconVolume, IconVolumeMute } from './Icons';

export function CapturePreview({ stream, pending, onConfirm, onCancel }: {
  stream: MediaStream; pending: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const hasAudio = stream.getAudioTracks().length > 0;
  return (
    <Modal opened onClose={onCancel} title="Pré-visualização" centered size={780} padding="md"
      closeButtonProps={{ 'aria-label': 'Cancelar pré-visualização', size: 40 }}
      styles={{
        content: { background: '#161b22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12 },
        header: { background: '#161b22', paddingTop: 8, paddingBottom: 8 },
        title: { fontSize: 18, fontWeight: 600 },
      }}>
      <Stack gap="md">
        <PreviewVideo stream={stream} />
        <Group justify="space-between" gap="xs" aria-live="polite">
          <Text size="sm" c="#c9d1d9">{pending ? 'Entrando ao vivo…' : 'Não está ao vivo'}</Text>
          <Group gap={6} c="#9da7b3">
            {hasAudio ? <IconVolume size={16} aria-hidden /> : <IconVolumeMute size={16} aria-hidden />}
            <Text size="xs">{hasAudio ? 'Áudio disponível' : 'Sem áudio'}</Text>
          </Group>
        </Group>
        <Group justify="flex-end" gap="sm" wrap="nowrap" pt="sm"
          style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <Button variant="default" h={42} onClick={onCancel}>Cancelar</Button>
          <Button h={42} loading={pending} onClick={onConfirm}>Entrar ao vivo</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// Mount the binding with the portal content, after Modal creates the video element.
function PreviewVideo({ stream }: { stream: MediaStream }) {
  const ref = useMediaStreamVideo(stream, true);
  return <video ref={ref} autoPlay muted playsInline aria-label="Pré-visualização local silenciosa"
    style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', maxHeight: 'max(96px, calc(100dvh - 240px))', objectFit: 'contain', background: '#080a0f', borderRadius: 6 }} />;
}
