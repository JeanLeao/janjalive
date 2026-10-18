import { observeVideoPresentation } from '../diagnostics/video-presentation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

function applyPlaybackMute(video: HTMLVideoElement, muted: boolean) {
  if (!muted) {
    // Silence the previous source before a primary/secondary swap enables this one.
    video.closest('.stage-main-container')?.querySelectorAll('video').forEach(other => {
      if (other !== video) other.muted = true;
    });
  }
  video.muted = muted;
}

export function useMediaStreamVideo(stream: MediaStream | null, muted = false, onPlayback?: (state: string) => void, onPresented?: () => void, volume = 1) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const desiredMuted = useRef(muted);
  const playbackGeneration = useRef(0);
  desiredMuted.current = muted;

  const enableAudio = async () => {
    const video = videoRef.current;
    if (!video || !video.srcObject || desiredMuted.current) return;
    const source = video.srcObject;
    const generation = ++playbackGeneration.current;
    applyPlaybackMute(video, false);
    try {
      await video.play();
      if (generation === playbackGeneration.current && video.srcObject === source) setAudioBlocked(false);
    } catch {
      if (generation !== playbackGeneration.current || video.srcObject !== source || desiredMuted.current) return;
      video.muted = true;
      setAudioBlocked(true);
    }
  };

  // Preference changes must not replace srcObject, restart video or close PiP.
  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const generation = ++playbackGeneration.current;
    applyPlaybackMute(video, muted);
    if (stream && video.srcObject === stream) void video.play().then(() => {
      if (generation === playbackGeneration.current) setAudioBlocked(false);
    }).catch(() => {
      if (generation !== playbackGeneration.current || desiredMuted.current || video.srcObject !== stream) return;
      video.muted = true;
      setAudioBlocked(stream.getAudioTracks().length > 0);
    });
    return () => {
      playbackGeneration.current++;
      video.muted = true;
    };
  }, [muted, stream]);
  useLayoutEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume, stream]);

  const presentedRef = useRef(onPresented);
  presentedRef.current = onPresented;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const generation = playbackGeneration.current;
    let stopObserving = () => {};
    let disposed = false;
    if (stream) {
      video.srcObject = stream;
      applyPlaybackMute(video, desiredMuted.current);
      const onFirstPresentation = presentedRef.current;
      if (onFirstPresentation) stopObserving = observeVideoPresentation(video, stream, onFirstPresentation);
      setAudioBlocked(false);
      onPlayback?.('Conectando');
      video.onplaying = () => onPlayback?.('Ao vivo');
      video.onwaiting = () => onPlayback?.('Reconectando');
      video.play().catch(async () => {
        if (disposed || generation !== playbackGeneration.current || video.srcObject !== stream) return;
        video.muted = true;
        setAudioBlocked(!desiredMuted.current && stream.getAudioTracks().length > 0);
        try { await video.play(); } catch { if (!disposed) onPlayback?.('Falha na reprodução'); }
      });
    } else {
      video.srcObject = null;
    }
    return () => {
      disposed = true;
      stopObserving();
      video.onplaying = null;
      video.onwaiting = null;
      video.srcObject = null;
    };
  }, [stream]);

  return Object.assign(videoRef, { audioBlocked, enableAudio });
}
