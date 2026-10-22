import React from 'react';
import { AudioOutputProvider, AudioOutputSettings } from '../../src/features/room/hooks/AudioOutput';
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
let second = false;
let featured = 'remote';
const render = () => root.render(<MantineProvider defaultColorScheme="dark"><AudioOutputProvider><div data-testid="output-settings" style={{ position: 'absolute', zIndex: 100, right: 0, width: 'min(340px, 100vw)', background: '#161b22', padding: 12 }}><AudioOutputSettings /></div><div style={{ display: 'flex', height: '100vh' }}><RoomStage
  localStream={null} isSharing={false} remoteStreams={[{ peerId: 'remote', stream }, ...(second ? [{ peerId: 'other', stream }] : [])]}
  featuredStreamId={featured} onSelectFeaturedStream={id => { featured = id; render(); }}
  participants={[{ peerId: 'remote', isLocal: false, isSharing: true, hasAudio, isPaused: paused }, ...(second ? [{ peerId: 'other', displayName: 'Outra fonte', isLocal: false, isSharing: true, hasAudio: true, isPaused: false }] : [])]}
  onStartSharing={() => {}} onCopyInvite={() => {}}
/></div></AudioOutputProvider></MantineProvider>);
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
  addSecondSource: () => { second = true; render(); },
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
