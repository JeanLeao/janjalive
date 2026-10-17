import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  captureVideoFrame,
  downloadBlob,
  formatScreenshotFilename,
  isScreenshotAvailable,
} from '../utils/screenshot.ts';

export interface UseVideoScreenshotOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  streamId?: string | null;
  isPaused?: boolean;
  connectionState?: RTCPeerConnectionState;
  isLocal?: boolean;
}

export type ScreenshotFeedback = 'idle' | 'success' | 'error';

export function useVideoScreenshot({
  videoRef,
  stream,
  streamId,
  isPaused = false,
  connectionState,
  isLocal = false,
}: UseVideoScreenshotOptions) {
  const [canCapture, setCanCapture] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [feedback, setFeedback] = useState<ScreenshotFeedback>('idle');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const disposedRef = useRef(false);

  // Connection is considered ready for capture if local or when peer connection is connected (or not tracked)
  const isConnectionValid =
    isLocal || connectionState === undefined || connectionState === 'connected';

  // Keep latest live state in a ref so async resume after await never reads stale render closures
  const latestStateRef = useRef({
    stream,
    streamId,
    isPaused,
    isConnectionValid,
  });
  latestStateRef.current = {
    stream,
    streamId,
    isPaused,
    isConnectionValid,
  };

  const clearFeedbackTimer = () => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  };

  // Check and update capture availability against current live state
  const checkAvailability = () => {
    const video = videoRef.current;
    const current = latestStateRef.current;
    const available =
      current.isConnectionValid &&
      isScreenshotAvailable(video, current.stream, current.isPaused);
    setCanCapture(available);
  };

  useEffect(() => {
    disposedRef.current = false;
    // Invalidate any in-flight screenshot and reset feedback/loading when transmission state or source changes
    generationRef.current += 1;
    clearFeedbackTimer();
    setIsCapturing(false);
    setFeedback('idle');
    setFeedbackMessage(null);

    const video = videoRef.current;
    checkAvailability();

    const events = [
      'loadedmetadata',
      'resize',
      'playing',
      'pause',
      'waiting',
      'emptied',
    ];
    const handleStateChange = () => {
      if (disposedRef.current) return;
      const current = latestStateRef.current;
      const available =
        current.isConnectionValid &&
        isScreenshotAvailable(videoRef.current, current.stream, current.isPaused);
      setCanCapture(available);
      if (!available) {
        generationRef.current += 1;
        setIsCapturing(false);
      }
    };

    if (video) {
      events.forEach((ev) => video.addEventListener(ev, handleStateChange));
    }

    const watchedTracks = new Set<MediaStreamTrack>();
    const syncTracks = () => {
      if (stream) {
        for (const track of stream.getVideoTracks()) {
          if (!watchedTracks.has(track) && typeof track.addEventListener === 'function') {
            watchedTracks.add(track);
            track.addEventListener('ended', handleStateChange);
          }
        }
      }
      handleStateChange();
    };

    if (stream) {
      for (const track of stream.getVideoTracks()) {
        if (typeof track.addEventListener === 'function') {
          watchedTracks.add(track);
          track.addEventListener('ended', handleStateChange);
        }
      }
      if (typeof stream.addEventListener === 'function') {
        stream.addEventListener('addtrack', syncTracks);
        stream.addEventListener('removetrack', handleStateChange);
      }
    }

    return () => {
      generationRef.current += 1;
      if (video) {
        events.forEach((ev) => video.removeEventListener(ev, handleStateChange));
      }
      for (const track of watchedTracks) {
        if (typeof track.removeEventListener === 'function') {
          track.removeEventListener('ended', handleStateChange);
        }
      }
      if (stream && typeof stream.removeEventListener === 'function') {
        stream.removeEventListener('addtrack', syncTracks);
        stream.removeEventListener('removetrack', handleStateChange);
      }
    };
  }, [videoRef, stream, isPaused, isConnectionValid, streamId]);

  useEffect(() => {
    return () => {
      disposedRef.current = true;
      generationRef.current += 1;
      clearFeedbackTimer();
    };
  }, []);

  const captureScreenshot = async (): Promise<boolean> => {
    const video = videoRef.current;
    const initial = latestStateRef.current;
    if (
      !video ||
      !initial.isConnectionValid ||
      !isScreenshotAvailable(video, initial.stream, initial.isPaused)
    ) {
      clearFeedbackTimer();
      setFeedback('error');
      setFeedbackMessage('Captura de imagem indisponível no momento');
      feedbackTimerRef.current = setTimeout(() => {
        if (!disposedRef.current) {
          setFeedback('idle');
          setFeedbackMessage(null);
        }
      }, 3000);
      return false;
    }

    clearFeedbackTimer();
    setFeedback('idle');
    setFeedbackMessage(null);
    setIsCapturing(true);

    const capturedVideo = video;
    const capturedStream = initial.stream;
    const capturedStreamId = initial.streamId;
    const generation = ++generationRef.current;

    const isStillValid = () => {
      const current = latestStateRef.current;
      return (
        !disposedRef.current &&
        generation === generationRef.current &&
        videoRef.current === capturedVideo &&
        current.stream === capturedStream &&
        current.streamId === capturedStreamId &&
        !current.isPaused &&
        current.isConnectionValid &&
        isScreenshotAvailable(capturedVideo, current.stream, current.isPaused)
      );
    };

    try {
      const blob = await captureVideoFrame(capturedVideo);

      // Verify live state hasn't changed or become obsolete during async encoding
      if (!isStillValid()) {
        return false;
      }

      const filename = formatScreenshotFilename();
      downloadBlob(blob, filename);

      if (generation === generationRef.current && !disposedRef.current) {
        setFeedback('success');
        setFeedbackMessage('Download da imagem iniciado');
        clearFeedbackTimer();
        feedbackTimerRef.current = setTimeout(() => {
          if (!disposedRef.current && generation === generationRef.current) {
            setFeedback('idle');
            setFeedbackMessage(null);
          }
        }, 2000);
      }
      return true;
    } catch (err) {
      // Suppress error feedback if the operation was already invalidated
      if (isStillValid()) {
        console.error('Screenshot capture failed:', err);
        setFeedback('error');
        setFeedbackMessage('Falha ao salvar imagem');
        clearFeedbackTimer();
        feedbackTimerRef.current = setTimeout(() => {
          if (!disposedRef.current && generation === generationRef.current) {
            setFeedback('idle');
            setFeedbackMessage(null);
          }
        }, 3000);
      }
      return false;
    } finally {
      if (!disposedRef.current && generation === generationRef.current) {
        setIsCapturing(false);
      }
    }
  };

  return {
    canCapture,
    isCapturing,
    feedback,
    feedbackMessage,
    captureScreenshot,
  };
}
