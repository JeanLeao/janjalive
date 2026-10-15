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
  sent: number;
  lost: number;
  pc: RTCPeerConnection;
  firstFrame: boolean;
  sourceId: string;
}

export class StatsCollector {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly statsByPeer = new Map<string, PeerHistory>();
  private readonly outboundHistory = new Map<string, { pc: RTCPeerConnection; id: string; sent: number; lost: number; timestamp: number }>();
  private readonly trafficHistory = new Map<string, { pc: RTCPeerConnection; id: string; bytes: number; timestamp: number }>();
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
    this.outboundHistory.clear();
    this.trafficHistory.clear();
    this.options.onStats(null);
  }

  async collect(): Promise<void> {
    const peers = this.options.peerManager.getPeers();
    for (const id of this.statsByPeer.keys()) if (!peers.has(id)) { this.statsByPeer.delete(id); this.outboundHistory.delete(id); this.trafficHistory.delete(`${id}:send`); this.trafficHistory.delete(`${id}:receive`); }
    if (peers.size === 0) {
      this.options.onStats(null);
      return;
    }

    let worstOutboundLoss = 0;
    const samples: Array<{ bitrate: number; loss: number; rtt: number }> = [];

    for (const [peerId, peer] of peers) {
      if (peer.pc.connectionState === 'closed') continue;

      let reports: RTCStatsReport;
      try {
        reports = await peer.pc.getStats();
      } catch {
        continue;
      }

      let inbound: any;
      let outbound: any;
      let remoteInbound: any;
      let pair: any;
      let selectedPairId: string | undefined;

      reports.forEach((report) => {
        if (report.type === 'transport') selectedPairId = report.selectedCandidatePairId;
        if (report.type === 'inbound-rtp' && report.kind === 'video') inbound = report;
        if (report.type === 'outbound-rtp' && report.kind === 'video' && !report.isRemote) {
          outbound = report;
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
          pair = report;
        }
      });

      if (selectedPairId) pair = reports.get(selectedPairId) || pair;
      reports.forEach((report) => {
        if (report.type === 'remote-inbound-rtp' && report.kind === 'video' && report.localId === outbound?.id) {
          remoteInbound = report;
        }
      });

      // Only a fresh receiver report tied to OUR outbound video can reduce OUR quality.
      // Inbound video can belong to another simultaneous presenter.
      if (outbound && remoteInbound) {
        const previous = this.outboundHistory.get(peerId);
        const sent = remoteInbound.packetsReceived ?? outbound.packetsSent;
        const lost = remoteInbound.packetsLost;
        const timestamp = remoteInbound.timestamp;
        const id = `${outbound.id}:${remoteInbound.id ?? 'remote'}`;
        if (Number.isFinite(sent) && Number.isFinite(lost) && Number.isFinite(timestamp)) {
          if (previous?.pc === peer.pc && previous.id === id && timestamp > previous.timestamp && sent >= previous.sent && lost >= previous.lost) {
            const deltaSent = sent - previous.sent;
            const deltaLost = lost - previous.lost;
            const total = remoteInbound.packetsReceived === undefined ? deltaSent : deltaSent + deltaLost;
            if (total > 0) worstOutboundLoss = Math.max(worstOutboundLoss, Math.min(100, deltaLost / total * 100));
          }
          this.outboundHistory.set(peerId, { pc: peer.pc, id, sent, lost, timestamp });
        }
      } else this.outboundHistory.delete(peerId);
      const bitrateFor = (direction: 'send' | 'receive', report: any, bytes: number | undefined) => {
        const key = `${peerId}:${direction}`;
        const previous = this.trafficHistory.get(key);
        if (!report || !Number.isFinite(bytes) || !Number.isFinite(report.timestamp)) { this.trafficHistory.delete(key); return undefined; }
        this.trafficHistory.set(key, { pc: peer.pc, id: report.id, bytes: bytes!, timestamp: report.timestamp });
        if (!previous || previous.pc !== peer.pc || previous.id !== report.id || bytes! < previous.bytes || report.timestamp <= previous.timestamp) return undefined;
        return Math.round((bytes! - previous.bytes) * 8 / (report.timestamp - previous.timestamp));
      };
      this.options.logger?.log('video-quality-stats', {
        peer: peerId,
        outboundBitrateKbps: bitrateFor('send', outbound, outbound?.bytesSent),
        inboundBitrateKbps: bitrateFor('receive', inbound, inbound?.bytesReceived),
        encodeFps: outbound?.framesPerSecond,
        receiveFps: inbound?.framesPerSecond,
        encodedWidth: outbound?.frameWidth, encodedHeight: outbound?.frameHeight,
        receivedWidth: inbound?.frameWidth, receivedHeight: inbound?.frameHeight,
        bytesSent: outbound?.bytesSent, bytesReceived: inbound?.bytesReceived,
        qualityLimitationReason: outbound?.qualityLimitationReason,
      });
      if (!outbound && !inbound) continue;

      const history = this.statsByPeer.get(peerId);
      const bytes = inbound?.bytesReceived ?? outbound?.bytesSent ?? 0;
      const sourceId = inbound ? 'inbound:' + (inbound.id || 'video') : 'outbound:' + (outbound.id || 'video');
      const previous = history?.pc === peer.pc && history.sourceId === sourceId && bytes >= history.bytes ? history : undefined;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const sent = inbound?.packetsReceived ?? remoteInbound?.packetsReceived ?? outbound?.packetsSent ?? 0;
      const lost = inbound?.packetsLost ?? remoteInbound?.packetsLost ?? 0;
      const elapsed = previous ? Math.max(1, now - previous.now) : 0;
      const bitrate = previous ? Math.round(((bytes - previous.bytes) * 8000) / elapsed) : 0;
      const intervalSent = previous ? Math.max(0, sent - previous.sent) : sent;
      const intervalLost = previous ? Math.max(0, lost - previous.lost) : lost;
      const loss = intervalSent + intervalLost > 0 ? (intervalLost / (intervalSent + intervalLost)) * 100 : 0;
      const candidate: any = pair?.localCandidateId ? reports.get(pair.localCandidateId) : undefined;
      const remoteCandidate: any = pair?.remoteCandidateId ? reports.get(pair.remoteCandidateId) : undefined;
      this.options.logger?.log('receiver-stats', {
        peer: peerId,
        framesDecoded: inbound?.framesDecoded,
        candidatePair: selectedPairId || pair?.id,
        candidateType: candidate?.candidateType,
        remoteCandidateType: remoteCandidate?.candidateType,
        relay: candidate?.candidateType === 'relay' || remoteCandidate?.candidateType === 'relay',
      });
      const rtt = pair?.currentRoundTripTime ? Math.round(pair.currentRoundTripTime * 1000) : 0;

      const firstFrame = previous?.firstFrame || Boolean(inbound?.framesDecoded);
      if (firstFrame && !previous?.firstFrame) this.options.logger?.log('first-frame', { peer: peerId, elapsedMs: Math.round(now - peer.createdAt) });
      this.statsByPeer.set(peerId, { now, bytes, sent, lost, pc: peer.pc, firstFrame, sourceId });
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

    if (worstOutboundLoss >= 5 && Date.now() - this.lastAutoDowngradeTime >= 20000) {
      this.lastAutoDowngradeTime = Date.now();
      this.options.onDegradation?.(worstOutboundLoss);
    }
  }
}
