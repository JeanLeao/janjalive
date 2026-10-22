/** Per-room, memory-only routing. Each element has at most one setSinkId in flight. */
export class AudioOutputRouter {
  desired = '';
  unavailable = false;
  private revision = 0;
  private queues = new WeakMap<HTMLMediaElement, Promise<void>>();
  private elements = new Map<HTMLMediaElement, { ready: boolean; running: boolean; resume: () => void }>();
  private changed: () => void;
  constructor(changed: () => void = () => {}) { this.changed = changed; }
  get pending() { return [...this.elements.values()].some(item => !item.ready) && !this.unavailable; }
  allowed(element: HTMLMediaElement) { return !this.unavailable && this.elements.get(element)?.ready === true; }
  register(element: HTMLMediaElement, resume: () => void) {
    const entry = { ready: !this.desired && !this.unavailable && !this.queues.has(element) && !element.sinkId, running: false, resume };
    this.elements.set(element, entry);
    if (!entry.ready) { element.muted = true; void this.apply(element, entry); }
    this.changed();
    return () => { element.muted = true; this.elements.delete(element); this.changed(); };
  }
  select(id: string) {
    this.desired = id;
    this.unavailable = false;
    this.revision++;
    for (const [element, entry] of this.elements) {
      element.muted = true;
      entry.ready = false;
      void this.apply(element, entry);
    }
    this.changed();
  }
  suspend() {
    this.unavailable = true;
    this.revision++;
    for (const [element, entry] of this.elements) { element.muted = true; entry.ready = false; }
    this.changed();
  }
  private async apply(element: HTMLMediaElement, entry: { ready: boolean; running: boolean; resume: () => void }) {
    if (entry.running || this.unavailable) return;
    entry.running = true;
    try {
      while (this.elements.get(element) === entry && !this.unavailable) {
        const revision = this.revision;
        try {
          if (typeof element.setSinkId === 'function') {
            const id = this.desired;
            const previous = this.queues.get(element);
            const task = previous
              ? previous.catch(() => {}).then(() => element.setSinkId(id))
              : element.setSinkId(id);
            this.queues.set(element, task);
            try { await task; }
            finally { if (this.queues.get(element) === task) this.queues.delete(element); }
          }
          else if (this.desired) throw new Error('unsupported');
        } catch {
          if (revision !== this.revision) continue;
          this.suspend();
          return;
        }
        if (this.elements.get(element) !== entry || this.unavailable) return;
        if (revision !== this.revision) continue;
        entry.ready = true;
        entry.resume();
        return;
      }
    } finally { entry.running = false; this.changed(); }
  }
}
