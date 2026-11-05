import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The generator package root (`generator/`), two levels above this file (`src/util` or `dist/util`). */
const generatorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Locate the Playwright runner. The project-local installation wins: specs and `playwright.config.ts`
 * resolve `@playwright/test` from the project's `node_modules`, and mixing a runner binary from a
 * different installation (the generator's own copy) makes Playwright reject every test file with
 * "did not expect test() to be called here".
 */
export async function resolvePlaywrightBinary(cwd: string = process.cwd()): Promise<string> {
  const candidates = [
    resolve(cwd, 'node_modules', '.bin', 'playwright'),
    resolve(process.cwd(), 'node_modules', '.bin', 'playwright'),
    resolve(generatorRoot, 'node_modules', '.bin', 'playwright'),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try the next conventional location
    }
  }
  throw new Error('Could not find the installed Playwright binary. Re-run `make install`.');
}

/** Environment for a Playwright child process: both the generator's and the project's `node_modules` resolve. */
export function withPlaywrightNodePath(cwd: string = process.cwd()): NodeJS.ProcessEnv {
  const separator = process.platform === 'win32' ? ';' : ':';
  const nodePath = [resolve(generatorRoot, 'node_modules'), resolve(cwd, 'node_modules'), process.env.NODE_PATH ?? '']
    .filter(Boolean)
    .join(separator);
  return { ...process.env, NODE_PATH: nodePath };
}
