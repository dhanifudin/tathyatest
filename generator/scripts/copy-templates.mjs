// tsc compiles the adapters' templates/*.ts to JavaScript (the Cypress ones not at all), but the
// emitters need their *source text* at runtime (they copy each template into the generated suite).
// Copy the sources next to the build.
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const adapter of ['playwright', 'cypress']) {
  const from = join(root, 'src', 'adapters', adapter, 'templates');
  const to = join(root, 'dist', 'adapters', adapter, 'templates');
  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true });
}
