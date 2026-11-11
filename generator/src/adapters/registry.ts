import { cypressEmitter } from './cypress/emitter.js';
import { cypressRunner } from './cypress/runner.js';
import { playwrightEmitter } from './playwright/emitter.js';
import { playwrightRunner } from './playwright/runner.js';
import type { Framework, FrameworkAdapter } from './types.js';

const ADAPTERS: Record<Framework, FrameworkAdapter> = {
  playwright: { id: 'playwright', emitter: playwrightEmitter, runner: playwrightRunner },
  cypress: { id: 'cypress', emitter: cypressEmitter, runner: cypressRunner },
};

/** The adapter for `output.framework` (zod guarantees a registered id). */
export function adapterFor(framework: Framework): FrameworkAdapter {
  return ADAPTERS[framework];
}
