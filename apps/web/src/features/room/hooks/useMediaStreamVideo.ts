import { useAudioOutput } from './AudioOutput';
import { observeVideoPresentation } from '../diagnostics/video-presentation';
import { useLayoutEffect, useRef, useState } from 'react';

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
  const output = useAudioOutput();
  const routing = useRef(output);
  routing.current = output;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const desiredMuted = useRef(muted);
  const playbackGeneration = useRef(0);
  const presentedRef = useRef(onPresented);
  const playbackRef = useRef(onPlayback);
  desiredMuted.current = muted;
  presentedRef.current = onPresented;
  playbackRef.current = onPlayback;

  const play = async (video: HTMLVideoElement, source: MediaStream) => {
    const generation = ++playbackGeneration.current;
    const current = () => generation === playbackGeneration.current &&
      videoRef.current === video && video.srcObject === source;
    applyPlaybackMute(video, desiredMuted.current || (routing.current !== null && !routing.current.router.allowed(video)));
    try {
      await video.play();
      if (current()) setAudioBlocked(false);
    } catch {
      if (!current()) return;
      video.muted = true;
      setAudioBlocked(!desiredMuted.current && source.getAudioTracks().some(track => track.readyState === 'live'));
      // A denied audible play must not freeze the shared video.
      try { await video.play(); }
      catch { if (current()) playbackRef.current?.('Falha na reprodução'); }
    }
  };

  const enableAudio = async () => {
    const video = videoRef.current;
    if (!video || !stream || video.srcObject !== stream || desiredMuted.current ||
      !stream.getAudioTracks().some(track => track.readyState === 'live')) return;
    await play(video, stream);
  };

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video || !output) return;
    return output.router.register(video, () => {
      if (videoRef.current !== video || video.srcObject !== stream || !stream) return;
      // play() on this same element does not restart media; it preserves autoplay rejection handling.
      void play(video, stream);
    });
  }, [output?.router, stream]);

  // Only source changes own the attachment and presentation observer, preserving PiP.
  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    const stopObserving = stream && presentedRef.current
      ? observeVideoPresentation(video, stream, presentedRef.current) : () => {};
    playbackRef.current?.(stream ? 'Conectando' : '');
    video.onplaying = () => playbackRef.current?.('Ao vivo');
    video.onwaiting = () => playbackRef.current?.('Reconectando');
    return () => {
      playbackGeneration.current++;
      video.muted = true;
      stopObserving();
      video.onplaying = null;
      video.onwaiting = null;
      video.srcObject = null;
    };
  }, [stream]);

  // Apply a remembered volume before enabling sound on a new video element.
  useLayoutEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume, stream]);

  useLayoutEffect(() => {
    const video = videoRef.current;
    setAudioBlocked(false);
    if (!video) return;
    if (stream) void play(video, stream);
    else applyPlaybackMute(video, muted);
    return () => {
      playbackGeneration.current++;
      video.muted = true;
    };
  }, [muted, stream]);

  return Object.assign(videoRef, { audioBlocked: Boolean(stream && !muted && audioBlocked), enableAudio });
}
