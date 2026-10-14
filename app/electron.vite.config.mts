import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadMainDevelopmentEnvironment } from './src/main-environment';

export default defineConfig(({ command, mode }) => {
  loadMainDevelopmentEnvironment(command, mode, import.meta.dirname);
  return {
    main: {
      build: {
        rollupOptions: {
          input: resolve(import.meta.dirname, 'src/main.ts'),
          output: { format: 'cjs', entryFileNames: 'index.cjs' },
        },
      },
    },
    preload: {
      build: {
        rollupOptions: {
          input: resolve(import.meta.dirname, 'src/preload/index.ts'),
          // Sandboxed Electron preloads require CommonJS and a bundled entry point.
          output: { format: 'cjs', entryFileNames: 'index.cjs' },
        },
      },
    },
    renderer: {
      root: resolve(import.meta.dirname, 'src/renderer'),
      resolve: { alias: { '@': resolve(import.meta.dirname, 'src/renderer') } },
      plugins: [
        react(),
        tailwindcss(),
        {
          name: 'development-refresh-csp',
          apply: 'serve',
          // Vite React injects an inline refresh preamble only during development.
          transformIndexHtml(html: string): string {
            return html.replace(
              "script-src 'self'",
              "script-src 'self' 'unsafe-inline'",
            );
          },
        },
      ],
      server: { host: '127.0.0.1', port: 5173, strictPort: true },
    },
  };
});
