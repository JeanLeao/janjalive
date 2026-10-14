import { useEffect, useRef, useState } from 'react';

export function useMediaStreamVideo(stream: MediaStream | null, muted = false, onPlayback?: (state: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [audioBlocked, setAudioBlocked] = useState(false);
  const enableAudio = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    try { await video.play(); setAudioBlocked(false); }
    catch { video.muted = true; setAudioBlocked(true); }
  };
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      video.muted = muted;
      setAudioBlocked(false);
      onPlayback?.('Conectando');
      video.onplaying = () => onPlayback?.('Ao vivo');
      video.onwaiting = () => onPlayback?.('Reconectando');
      video.play().catch(async () => {
        if (video.srcObject !== stream) return;
        video.muted = true;
        setAudioBlocked(!muted && stream.getAudioTracks().length > 0);
        try { await video.play(); } catch { onPlayback?.('Falha na reprodução'); }
      });
    } else {
      video.srcObject = null;
    }

    return () => {
      if (video) {
        video.onplaying = null;
        video.onwaiting = null;
        video.srcObject = null;
      }
    };
  }, [stream, muted]);

  return Object.assign(videoRef, { audioBlocked, enableAudio });
}
