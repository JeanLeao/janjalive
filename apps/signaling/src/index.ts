import { fileURLToPath } from 'node:url';
import { createSignalServer } from './server.js';

export * from './server.js';
export * from './room-state.js';
export * from './turn.js';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const app = createSignalServer({ port, host });
  await app.ready;
  console.log(`[screen-room:signaling] Servidor disponível em http://localhost:${app.port}`);
}
