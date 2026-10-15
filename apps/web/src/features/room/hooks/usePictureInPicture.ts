import { useEffect, useRef, useState, type RefObject } from 'react';

type PresentationVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

const pendingDocuments = new WeakSet<Document>();

// This hook owns only presentation, never the MediaStream or its tracks.
export function usePictureInPicture(ref: RefObject<HTMLVideoElement | null>, stream: MediaStream) {
  const [active, setActive] = useState(false);
  const [available, setAvailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const toggleRef = useRef<() => void>(() => {});

  useEffect(() => {
    const video = ref.current as PresentationVideo | null;
    if (!video) return;
    let disposed = false;
    let busy = false;
    const standard = () => document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function';
    const supported = () => standard() || !!(video.webkitSupportsPresentationMode?.('picture-in-picture') && video.webkitSetPresentationMode);
    const isActive = () => document.pictureInPictureElement === video || video.webkitPresentationMode === 'picture-in-picture';
    const hasVideo = () => stream.getVideoTracks().some(track => track.readyState === 'live');
    const exit = async () => {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else if (video.webkitPresentationMode === 'picture-in-picture') video.webkitSetPresentationMode?.('inline');
    };
    const sync = () => {
      if (disposed) return;
      setActive(isActive());
      setAvailable(!!supported() && video.readyState >= 1 && hasVideo());
    };
    const ended = () => {
      sync();
      if (!hasVideo()) void exit().catch(() => {});
    };
    const tracks = new Set<MediaStreamTrack>();
    const watchTracks = () => {
      for (const track of stream.getVideoTracks()) {
        if (!tracks.has(track)) {
          tracks.add(track);
          track.addEventListener('ended', ended);
        }
      }
      sync();
    };
    watchTracks();
    stream.addEventListener('removetrack', ended);
    stream.addEventListener('addtrack', watchTracks);
    const events = ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged', 'loadedmetadata', 'emptied'] as const;
    for (const event of events) video.addEventListener(event, sync);
    setError('');
    setPending(false);
    sync();
    toggleRef.current = async () => {
      if (busy || disposed) return;
      if (pendingDocuments.has(document)) {
        setError('Aguarde a abertura ou o fechamento da janela flutuante.');
        return;
      }
      pendingDocuments.add(document);
      busy = true;
      setPending(true);
      setError('');
      try {
        if (isActive()) await exit();
        else if (hasVideo() && supported() && video.readyState >= 1) {
          if (standard()) await video.requestPictureInPicture();
          else video.webkitSetPresentationMode?.('picture-in-picture');
          // A request may finish after navigation, replacement or track termination.
          if (disposed || !hasVideo()) await exit();
        }
      } catch {
        if (!disposed) setError('Não foi possível abrir ou fechar a janela flutuante. Tente novamente.');
      } finally {
        pendingDocuments.delete(document);
        busy = false;
        if (!disposed) {
          setPending(false);
          sync();
        }
      }
    };
    return () => {
      disposed = true;
      toggleRef.current = () => {};
      for (const event of events) video.removeEventListener(event, sync);
      for (const track of tracks) track.removeEventListener('ended', ended);
      stream.removeEventListener('removetrack', ended);
      stream.removeEventListener('addtrack', watchTracks);
      void exit().catch(() => {});
    };
  }, [ref, stream]);

  return { active, available, pending, error, toggle: () => toggleRef.current() };
}
