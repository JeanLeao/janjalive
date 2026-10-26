export type CameraState = 'off' | 'requesting' | 'preview' | 'publishing' | 'live' | 'error' | 'suspended';
export interface CameraSnapshot { state: CameraState; stream: MediaStream | null; error: string | null }

/** Owns capture lifetime; a generation invalidates permission and publication continuations. */
export class CameraController {
  private generation = 0;
  private snapshot: CameraSnapshot = { state: 'off', stream: null, error: null };
  private removeEnded?: () => void;
  private cleanup: Promise<void> = Promise.resolve();
  private options: {
    eligible: () => boolean;
    capture: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    attach: (stream: MediaStream) => Promise<void>;
    stop: () => Promise<void>;
    announce: (active: boolean) => boolean | void;
    changed: (snapshot: CameraSnapshot) => void;
  };
  constructor(options: CameraController['options']) { this.options = options; }
  private change(state: CameraState, stream: MediaStream | null = null, error: string | null = null) {
    this.snapshot = { state, stream, error };
    this.options.changed(this.snapshot);
  }
  stop = () => {
    ++this.generation;
    this.removeEnded?.();
    this.removeEnded = undefined;
    this.snapshot.stream?.getTracks().forEach(track => track.stop());
    this.options.announce(false);
    // Invoke immediately to invalidate PeerManager's pending attach as well.
    this.cleanup = this.options.stop().catch(() => {});
    this.change('off');
  };
  private fail(error: unknown) {
    this.stop();
    const name = (error as { name?: string })?.name;
    const message = name === 'NotAllowedError' || name === 'SecurityError'
      ? 'Permissão da câmera negada ou revogada.'
      : name === 'NotFoundError' ? 'Nenhuma câmera disponível.'
      : name === 'NotReadableError' ? 'Câmera ocupada ou indisponível.'
      : 'Não foi possível transmitir a câmera. A tela continua independente.';
    this.change('error', null, message);
  }
  publicationFailed = () => { this.fail(new Error('Camera publication failed')); };
  suspendForQuality = () => {
    if (this.snapshot.state !== 'live') return;
    this.stop();
    this.change('suspended', null, 'Câmera suspensa por qualidade de conexão. A tela continua ativa. Ative novamente quando desejar.');
  };
  isLive = () => this.snapshot.state === 'live';
  request = async () => {
    if (!this.options.eligible() || !['off', 'error', 'suspended'].includes(this.snapshot.state)) return;
    const generation = ++this.generation;
    this.change('requesting');
    try {
      // Called synchronously from the presenter's click, before any await.
      const stream = await this.options.capture({ audio: false, video: {
        width: { ideal: 640, max: 640 }, height: { ideal: 360, max: 360 },
        frameRate: { ideal: 15, max: 15 },
      } });
      if (generation !== this.generation || !this.options.eligible()) {
        stream.getTracks().forEach(track => track.stop());
        if (generation === this.generation) this.stop();
        return;
      }
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live' || stream.getVideoTracks().length !== 1 || stream.getAudioTracks().length) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('Invalid camera capture');
      }
      const ended = () => { if (generation === this.generation) this.fail(new DOMException('Camera ended', 'NotReadableError')); };
      track.addEventListener('ended', ended);
      this.removeEnded = () => track.removeEventListener('ended', ended);
      this.change('preview', stream);
    } catch (error) { if (generation === this.generation) this.fail(error); }
  };
  publish = async () => {
    const { stream, state } = this.snapshot;
    if (state !== 'preview' || !stream) return;
    if (!this.options.eligible()) { this.stop(); return; }
    const generation = this.generation;
    this.change('publishing', stream);
    try {
      await this.cleanup;
      if (generation !== this.generation) return;
      if (!this.options.eligible()) { this.stop(); return; }
      await this.options.attach(stream);
      if (generation !== this.generation) return;
      if (!this.options.eligible() || stream.getVideoTracks()[0].readyState !== 'live') { this.stop(); return; }
      if (this.options.announce(true) === false) throw new Error('Camera announcement failed');
      this.change('live', stream);
    } catch (error) { if (generation === this.generation) this.fail(error); }
  };
}
