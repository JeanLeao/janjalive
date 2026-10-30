import { useState } from 'react';
import { useMediaStreamVideo } from '../hooks/useMediaStreamVideo';
import { Button, Modal, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import type { CameraSnapshot } from '../media/camera-controller';

export interface CameraControlProps {
  camera: CameraSnapshot;
  canActivate: boolean;
  onRequest: () => void;
  onPublish: () => void;
  onStop: () => void;
}

export function CameraControl({ camera, canActivate, onRequest, onPublish, onStop }: CameraControlProps) {
  const [details, setDetails] = useState(false);
  const preview = camera.state === 'preview' || camera.state === 'publishing';
  const opened = preview || details;
  const label = camera.state === 'live' ? 'Desligar câmera — câmera ao vivo'
    : camera.state === 'requesting' ? 'Cancelar permissão da câmera'
    : camera.state === 'publishing' ? 'Publicando câmera'
    : camera.state === 'preview' ? 'Prévia local da câmera'
    : camera.state === 'error' ? 'Câmera indisponível — tentar novamente' : 'Ativar câmera';
  return <>
    <Tooltip label={label} events={{ hover: true, focus: true, touch: false }} withArrow>
      <UnstyledButton className="floating-dock-btn" aria-label={label} aria-pressed={camera.state === 'live'}
        disabled={!canActivate && ['off', 'error', 'suspended'].includes(camera.state)}
        onClick={() => {
          if (camera.state === 'live' || camera.state === 'requesting') onStop();
          else if (preview) setDetails(true);
          else { setDetails(true); onRequest(); }
        }}
        style={{ display: 'grid', placeItems: 'center', position: 'relative', borderRadius: '50%', background: '#21262d',
          color: camera.state === 'live' ? '#7ee787' : '#e6edf3', border: '1px solid rgba(255,255,255,0.1)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="2" y="6" width="13" height="12" rx="2" /><path d="m15 10 7-4v12l-7-4" />{camera.state === 'off' && <path d="m2 2 20 20" />}</svg>
      </UnstyledButton>
    </Tooltip>
    <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
      {camera.state === 'live' ? 'Câmera ao vivo, inclusive durante a troca de tela.' : camera.state === 'off' ? 'Câmera desligada.' : camera.state === 'requesting' ? 'Solicitando permissão da câmera.' : camera.error}
    </span>
    <Modal opened={opened && camera.state !== 'live' && camera.state !== 'off' && camera.state !== 'suspended'}
      onClose={() => { setDetails(false); onStop(); }} title="Câmera do apresentador" closeButtonProps={{ 'aria-label': 'Fechar prévia e desligar câmera', size: 44 }} centered>
      <Stack>
        {preview && <CameraPreview stream={camera.stream!} />}
        <Text size="sm" role="status">{camera.error || (camera.state === 'requesting' ? 'Solicitando permissão… Você pode cancelar mesmo com o seletor do navegador aberto.'
          : camera.state === 'publishing' ? 'Publicando câmera…' : 'Prévia somente neste dispositivo. Ao confirmar, o vídeo será enviado aos participantes, sem microfone. O envio não confirma a recepção por todos os participantes.')}</Text>
        {camera.state === 'preview' && <Button h={44} onClick={onPublish}>Transmitir câmera</Button>}
        {camera.state === 'error' && <Button h={44} disabled={!canActivate} onClick={onRequest}>Tentar novamente</Button>}
        <Button data-autofocus h={44} variant="default" onClick={() => { setDetails(false); onStop(); }}>Cancelar câmera</Button>
      </Stack>
    </Modal>
  </>;
}

function CameraPreview({ stream }: { stream: MediaStream }) {
  const ref = useMediaStreamVideo(stream, true);
  return <video ref={ref} autoPlay muted playsInline aria-label="Prévia local da câmera"
    style={{ width: '100%', maxHeight: '40vh', background: '#0d1117', borderRadius: 8 }} />;
}
