import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Database tests do several argon2 hashes and round trips; a remote database needs the room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  // Nest's dependency injection reads decorator metadata, which esbuild doesn't emit.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  // Workspace packages point to their built `dist` in package.json, and CI runs the tests before the build.
  // These aliases make the tests read the TypeScript source instead, so no build is needed first.
  resolve: {
    alias: {
      '@primestar/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@primestar/db': path.resolve(__dirname, '../../packages/db/src/index.ts'),
      '@primestar/mail': path.resolve(__dirname, '../../packages/mail/src/index.ts'),
    },
  },
});
