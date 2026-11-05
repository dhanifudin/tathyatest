// tsc compiles src/emit/templates/*.ts to JavaScript, but the emitter needs their *source text* at
// runtime (it copies the template into the generated suite). Copy the sources next to the build.
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(root, 'dist', 'emit', 'templates'), { recursive: true });
await cp(join(root, 'src', 'emit', 'templates'), join(root, 'dist', 'emit', 'templates'), { recursive: true });
