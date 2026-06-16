import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
import type { TathyaConfig } from '../config.js';
import type { TestCase } from '../mapper.js';
import { emitTs } from './ts.js';

export async function emitJs(cases: TestCase[], config: TathyaConfig): Promise<void> {
  const tsDir = `${config.output.dir}-ts-tmp`;
  await emitTs(cases, { ...config, output: { ...config.output, dir: tsDir, language: 'ts' } });
  await rm(config.output.dir, { recursive: true, force: true });
  await mkdir(join(config.output.dir, 'auth'), { recursive: true });
  await mkdir(join(config.output.dir, 'forms'), { recursive: true });
  await mkdir(join(config.output.dir, 'interactions'), { recursive: true });
  await mkdir(join(config.output.dir, 'pagination'), { recursive: true });
  await mkdir(join(config.output.dir, 'rbac'), { recursive: true });
  const { readFile } = await import('node:fs/promises');
  for (const folder of ['auth', 'forms', 'interactions', 'pagination', 'rbac']) {
    const source = await readFile(join(tsDir, folder, `${folder}.spec.ts`), 'utf8');
    await writeFile(join(config.output.dir, folder, `${folder}.spec.js`), transpileSpec(source));
  }
  await rm(tsDir, { recursive: true, force: true });
}

function transpileSpec(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  }).outputText;
}
