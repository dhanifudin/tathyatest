import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';
import type { TathyaConfig } from '../config.js';
import type { TestCase } from '../mapper.js';
import { emitTs } from './ts.js';

/**
 * JavaScript output = the TypeScript suite transpiled file by file (support module included), so
 * both languages share one emitter. Specs import `../support/tathya.js`, which resolves to the
 * transpiled module here and to the `.ts` source under TypeScript's NodeNext resolution.
 */
export async function emitJs(cases: TestCase[], config: TathyaConfig): Promise<void> {
  const tsDir = `${config.output.dir}-ts-tmp`;
  await emitTs(cases, { ...config, output: { ...config.output, dir: tsDir, language: 'ts' } });
  await rm(config.output.dir, { recursive: true, force: true });
  try {
    for (const sourcePath of await tsFilesUnder(tsDir)) {
      const target = join(config.output.dir, relative(tsDir, sourcePath)).replace(/\.ts$/, '.js');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, transpileSpec(await readFile(sourcePath, 'utf8')));
    }
  } finally {
    await rm(tsDir, { recursive: true, force: true });
  }
}

async function tsFilesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(('parentPath' in entry ? entry.parentPath : (entry as { path: string }).path) as string, entry.name))
    .sort();
}

function transpileSpec(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}
