import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { RoomStage } from '../../src/features/room/components/RoomStage';

const root = createRoot(document.getElementById('root')!);
const canvas = document.createElement('canvas');
canvas.width = 640; canvas.height = 360;
const stream = canvas.captureStream();
const context = new AudioContext();
const tracked: { track: MediaStreamTrack; listeners: Set<EventListenerOrEventListenerObject> }[] = [];
let hasAudio = true;
let paused = false;
const render = () => root.render(<MantineProvider defaultColorScheme="dark"><div style={{ display: 'flex', height: '100vh' }}><RoomStage
  localStream={null} isSharing={false} remoteStreams={[{ peerId: 'remote', stream }]}
  featuredStreamId="remote" onSelectFeaturedStream={() => {}}
  participants={[{ peerId: 'remote', isLocal: false, isSharing: true, hasAudio, isPaused: paused }]}
  onStartSharing={() => {}} onCopyInvite={() => {}}
/></div></MantineProvider>);
const addAudio = () => {
  const track = context.createMediaStreamDestination().stream.getAudioTracks()[0];
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const add = track.addEventListener.bind(track), remove = track.removeEventListener.bind(track);
  track.addEventListener = (type, listener, options) => {
    if (type === 'ended' && listener) listeners.add(listener);
    add(type, listener, options);
  };
  track.removeEventListener = (type, listener, options) => {
    if (type === 'ended' && listener) listeners.delete(listener);
    remove(type, listener, options);
  };
  tracked.push({ track, listeners });
  stream.addTrack(track);
  stream.dispatchEvent(new MediaStreamTrackEvent('addtrack', { track }));
};
addAudio();
Object.assign(window, {
  audioListenerCounts: () => tracked.map(item => item.listeners.size),
  replaceAudio: () => {
    for (const track of stream.getAudioTracks()) {
      stream.removeTrack(track);
      stream.dispatchEvent(new MediaStreamTrackEvent('removetrack', { track }));
      track.stop();
    }
    addAudio();
  },
  endAudio: () => {
    for (const track of stream.getAudioTracks()) {
      track.stop(); track.dispatchEvent(new Event('ended'));
    }
  },
  setAudioAvailable: (value: boolean) => { hasAudio = value; render(); },
  setAudioPaused: (value: boolean) => { paused = value; render(); },
  unmountAudio: () => root.unmount(),
});
render();
