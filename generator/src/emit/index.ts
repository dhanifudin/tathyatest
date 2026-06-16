import type { TathyaConfig } from '../config.js';
import type { TestCase } from '../mapper.js';
import { emitJs } from './js.js';
import { emitTs } from './ts.js';

export async function emit(cases: TestCase[], config: TathyaConfig): Promise<void> {
  if (config.output.language === 'js') await emitJs(cases, config);
  else await emitTs(cases, config);
}
