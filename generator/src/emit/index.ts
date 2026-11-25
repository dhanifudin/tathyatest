import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { adapterFor } from '../adapters/registry.js';
import type { TathyaConfig } from '../config.js';
import type { TestCase } from '../generate/test-case.js';
import { buildManifest, type ManifestEntry } from '../generate/manifest.js';
import { planFor } from '../ir/build.js';
import { transpileFiles } from './js.js';

/**
 * Write the suite and return the manifest it wrote: every case becomes an IR plan (the scenario
 * rules, `ir/build.ts`), the selected adapter renders the plans, and the manifest is built from the
 * same cases by shared code, so it never depends on the framework.
 */
export async function emit(cases: TestCase[], config: TathyaConfig): Promise<ManifestEntry[]> {
  const plans = cases.map((testCase) => planFor(testCase, config));
  const typescript = adapterFor(config.output.framework).emitter.files(plans, config);
  const files = config.output.language === 'js' ? transpileFiles(typescript) : typescript;
  await rm(config.output.dir, { recursive: true, force: true });
  await mkdir(config.output.dir, { recursive: true });
  for (const [path, source] of files) {
    const target = join(config.output.dir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, source);
  }
  return writeManifest(cases, config);
}

async function writeManifest(cases: TestCase[], config: TathyaConfig): Promise<ManifestEntry[]> {
  const manifest = buildManifest(cases);
  await writeFile(join(config.output.dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
