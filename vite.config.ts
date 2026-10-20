import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defaultClientConditions, defineConfig } from 'vite';

let version = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'apps/web/package.json'), 'utf8'));
  version = pkg.version || '0.1.0';
} catch {
  // fallback
}

export default defineConfig({
  root: path.resolve(__dirname, 'apps/web'),
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), tailwindcss()],
  resolve: {
    conditions: ['@primestar/source', ...defaultClientConditions],
    alias: {
      '@': path.resolve(__dirname, 'apps/web/src'),
      '@primestar/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
