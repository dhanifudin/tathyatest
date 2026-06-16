import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TathyaConfig } from '../config.js';
import type { TestCase } from '../mapper.js';
import { emitTs } from './ts.js';

export async function emitJs(cases: TestCase[], config: TathyaConfig): Promise<void> {
  const tsDir = `${config.output.dir}-ts-tmp`;
  await emitTs(cases, { ...config, output: { ...config.output, dir: tsDir, language: 'ts' } });
  await rm(config.output.dir, { recursive: true, force: true });
  await mkdir(join(config.output.dir, 'auth'), { recursive: true });
  await mkdir(join(config.output.dir, 'crud'), { recursive: true });
  await mkdir(join(config.output.dir, 'rbac'), { recursive: true });
  const { readFile } = await import('node:fs/promises');
  for (const folder of ['auth', 'crud', 'rbac']) {
    const source = await readFile(join(tsDir, folder, `${folder}.spec.ts`), 'utf8');
    await writeFile(join(config.output.dir, folder, `${folder}.spec.js`), source);
  }
  await rm(tsDir, { recursive: true, force: true });
}
