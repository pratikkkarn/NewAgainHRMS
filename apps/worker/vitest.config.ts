import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Workspace packages point to their built `dist` in package.json, and CI runs the tests before the build.
  // These aliases make the tests read the TypeScript source instead, so no build is needed first.
  resolve: {
    alias: {
      '@primestar/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@primestar/db': path.resolve(__dirname, '../../packages/db/src/index.ts'),
      '@primestar/mail': path.resolve(__dirname, '../../packages/mail/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
