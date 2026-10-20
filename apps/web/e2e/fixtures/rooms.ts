import { test, type Page } from '@playwright/test';
import { WebSocket } from 'ws';

const rooms = new Map<string, Promise<string>>();
let address = 1;
/** Explicit creation for existing media regressions; these pages are ordinary guests. */
export async function gotoRoom(page: Page, url: string, options?: Parameters<Page['goto']>[1]) {
  if (!url.startsWith('/room/') || url.includes('demo=')) return page.goto(url, options);
  const parsed = new URL(url, 'http://127.0.0.1:4311');
  const key = `${test.info().testId}:${parsed.pathname}`;
  let created = rooms.get(key);
  if (!created) {
    created = new Promise<string>((resolve, reject) => {
      const ws = new WebSocket('ws://127.0.0.1:4310/signal', { localAddress: `127.0.0.${++address % 250 + 1}` });
      ws.on('error', reject);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'create-room' })));
      ws.on('message', raw => {
        const message = JSON.parse(raw.toString());
        ws.close();
        if (message.type === 'room-created') resolve(message.roomId); else reject(new Error(message.message));
      });
    });
    rooms.set(key, created);
  }
  return page.goto(`/room/${await created}${parsed.search}${parsed.hash}`, options);
}
