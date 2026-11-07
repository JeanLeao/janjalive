import { useState } from 'react';
import type { RoomParticipant } from '../types';
import { StageCamera } from './StageCamera';
import './SpectatorCameras.css';

/** Camera-only participants never become screen presenters or change the spotlight. */
export function SpectatorCameras({ streams, participants }: { streams: Record<string, MediaStream>; participants: RoomParticipant[] }) {
  const [expanded, setExpanded] = useState(true);
  const cameras = Object.entries(streams).filter(([id]) => participants.some(p => p.peerId === id && !p.isSharing));
  if (!cameras.length) return null;
  return <section className="spectator-cameras" aria-label="Câmeras dos espectadores">
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {expanded ? 'Ocultar' : 'Mostrar'} câmeras ({cameras.length})
    </button>
    {expanded && <div className="spectator-camera-list">{cameras.map(([id, stream]) => {
      const participant = participants.find(p => p.peerId === id)!;
      const name = `${participant.nickname || 'Visitante'}${participant.isLocal ? ' (você)' : ''}`;
      return <figure key={id}>
        <StageCamera stream={stream} name={name} position="top-right" />
        <figcaption>{name}</figcaption>
      </figure>;
    })}</div>}
  </section>;
}
