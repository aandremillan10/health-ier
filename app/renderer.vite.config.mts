import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Browser review of the renderer only; live operations still require Backend's preload.
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src/renderer') } },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'development-refresh-csp',
      apply: 'serve',
      transformIndexHtml(html: string): string {
        return html
          .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
          .replace('ws://127.0.0.1:5173', 'ws://127.0.0.1:5175');
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
});
