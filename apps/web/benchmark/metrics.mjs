// All rates use compatible RTCStats timestamps (milliseconds), never wall clocks.
export function delta(current, previous, field) {
  if (!previous || current.id !== previous.id || !Number.isFinite(current.timestamp) ||
      !Number.isFinite(previous.timestamp) || current.timestamp <= previous.timestamp ||
      !Number.isFinite(current[field]) || !Number.isFinite(previous[field]) || current[field] < previous[field]) return null;
  return current[field] - previous[field];
}
export function invalidReason(current, previous, fields) {
  if (fields.some(field => !Number.isFinite(current[field]))) return 'field-not-provided';
  if (!previous || current.id !== previous.id) return 'initial-or-replaced-report';
  if (fields.some(field => !Number.isFinite(previous[field]))) return 'previous-field-not-provided';
  if (!Number.isFinite(current.timestamp) || !Number.isFinite(previous.timestamp) || current.timestamp <= previous.timestamp) return 'invalid-or-stale-timestamp';
  if (fields.some(field => current[field] < previous[field])) return 'counter-decreased';
  return null;
}
export function measure(current, previous) {
  const bytes = delta(current, previous, current.type === 'outbound-rtp' ? 'bytesSent' : 'bytesReceived');
  const received = delta(current, previous, 'packetsReceived');
  const lost = delta(current, previous, 'packetsLost');
  return {
    bitrateKbps: bytes === null ? null : bytes * 8 / (current.timestamp - previous.timestamp),
    lossPercent: received === null || lost === null || received + lost <= 0 ? null : 100 * lost / (received + lost),
    fps: Number.isFinite(current.framesPerSecond) ? current.framesPerSecond : null,
    bytesDelta: bytes,
    intervalMs: bytes === null ? null : current.timestamp - previous.timestamp,
    missingReasons: {
      bitrate: bytes === null ? invalidReason(current, previous, [current.type === 'outbound-rtp' ? 'bytesSent' : 'bytesReceived']) : null,
      loss: received === null || lost === null ? invalidReason(current, previous, ['packetsReceived','packetsLost']) : received + lost <= 0 ? 'no-packet-traffic' : null,
      fps: Number.isFinite(current.framesPerSecond) ? null : 'field-not-provided',
    },
  };
}
export function summary(values) {
  const valid = values.filter(Number.isFinite);
  return { n: valid.length, missing: values.length - valid.length, mean: valid.length ? valid.reduce((a,b) => a+b,0)/valid.length : null,
    min: valid.length ? Math.min(...valid) : null, max: valid.length ? Math.max(...valid) : null };
}
