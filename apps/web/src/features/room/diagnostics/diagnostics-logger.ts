import type { DiagnosticEntry } from '../types';

export class DiagnosticsLogger {
  private readonly maxEntries: number;
  private entries: DiagnosticEntry[] = [];
  private listeners = new Set<(entries: DiagnosticEntry[]) => void>();

  constructor(maxEntries = 50) {
    this.maxEntries = maxEntries;
  }

  log(event: string, details: Record<string, unknown> = {}): void {
    const entry: DiagnosticEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      event,
      details,
    };

    this.entries = [entry, ...this.entries.slice(0, this.maxEntries - 1)];

    if (typeof console !== 'undefined' && console.info) {
      const detailStr = Object.entries(details)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(' ');
      console.info(`[screen-room] ${entry.timestamp} ${event} ${detailStr}`.trim());
    }

    this.notify();
  }

  getEntries(): DiagnosticEntry[] {
    return [...this.entries];
  }

  subscribe(listener: (entries: DiagnosticEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getEntries());
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.entries = [];
    this.notify();
  }

  private notify(): void {
    const current = this.getEntries();
    for (const listener of this.listeners) {
      try {
        listener(current);
      } catch (err) {
        console.error('[screen-room] Error in diagnostics listener:', err);
      }
    }
  }
}
