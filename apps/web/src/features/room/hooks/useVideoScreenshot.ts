import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  captureVideoFrame,
  downloadBlob,
  formatScreenshotFilename,
  isScreenshotAvailable,
} from '../utils/screenshot';

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

  // Check and update capture availability
  const checkAvailability = () => {
    const video = videoRef.current;
    const available =
      isConnectionValid && isScreenshotAvailable(video, stream, isPaused);
    setCanCapture(available);
  };

  useEffect(() => {
    disposedRef.current = false;
    const video = videoRef.current;

    checkAvailability();

    if (!video) return;

    const events = [
      'loadedmetadata',
      'resize',
      'playing',
      'pause',
      'waiting',
      'emptied',
    ];
    const handleVideoEvent = () => {
      if (!disposedRef.current) {
        checkAvailability();
      }
    };

    events.forEach((ev) => video.addEventListener(ev, handleVideoEvent));

    return () => {
      events.forEach((ev) => video.removeEventListener(ev, handleVideoEvent));
    };
  }, [videoRef, stream, isPaused, isConnectionValid, streamId]);

  useEffect(() => {
    return () => {
      disposedRef.current = true;
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const captureScreenshot = async (): Promise<boolean> => {
    const video = videoRef.current;
    if (
      !video ||
      !isConnectionValid ||
      !isScreenshotAvailable(video, stream, isPaused)
    ) {
      setFeedback('error');
      setFeedbackMessage('Captura de imagem indisponível no momento');
      return false;
    }

    setIsCapturing(true);
    const currentStream = stream;
    const currentStreamId = streamId;
    const generation = ++generationRef.current;

    try {
      const blob = await captureVideoFrame(video);

      // Verify state hasn't changed or become obsolete during async encoding
      if (
        disposedRef.current ||
        generation !== generationRef.current ||
        stream !== currentStream ||
        streamId !== currentStreamId ||
        isPaused
      ) {
        return false;
      }

      const filename = formatScreenshotFilename();
      downloadBlob(blob, filename);

      if (!disposedRef.current) {
        setFeedback('success');
        setFeedbackMessage('Download da imagem iniciado');
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => {
          if (!disposedRef.current) {
            setFeedback('idle');
            setFeedbackMessage(null);
          }
        }, 2000);
      }
      return true;
    } catch (err) {
      if (!disposedRef.current) {
        console.error('Screenshot capture failed:', err);
        setFeedback('error');
        setFeedbackMessage('Falha ao salvar imagem');
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => {
          if (!disposedRef.current) {
            setFeedback('idle');
            setFeedbackMessage(null);
          }
        }, 3000);
      }
      return false;
    } finally {
      if (!disposedRef.current) {
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
