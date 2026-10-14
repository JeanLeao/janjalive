import { useEffect, useRef } from 'react';

export function useMediaStreamVideo(stream: MediaStream | null, muted = false) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      video.muted = muted;
      video.play().catch(() => {
        // Autoplay may be deferred or blocked by browser policy until interaction
      });
    } else {
      video.srcObject = null;
    }

    return () => {
      if (video) {
        video.srcObject = null;
      }
    };
  }, [stream, muted]);

  return videoRef;
}
