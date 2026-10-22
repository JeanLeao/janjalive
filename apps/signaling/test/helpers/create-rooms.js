import { WebSocket } from 'ws';

// Existing regression scenarios retain readable labels while using authoritative creation.
export async function createTestRooms(app, labels) {
  const ids = {};
  for (const label of labels) {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const response = new Promise((resolve, reject) => {
      ws.once('message', raw => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'room-created') resolve(message); else reject(new Error(message.message));
      });
    });
    ws.send(JSON.stringify({ type: 'create-room' }));
    ids[label] = (await response).roomId;
    ws.close();
  }
  return ids;
}
