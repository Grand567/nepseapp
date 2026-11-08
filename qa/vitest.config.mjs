import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export default {
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(ROOT, 'src'),
      '@testing-library/react': path.resolve(__dirname, 'node_modules/@testing-library/react/dist/index.js'),
      'vitest': path.resolve(__dirname, 'node_modules/vitest/dist/index.js'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [path.resolve(__dirname, 'tests/setup.mjs')],
    include: ['qa/tests/**/*.test.{js,mjs,jsx,ts,tsx}'],
    testTimeout: 60000,
  },
};
