import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useMediaStreamVideo } from '../hooks/useMediaStreamVideo';

export function CapturePreview({ stream, pending, onConfirm, onCancel }: {
  stream: MediaStream; pending: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal opened onClose={onCancel} title={pending ? 'Entrando ao vivo…' : 'Prévia local — ainda não está ao vivo'} centered>
      <Stack>
        <PreviewVideo stream={stream} />
        <Text size="sm">{stream.getAudioTracks().length ? 'Captura com áudio. A prévia é silenciosa.' : 'Captura sem áudio.'}</Text>
        <Text size="sm">{pending ? 'Publicando a captura para os participantes…' : 'Somente você vê esta prévia. Confirme para transmitir aos participantes.'}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>Cancelar prévia</Button>
          <Button loading={pending} onClick={onConfirm}>Entrar ao vivo</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// Mount the binding with the portal content, after Modal creates the video element.
function PreviewVideo({ stream }: { stream: MediaStream }) {
  const ref = useMediaStreamVideo(stream, true);
  return <video ref={ref} autoPlay muted playsInline style={{ width: '100%', maxHeight: '45dvh', background: '#000' }} />;
}
