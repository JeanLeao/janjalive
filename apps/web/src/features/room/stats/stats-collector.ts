import type { NetworkMetrics, PeerDiagnostics } from '../types';
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
  private collecting = false;
  private epoch = 0;
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
    this.epoch++;
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
    if (this.collecting) return;
    this.collecting = true;
    const epoch = this.epoch;
    try {
      const peers = this.options.peerManager.getPeers();
      for (const id of this.statsByPeer.keys()) if (!peers.has(id)) this.statsByPeer.delete(id);
      for (const id of this.outboundHistory.keys()) if (!peers.has(id)) this.outboundHistory.delete(id);
      for (const key of this.trafficHistory.keys()) if (!peers.has(key.slice(0, key.lastIndexOf(':')))) this.trafficHistory.delete(key);
      if (peers.size === 0) {
        this.options.onStats({ bitrateKbps: null, lossPercent: null, rttMs: null, activeConnections: 0, peers: [] });
        return;
      }

      let worstOutboundLoss = 0;
      const samples: Array<{ bitrate: number | null; loss: number | null; rtt: number | null }> = [];
      const diagnostics: PeerDiagnostics[] = [];

      for (const [peerId, peer] of peers) {
        if (peer.pc.connectionState === 'closed') continue;

        const diagnostic: PeerDiagnostics = {
          peerId, connection: peer.pc.connectionState, ice: peer.pc.iceConnectionState,
          signaling: peer.pc.signalingState,
          negotiated: Boolean(peer.pc.localDescription && peer.pc.remoteDescription),
          stats: 'unavailable', measurement: { bitrate: 'unavailable', loss: 'unavailable', rtt: 'unavailable' }, receiving: null, framesDecoded: null,
          bitrateKbps: null, lossPercent: null, rttMs: null,
        };
        diagnostics.push(diagnostic);
        let reports: RTCStatsReport;
        try {
          reports = await peer.pc.getStats();
        } catch {
          continue;
        }

        if (epoch !== this.epoch) return;
        if (this.options.peerManager.getPeers().get(peerId)?.pc !== peer.pc || (peer.pc.connectionState as string) === 'closed') { diagnostics.pop(); continue; }
        diagnostic.stats = 'available';
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

        const history = this.statsByPeer.get(peerId);
        const bytes = inbound ? inbound.bytesReceived : outbound?.bytesSent;
        const sourceId = inbound ? 'inbound:' + (inbound.id || 'video') : 'outbound:' + (outbound?.id || 'video');
        const sourceHistory = history?.pc === peer.pc && history.sourceId === sourceId ? history : undefined;
        const previous = sourceHistory && Number.isFinite(bytes) && bytes >= sourceHistory.bytes ? sourceHistory : undefined;
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const sent = inbound ? inbound.packetsReceived : remoteInbound?.packetsReceived ?? outbound?.packetsSent;
        const lost = inbound ? inbound.packetsLost : remoteInbound?.packetsLost;
        const elapsed = previous ? Math.max(1, now - previous.now) : 0;
        const bitrate = previous ? Math.round(((bytes - previous.bytes) * 8000) / elapsed) : null;
        const intervalSent = previous ? sent - previous.sent : sent;
        const intervalLost = previous ? lost - previous.lost : lost;
        const totalPackets = !inbound && remoteInbound?.packetsReceived === undefined ? intervalSent : intervalSent + intervalLost;
        const loss = Number.isFinite(intervalSent) && Number.isFinite(intervalLost) && intervalSent >= 0 && intervalLost >= 0 && totalPackets > 0 ? (intervalLost / totalPackets) * 100 : null;
        const candidate: any = pair?.localCandidateId ? reports.get(pair.localCandidateId) : undefined;
        const remoteCandidate: any = pair?.remoteCandidateId ? reports.get(pair.remoteCandidateId) : undefined;
        this.options.logger?.log('receiver-stats', {
          peer: peerId,
          framesDecoded: inbound?.framesDecoded,
          candidatePair: selectedPairId || pair?.id,
          candidateType: candidate?.candidateType,
          remoteCandidateType: remoteCandidate?.candidateType,
          relay: !candidate && !remoteCandidate ? undefined : candidate?.candidateType === 'relay' || remoteCandidate?.candidateType === 'relay',
        });
        const rtt = Number.isFinite(pair?.currentRoundTripTime) && pair.currentRoundTripTime >= 0 ? Math.round(pair.currentRoundTripTime * 1000) : null;

        const firstFrame = sourceHistory?.firstFrame || (Number.isFinite(inbound?.framesDecoded) && inbound.framesDecoded > 0);
        if (firstFrame && !sourceHistory?.firstFrame) this.options.logger?.log('first-frame', { peer: peerId, stream: peer.remoteStream?.id, source: inbound?.id, evidence: 'decoded', elapsedMs: Math.round(now - peer.createdAt) });
        this.statsByPeer.set(peerId, { now, bytes, sent, lost, pc: peer.pc, firstFrame, sourceId });
        Object.assign(diagnostic, { bitrateKbps: bitrate === null ? null : Math.round(bitrate / 1000), lossPercent: loss, rttMs: rtt,
          receiving: Number.isFinite(inbound?.bytesReceived) ? inbound.bytesReceived > 0 : null,
          framesDecoded: Number.isFinite(inbound?.framesDecoded) ? inbound.framesDecoded : null });
        const source = inbound ?? outbound;
        const lossSource = inbound ?? remoteInbound;
        diagnostic.measurement = {
          bitrate: !source ? 'no-report' : !Number.isFinite(bytes) ? 'unsupported' : bitrate === null ? 'pending' : 'measured',
          loss: !lossSource ? 'no-report' : !Number.isFinite(sent) || !Number.isFinite(lost) ? 'unsupported' : loss === null ? 'pending' : 'measured',
          rtt: !pair ? 'no-report' : !Number.isFinite(pair.currentRoundTripTime) ? 'unsupported' : rtt === null ? 'pending' : 'measured',
        };
        samples.push({ bitrate, loss, rtt });
      }

      const average = (key: 'bitrate' | 'loss' | 'rtt') => {
        const values = samples.map(sample => sample[key]).filter((value): value is number => value !== null);
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      };
      const avgBitrate = average('bitrate');
      const avgLoss = average('loss');
      const avgRtt = average('rtt');

      const metrics: NetworkMetrics = {
        bitrateKbps: avgBitrate === null ? null : Math.round(avgBitrate / 1000),
        lossPercent: avgLoss === null ? null : Number(avgLoss.toFixed(1)),
        rttMs: avgRtt === null ? null : Math.round(avgRtt),
        activeConnections: diagnostics.filter(peer => peer.connection === 'connected').length,
        peers: diagnostics,
      };

      if (epoch !== this.epoch) return;
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
    } finally { this.collecting = false; }
  }
}
