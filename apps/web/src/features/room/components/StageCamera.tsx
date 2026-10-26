import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Popover, Text } from '@mantine/core';
import './StageCamera.css';

export interface CameraView {
  mode: 'overlay' | 'separate' | 'hidden';
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/** Playback only: never owns capture, senders, screen transforms or audio routing. */
export function StageCamera({ stream, name, position }: { stream: MediaStream; name: string; position: CameraView['position'] }) {
  const video = useRef<HTMLVideoElement>(null);
  const [available, setAvailable] = useState(false);
  useLayoutEffect(() => {
    const element = video.current!;
    const tracks = new Set<MediaStreamTrack>();
    const sync = () => {
      for (const track of stream.getVideoTracks()) {
        if (!tracks.has(track)) {
          tracks.add(track);
          track.addEventListener('ended', sync);
          track.addEventListener('mute', sync);
          track.addEventListener('unmute', sync);
        }
      }
      setAvailable(stream.getVideoTracks().some(track => track.readyState === 'live' && !track.muted));
    };
    element.muted = true;
    element.srcObject = stream;
    let current = true;
    const failed = () => { if (current) setAvailable(false); };
    element.addEventListener('error', failed);
    sync();
    void element.play().catch(failed);
    stream.addEventListener('addtrack', sync);
    stream.addEventListener('removetrack', sync);
    return () => {
      current = false;
      element.removeEventListener('error', failed);
      element.srcObject = null;
      stream.removeEventListener('addtrack', sync);
      stream.removeEventListener('removetrack', sync);
      for (const track of tracks) {
        track.removeEventListener('ended', sync);
        track.removeEventListener('mute', sync);
        track.removeEventListener('unmute', sync);
      }
    };
  }, [stream]);
  return <video ref={video} className="stage-camera-video" data-position={position} data-testid="stage-camera"
    aria-label={`Câmera de ${name}`} hidden={!available} autoPlay playsInline muted disablePictureInPicture />;
}

export function StageCameraControls({ view, onChange, target }: {
  view: CameraView; onChange: (view: CameraView) => void; target?: HTMLElement;
}) {
  return <Popover position="left-start" width={240} trapFocus returnFocus portalProps={{ target }}>
    <Popover.Target><Button variant="subtle" color="gray" aria-label="Visualização da câmera" title="Visualização da câmera" data-control-id="camera-view">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>
    </Button></Popover.Target>
    <Popover.Dropdown className="stage-camera-menu">
      <Text size="sm" fw={600}>Câmera no seu palco</Text>
      <label>Visualização<select aria-label="Modo da câmera" value={view.mode} onChange={event => onChange({ ...view, mode: event.target.value as CameraView['mode'] })}>
        <option value="overlay">Sobreposta</option><option value="separate">Separada</option><option value="hidden">Oculta</option>
      </select></label>
      {view.mode === 'overlay' && <label>Posição<select aria-label="Posição da câmera" value={view.position} onChange={event => onChange({ ...view, position: event.target.value as CameraView['position'] })}>
        <option value="top-left">Superior esquerdo</option><option value="top-right">Superior direito</option>
        <option value="bottom-left">Inferior esquerdo</option><option value="bottom-right">Inferior direito</option>
      </select></label>}
      <Text size="xs" c="dimmed" mt="xs">Só muda sua visualização nesta sessão. Ocultar não desliga a transmissão da câmera.</Text>
    </Popover.Dropdown>
  </Popover>;
}
