/** One observation per remote video binding; playing/decoded counters are not presentation evidence. */
export function observeVideoPresentation(video: HTMLVideoElement, stream: MediaStream, onPresented: () => void): () => void {
  let active = true;
  let handle: number | undefined;
  if (typeof video.requestVideoFrameCallback === 'function') {
    handle = video.requestVideoFrameCallback(() => {
      if (active && video.srcObject === stream && !video.paused) onPresented();
    });
  }
  return () => {
    active = false;
    if (handle !== undefined && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(handle);
  };
}
