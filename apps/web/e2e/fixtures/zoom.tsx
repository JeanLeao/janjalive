import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { RoomStage } from '../../src/features/room/components/RoomStage';

const root = createRoot(document.getElementById('root')!);
let stream: MediaStream;
let currentCanvas: HTMLCanvasElement;
let timer: ReturnType<typeof setInterval>;
const render = () => root.render(<MantineProvider defaultColorScheme="dark"><div style={{ display: 'flex', height: '80vh' }}><RoomStage localStream={stream} isSharing remoteStreams={[]} featuredStreamId="local" onSelectFeaturedStream={() => {}} participants={[]} onStartSharing={() => {}} onCopyInvite={() => {}} /></div><div style={{ height: '150vh' }}>Área de rolagem</div></MantineProvider>);
(window as any).replaceZoomStream = (width: number, height: number) => {
  stream?.getTracks().forEach(t => t.stop());
  clearInterval(timer);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  currentCanvas = canvas;
  const context = canvas.getContext('2d')!;
  let frame = 0;
  timer = setInterval(() => {
    context.fillStyle = '#16314f'; context.fillRect(0, 0, width, height);
    context.fillStyle = '#ffffff'; context.font = '24px monospace';
    for (let y = 40; y < height; y += 60) context.fillText(`Janjalive — linha ${y} — quadro ${frame}`, 20, y);
    frame++;
  }, 40);
  stream = canvas.captureStream(25);
  render();
};
(window as any).resizeZoomVideo = (width: number, height: number) => {
  currentCanvas.width = width; currentCanvas.height = height;
};
(window as any).replaceZoomStream(1280, 720);
