import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { nitro } from 'nitro/vite';
import viteReact from '@vitejs/plugin-react';

function webHealthPlugin() {
  return {
    name: 'web-health-endpoint',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url?.split('?')[0];
        if (url === '/healthz-web' || url === '/health-web') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'ok', service: 'web' }));
          return;
        }
        next();
      });
    },
    configurePreviewServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url?.split('?')[0];
        if (url === '/healthz-web' || url === '/health-web') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'ok', service: 'web' }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    webHealthPlugin(),
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
  server: {
    port: 3001,
    proxy: {
      '/signal': {
        target: 'http://127.0.0.1:3000',
        ws: true,
      },
      '/turn-credentials': {
        target: 'http://127.0.0.1:3000',
      },
    },
  },
  preview: {
    port: Number(process.env.PORT) || 3001,
    host: process.env.HOST || '0.0.0.0',
  },
});
