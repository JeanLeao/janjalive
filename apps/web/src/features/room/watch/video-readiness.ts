/** Validates decoded media without changing its bytes. Infinity recovery is opt-in. */
export function videoReadiness(video: HTMLVideoElement, signal: AbortSignal, options: {
  recoverWebmDuration?: boolean;
  expectedDuration?: number;
} = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let phase: 'loading' | 'end' | 'probe' | 'return' = 'loading';
    let duration = 0;
    let target = 0;
    const finish = (error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      video.onloadeddata = video.onseeked = video.ondurationchange = video.onerror = null;
      if (error) reject(new Error(error)); else resolve(duration);
    };
    const invalid = () => finish('Não foi possível validar a duração e a busca do vídeo. Salve o clipe ou tente gravar novamente.');
    const abort = () => finish('Preparação cancelada.');
    const timer = setTimeout(() => finish('Não foi possível decodificar o vídeo ou recuperar sua duração. Tente outro clipe.'), 15_000);
    const validDuration = (value: number) => Number.isFinite(value) && value > 0 &&
      (options.expectedDuration === undefined || Math.abs(value - options.expectedDuration) <= 0.5);
    const seek = (position: number, next: typeof phase) => {
      phase = next; target = position;
      try { video.currentTime = position; } catch { invalid(); }
    };
    const loaded = () => {
      if (phase !== 'loading' || settled) return;
      if (!video.videoWidth || !video.videoHeight) { invalid(); return; }
      if (validDuration(video.duration)) { duration = video.duration; finish(); return; }
      if (video.duration !== Infinity || !options.recoverWebmDuration) { invalid(); return; }
      // Force demuxing to the end. Only an actual completed seek can advance this state.
      seek(1e10, 'end');
    };
    video.onloadeddata = loaded;
    video.onseeked = () => {
      if (settled || video.seeking || video.readyState < 2) return;
      if (phase === 'end') {
        if (!validDuration(video.duration) || video.duration > 61 || video.currentTime > video.duration + 0.1) { invalid(); return; }
        duration = video.duration;
        seek(Math.min(1, duration / 2), 'probe');
      } else if (phase === 'probe' || phase === 'return') {
        if (Math.abs(video.currentTime - target) > 0.1 || !video.videoWidth || !video.videoHeight) { invalid(); return; }
        if (phase === 'probe') seek(0, 'return'); else finish();
      }
    };
    video.onerror = () => finish('Codec ou arquivo incompatível. Escolha outro vídeo.');
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else if (video.readyState >= 2) loaded();
  });
}
