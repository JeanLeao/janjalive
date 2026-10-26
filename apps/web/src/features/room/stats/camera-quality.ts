/** Experimental camera-only ceilings; acceptance is not delivered quality. */
export const CAMERA_PROFILES = [
  { maxBitrate: 400_000, maxFramerate: 15, scaleResolutionDownBy: 1 },
  { maxBitrate: 220_000, maxFramerate: 10, scaleResolutionDownBy: 1.5 },
  { maxBitrate: 120_000, maxFramerate: 7, scaleResolutionDownBy: 2 },
] as const;

interface History {
  pc: RTCPeerConnection; track: MediaStreamTrack; id: string; timestamp: number;
  observed: number; bytes: number; frames: number; remoteId?: string;
  remoteTime?: number; received?: number; lost?: number; badSince?: number; badCount: number;
}

/** Separate histories and worst-recipient decisions: never feeds screen F34. */
export class CameraQualityObserver {
  private histories = new Map<string, History>();
  private lastDecision = -Infinity;
  reset(): void { this.histories.clear(); }
  observe(peerId: string, pc: RTCPeerConnection, sender: RTCRtpSender | null | undefined,
    reports: RTCStatsReport, now: number): Record<string, unknown> & { degraded: boolean; persistent: boolean } {
    const track = sender?.track;
    const mid = pc.getTransceivers?.().find(t => t.sender === sender)?.mid;
    const candidates: any[] = [];
    reports.forEach(r => { if (r.type === 'outbound-rtp' && r.kind === 'video' && !r.isRemote &&
      ((mid != null && r.mid === mid) || (track && r.trackIdentifier === track.id))) candidates.push(r); });
    const out = candidates.length === 1 ? candidates[0] : undefined;
    const remotes: any[] = [];
    reports.forEach(r => { if (out && r.type === 'remote-inbound-rtp' && r.localId === out.id && r.kind === 'video') remotes.push(r); });
    const remote = remotes.length === 1 ? remotes[0] : undefined;
    const old = this.histories.get(peerId);
    const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    const baseValid = track?.readyState === 'live' && pc.connectionState === 'connected' && out &&
      typeof out.id === 'string' && finite(out.timestamp) && finite(out.bytesSent) && finite(out.framesEncoded);
    if (!baseValid) { this.histories.delete(peerId); return { degraded: false, persistent: false, status: 'unavailable-or-ambiguous' }; }
    const same = old && old.pc === pc && old.track === track && old.id === out.id;
    const fresh = same && now > old.observed && now - old.observed <= 6000 &&
      out.timestamp > old.timestamp && out.timestamp - old.timestamp <= 6000 && out.bytesSent >= old.bytes && out.framesEncoded > old.frames;
    const remoteValid = remote && typeof remote.id === 'string' && finite(remote.timestamp) &&
      Math.abs(out.timestamp - remote.timestamp) <= 6000 && finite(remote.packetsReceived) && finite(remote.packetsLost);
    let loss: number | undefined;
    let rtt: number | undefined;
    if (fresh && remoteValid && old.remoteId === remote.id && old.remoteTime !== undefined &&
      remote.timestamp > old.remoteTime && remote.timestamp - old.remoteTime <= 6000 &&
      old.received !== undefined && old.lost !== undefined) {
      const received = remote.packetsReceived - old.received;
      const lost = remote.packetsLost - old.lost;
      if (received > 0 && lost >= 0 && received + lost >= 50) {
        loss = lost / (received + lost) * 100;
        if (finite(remote.roundTripTime)) rtt = remote.roundTripTime * 1000;
      }
    }
    const encoderLimited = fresh && ['cpu', 'bandwidth'].includes(out.qualityLimitationReason);
    const valid = Boolean(fresh && (loss !== undefined || encoderLimited));
    const bad = valid && (encoderLimited || (loss !== undefined && loss >= 8) || (rtt !== undefined && rtt >= 450));
    const badSince = bad ? old?.badSince ?? now : undefined;
    const badCount = bad ? (old?.badCount ?? 0) + 1 : 0;
    this.histories.set(peerId, { pc, track: track!, id: out.id, timestamp: out.timestamp, observed: now,
      bytes: out.bytesSent, frames: out.framesEncoded, remoteId: remoteValid ? remote.id : undefined,
      remoteTime: remoteValid ? remote.timestamp : undefined, received: remoteValid ? remote.packetsReceived : undefined,
      lost: remoteValid ? remote.packetsLost : undefined, badSince, badCount });
    return { status: valid ? 'measured' : 'insufficient-or-stale', degraded: badCount >= 4 && now - badSince! >= 9000,
      persistent: badCount >= 11 && now - badSince! >= 30000,
      lossPercent: loss, rttMs: rtt, encodeFps: out.framesPerSecond, width: out.frameWidth, height: out.frameHeight,
      bitrateKbps: fresh ? (out.bytesSent - old.bytes) * 8 / (out.timestamp - old.timestamp) : undefined,
      qualityLimitationReason: out.qualityLimitationReason };
  }
  decide(now: number, degraded: boolean, persistent: boolean, level: number): 'reduce' | 'suspend' | null {
    if (!degraded || now - this.lastDecision < 15000) return null;
    if (level >= 2 && !persistent) return null;
    this.lastDecision = now;
    // Each level must establish its own sustained evidence.
    this.reset();
    return level >= 2 ? 'suspend' : 'reduce';
  }
}
