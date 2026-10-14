export class MockMediaStreamTrack {
  constructor(kind = 'video') {
    this.kind = kind;
    this.enabled = true;
    this.readyState = 'live';
    this._listeners = {};
  }

  addEventListener(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  removeEventListener(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter((cb) => cb !== callback);
  }

  stop() {
    this.readyState = 'ended';
    if (this._listeners['ended']) {
      for (const cb of this._listeners['ended']) cb();
    }
  }
}

export class MockMediaStream {
  constructor(tracks = []) {
    this.tracks = tracks.length > 0 ? tracks : [new MockMediaStreamTrack('video')];
  }

  getTracks() {
    return [...this.tracks];
  }

  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }

  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }

  addTrack(track) {
    this.tracks.push(track);
  }
}

export class MockRTCRtpSender {
  constructor(track) {
    this.track = track;
    this.parameters = {
      encodings: [{ maxBitrate: 1500000, maxFramerate: 20 }],
    };
  }

  getParameters() {
    return JSON.parse(JSON.stringify(this.parameters));
  }

  async setParameters(params) {
    this.parameters = JSON.parse(JSON.stringify(params));
  }

  async replaceTrack(track) {
    this.track = track;
  }
}

export class MockRTCPeerConnection {
  constructor(config = {}) {
    this.config = config;
    this.connectionState = 'new';
    this.signalingState = 'stable';
    this.iceConnectionState = 'new';
    this.localDescription = null;
    this.remoteDescription = null;
    this.senders = [];
    this.addedIceCandidates = [];
    this.onicecandidate = null;
    this.ontrack = null;
    this.onsignalingstatechange = null;
    this.oniceconnectionstatechange = null;
    this.onconnectionstatechange = null;
  }

  getSenders() {
    return this.senders;
  }

  addTrack(track, stream) {
    const sender = new MockRTCRtpSender(track);
    this.senders.push(sender);
    return sender;
  }

  async createOffer() {
    return { type: 'offer', sdp: 'v=0\r\no=mock-offer' };
  }

  async createAnswer() {
    return { type: 'answer', sdp: 'v=0\r\no=mock-answer' };
  }

  async setLocalDescription(desc) {
    this.localDescription = desc;
    if (desc.type === 'offer') {
      this.signalingState = 'have-local-offer';
    } else if (desc.type === 'answer') {
      this.signalingState = 'stable';
    }
    this.onsignalingstatechange?.();
  }

  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
    if (desc.type === 'offer') {
      this.signalingState = 'have-remote-offer';
    } else if (desc.type === 'answer') {
      this.signalingState = 'stable';
    }
    this.onsignalingstatechange?.();
  }

  async addIceCandidate(candidate) {
    this.addedIceCandidates.push(candidate);
  }

  async getStats() {
    const reports = new Map();
    reports.set('outbound-video', {
      type: 'outbound-rtp',
      kind: 'video',
      isRemote: false,
      id: 'outbound-video',
      packetsSent: 100,
      bytesSent: 150000,
    });
    reports.set('remote-inbound-video', {
      type: 'remote-inbound-rtp',
      kind: 'video',
      localId: 'outbound-video',
      packetsReceived: 98,
      packetsLost: 2,
    });
    reports.set('candidate-pair', {
      type: 'candidate-pair',
      state: 'succeeded',
      nominated: true,
      currentRoundTripTime: 0.025,
    });
    return reports;
  }

  close() {
    this.connectionState = 'closed';
    this.signalingState = 'closed';
    this.onconnectionstatechange?.();
  }
}
