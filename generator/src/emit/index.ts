import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TathyaConfig } from '../config.js';
import type { TestCase } from '../mapper.js';
import { buildManifest } from '../manifest.js';
import { emitJs } from './js.js';
import { emitTs } from './ts.js';

export async function emit(cases: TestCase[], config: TathyaConfig): Promise<void> {
  if (config.output.language === 'js') await emitJs(cases, config);
  else await emitTs(cases, config);
  await writeManifest(cases, config);
}

async function writeManifest(cases: TestCase[], config: TathyaConfig): Promise<void> {
  await mkdir(config.output.dir, { recursive: true });
  const manifest = buildManifest(cases);
  await writeFile(join(config.output.dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
