import { Loader, Tooltip, UnstyledButton } from '@mantine/core';
import type { CameraSnapshot } from '../media/camera-controller';

export interface CameraControlProps {
  permission?: 'none' | 'pending' | 'approved';
  canRequestPermission?: boolean;
  onRequestPermission?: () => void;
  onCancelPermission?: () => void;
  camera: CameraSnapshot;
  canActivate: boolean;
  onRequest: () => void;
  onPublish?: () => void;
  onStop: () => void;
}

export function CameraControl({ permission, canRequestPermission, onRequestPermission, onCancelPermission, camera, canActivate, onRequest, onStop }: CameraControlProps) {
  const waiting = permission === 'pending';
  const needsPermission = waiting || permission === 'none';
  const isPending = camera.state === 'requesting' || camera.state === 'publishing';
  const label = waiting ? 'Cancelar solicitação de câmera' : permission === 'none' ? 'Solicitar câmera ao líder' : camera.state === 'live' ? 'Desligar câmera — câmera ao vivo'
    : camera.state === 'requesting' ? 'Solicitando permissão da câmera'
    : camera.state === 'publishing' ? 'Publicando câmera'
    : camera.state === 'error' ? 'Câmera indisponível — tentar novamente' : 'Ativar câmera';
  return (
    <>
      <Tooltip label={label} events={{ hover: true, focus: true, touch: false }} withArrow>
        <UnstyledButton className="floating-dock-btn" aria-label={label} aria-pressed={camera.state === 'live'}
          disabled={needsPermission ? (!waiting && !canRequestPermission) : !canActivate && ['off', 'error', 'suspended'].includes(camera.state)}
          onClick={() => {
            if (waiting) { onCancelPermission?.(); return; }
            if (needsPermission) { onRequestPermission?.(); return; }
            if (camera.state === 'live' || camera.state === 'requesting' || camera.state === 'publishing') {
              onStop();
            } else {
              onRequest();
            }
          }}
          style={{ display: 'grid', placeItems: 'center', position: 'relative', borderRadius: '50%', background: '#21262d',
            color: camera.state === 'live' ? '#7ee787' : '#e6edf3', border: '1px solid rgba(255,255,255,0.1)' }}>
          {isPending ? (
            <Loader size={18} color="#7ee787" aria-hidden />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="2" y="6" width="13" height="12" rx="2" /><path d="m15 10 7-4v12l-7-4" />{camera.state === 'off' && <path d="m2 2 20 20" />}</svg>
          )}
        </UnstyledButton>
      </Tooltip>
      <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
        {waiting ? 'Aguardando autorização do líder para a câmera.' : camera.state === 'live' ? 'Câmera ao vivo, inclusive durante a troca de tela.' : camera.state === 'off' ? 'Câmera desligada.' : camera.state === 'requesting' ? 'Solicitando permissão da câmera.' : camera.error}
      </span>
    </>
  );
}
