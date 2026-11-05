import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    host: '127.0.0.1',
  },
  test: {
    environment: 'node',
    // The golden directory holds generated *.spec.ts files; they are data, not tests of this repo.
    exclude: [...configDefaults.exclude, 'test/fixtures/**'],
  },
});
