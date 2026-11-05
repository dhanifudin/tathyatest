// Entry point used by bin/tt: build the CLI and run it. `cli.ts` only builds the program so
// tests can inspect commands and flags without parsing the test runner's own argv.
import { buildProgram } from './cli.js';

buildProgram().parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
