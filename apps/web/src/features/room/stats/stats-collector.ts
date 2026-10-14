import type { NetworkMetrics } from '../types';
import type { PeerManager } from '../webrtc/peer-manager';
import type { DiagnosticsLogger } from '../diagnostics/diagnostics-logger';

export interface StatsCollectorOptions {
  peerManager: PeerManager;
  onStats: (metrics: NetworkMetrics | null) => void;
  onDegradation?: (lossPercent: number) => void;
  logger?: DiagnosticsLogger;
  intervalMs?: number;
}

interface PeerHistory {
  now: number;
  bytes: number;
}

export class StatsCollector {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly statsByPeer = new Map<string, PeerHistory>();
  private lastAutoDowngradeTime = 0;
  private readonly options: StatsCollectorOptions;

  constructor(options: StatsCollectorOptions) {
    this.options = options;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.collect().catch((err: any) => {
        this.options.logger?.log('stats-error', { message: err?.message || '-' });
      });
    }, this.options.intervalMs ?? 3000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.statsByPeer.clear();
    this.options.onStats(null);
  }

  async collect(): Promise<void> {
    const peers = this.options.peerManager.getPeers();
    if (peers.size === 0) {
      this.options.onStats(null);
      return;
    }

    const samples: Array<{ bitrate: number; loss: number; rtt: number }> = [];

    for (const [peerId, peer] of peers) {
      if (peer.pc.connectionState === 'closed') continue;

      let reports: RTCStatsReport;
      try {
        reports = await peer.pc.getStats();
      } catch {
        continue;
      }

      let outbound: any;
      let remoteInbound: any;
      let pair: any;

      reports.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.kind === 'video' && !report.isRemote) {
          outbound = report;
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
          pair = report;
        }
      });

      reports.forEach((report) => {
        if (report.type === 'remote-inbound-rtp' && report.kind === 'video' && report.localId === outbound?.id) {
          remoteInbound = report;
        }
      });

      if (!outbound) continue;

      const previous = this.statsByPeer.get(peerId);
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const sent = remoteInbound?.packetsReceived ?? outbound.packetsSent ?? 0;
      const lost = remoteInbound?.packetsLost ?? 0;
      const bytes = outbound.bytesSent ?? 0;

      const elapsed = previous ? Math.max(1, now - previous.now) : 0;
      const bitrate = previous ? Math.round(((bytes - previous.bytes) * 8000) / elapsed) : 0;
      const loss = sent + lost > 0 ? (lost / (sent + lost)) * 100 : 0;
      const rtt = pair?.currentRoundTripTime ? Math.round(pair.currentRoundTripTime * 1000) : 0;

      this.statsByPeer.set(peerId, { now, bytes });
      samples.push({ bitrate, loss, rtt });
    }

    if (samples.length === 0) {
      this.options.onStats(null);
      return;
    }

    const avgBitrate = Math.round(samples.reduce((s, x) => s + x.bitrate, 0) / samples.length / 1000);
    const avgLoss = Number((samples.reduce((s, x) => s + x.loss, 0) / samples.length).toFixed(1));
    const avgRtt = Math.round(samples.reduce((s, x) => s + x.rtt, 0) / samples.length);

    const metrics: NetworkMetrics = {
      bitrateKbps: avgBitrate,
      lossPercent: avgLoss,
      rttMs: avgRtt,
      activeConnections: samples.length,
    };

    this.options.onStats(metrics);
    this.options.logger?.log('network-stats', {
      bitrateKbps: metrics.bitrateKbps,
      loss: metrics.lossPercent,
      rtt: metrics.rttMs,
      connections: metrics.activeConnections,
    });

    if (avgLoss >= 5 && Date.now() - this.lastAutoDowngradeTime >= 20000) {
      this.lastAutoDowngradeTime = Date.now();
      this.options.onDegradation?.(avgLoss);
    }
  }
}
