# PRD 3: Runner adapter and evaluation integration

Status: Draft. Depends on: PRD 1.

## Problem

Running and evaluating the suite is hard-wired to Playwright in four places: `tt run` and `tt all`
(`generator/src/cli/cli.ts`: `runPlaywright`, `mutationFilterArgs`, `resolvePlaywrightBinary`),
the JSON path (`generator/src/eval/playwright.ts`: `runPlaywrightJson`, `parsePlaywrightJson`), the
evaluation runner (`generator/src/eval/runner.ts`: `runStack`, `runBaseline`, `runFaults`), and the
root scaffold (`playwright.config.ts`, `playwright.global-setup.ts`). A second framework must plug in
without touching metrics or statistics, which already consume the neutral `SuiteRun` type
(`generator/src/eval/types.ts`).

## Goals

1. One `TestRunner` interface used by `cli.ts` and `eval/runner.ts`.
2. A documented project-naming contract so that role, browser, flake, and agreement metrics work for any framework.
3. Framework-specific baseline detection and static analysis.

## Non-goals

- Changing `metrics.ts`, `stats.ts`, or the report shape.
- Running two frameworks inside one `tt eval`.

## Interface

```ts
// generator/src/adapters/types.ts
export type Mode = 'read-only' | 'write-only';
export type ProjectId = string;                     // '<role>-<browser>' e.g. 'admin-chromium'

export interface RunJsonOptions {
  cwd: string;
  config?: string;                                  // framework config file
  testDir?: string;                                 // overrides spec directory (baselines)
  projects?: ProjectId[];                           // restrict to role/browser pairs
  titles?: string[];                                // exact leaf titles (fault runs)
  mode?: Mode;
  env?: Record<string, string>;
}

export interface TestRunner {
  readonly id: 'playwright' | 'cypress';
  readonly browsers: readonly ('chromium' | 'firefox' | 'webkit')[];
  projectName(role: string, browser: string): ProjectId;
  filterArgs(mode: Mode): string[];                 // read-only/write-only via tags
  run(opts: { cwd: string; args: string[]; env?: Record<string, string> }): Promise<void>; // tt run, tt all
  runJson(opts: RunJsonOptions): Promise<SuiteRun>; // one repeat, parsed to SuiteRun
  showReport(cwd: string): Promise<void>;
  hasSpecs(dir: string): boolean;                   // *.spec.(t|j)s vs *.cy.(t|j)s
  baselineConfig(dir: string): string | undefined;
  staticAnalysis(source: string): StaticCounts;     // replaces regexes in eval/baseline-static.ts
}
```

`SuiteRun` stays `{ outcomes: { title, project, status: 'passed'|'failed'|'skipped', durationMs }[] }`.

## Requirements

- R3.1 `cli.ts` MUST obtain the runner from the adapter registry; no direct `playwright` string remains in `cli.ts` except in the Playwright adapter.
- R3.2 `tt run --read-only` and `--write-only` MUST map to `runner.filterArgs(mode)`: Playwright keeps `--grep-invert @write|@read`; Cypress uses `@cypress/grep` (`--env grepTags=-@write`).
- R3.3 `runJson` MUST return one outcome per `(project, test)` pair, with `title` equal to the leaf title of the emitted test (exact string from the manifest) and `project` equal to `projectName(role, browser)`.
- R3.4 Tests that do not belong to the project's role MUST be reported as `skipped`, not omitted. Reason: `reliabilityOf` keys flake by `project::title` and the Fleiss kappa routine ignores skips (`metrics.ts`); omitting them changes the denominators.
- R3.5 `eval/runner.ts` MUST build fault-run selections through `titles` and let the runner translate them (Playwright: escaped regex joined by `|` for `--grep`; Cypress: the grep plugin's separator syntax and a length-safe batching strategy). The caller MUST NOT build regexes.
- R3.6 `faultProject` (`evaluation.faultProject`) MUST be interpreted as a browser name; the project list passed to `runJson` MUST be `projectName(role, faultProject)` per role. Default stays `null` meaning all browsers.
- R3.7 Repeats MUST remain separate process runs (current behavior in `runStack`), not framework-level repeat flags, so flake and time-mean confidence intervals are comparable across frameworks.
- R3.8 `hasSpecs` and `baselineConfig` MUST be used for the manual baseline in `runBaseline` and `runBaselineFaults`; a baseline directory contains specs for the selected framework only.
- R3.9 `eval/baseline-static.ts` MUST delegate to `staticAnalysis` so that test count, assertion density, brittle-locator ratio, and locator mix are computed with framework patterns (Playwright: `test(`, `expect(`, `getByRole`, `locator(`; Cypress: `it(`, `.should(`, `cy.get`, `cy.findByRole`).
- R3.10 Exit codes MUST NOT decide success of `runJson` (a failing test is data); only a missing report or a crash is an error.
- R3.11 A missing framework binary or browser MUST produce an actionable error naming the install command (current behavior in `resolvePlaywrightBinary`).
- R3.12 The scaffold written by the adapter MUST read `TATHYA_CONFIG` (the same env var used today) so that `tt eval --stack` can point one run at a stack's config.

## Metrics that depend on runner semantics

| Metric | Dependency | Requirement |
|--------|------------|-------------|
| Flake rate | same `project::title` key across repeats | R3.3, R3.7 |
| Cross-browser kappa | one project per browser per role; skipped tests ignored | R3.4; each browser MUST appear as a rater |
| Pass rate, unstable test list | `failed` only for assertion or runtime failure | `skipped` for role gate and runtime skips |
| Duration mean and CI | per-test `durationMs` | runner MUST report test duration, not process duration |
| Fault kill | a fault is killed if a relevant test fails | selection by titles, status `failed` |

## Open questions

- Cypress runs one browser per invocation; the adapter MAY run browsers sequentially inside `runJson` and merge outcomes. Decide whether parallelism is allowed (memory is the constraint on small hosts).
- WebKit on Cypress is experimental; the adapter MUST report an unsupported browser as an error before running, not as failures.

## Acceptance checklist

- [ ] `TestRunner` implemented for Playwright with unchanged behavior (same `SuiteRun` for the same run).
- [ ] `eval/runner.ts` contains no framework flag or regex.
- [ ] Skipped-in-other-roles contract has a unit test over a fixture report.
- [ ] `tt run --read-only` selects exactly the `@read` tests for every adapter (conformance test, PRD 6).
