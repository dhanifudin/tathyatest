# PRD 2: Scenario plan and emitter interface

Status: Draft. Depends on: PRD 1.

## Problem

`generator/src/emit/ts.ts` mixes two jobs: deciding what a test does (step titles, values, which
oracle, landing path, skip conditions) and writing Playwright syntax. A second emitter would
duplicate the first job and drift. Cypress cannot even reuse the syntax half, because its commands
are queued and never awaited.

## Goals

1. Extract a **scenario plan**: a plain-data description of every test, built once from a `TestCase`.
2. Define a `SpecEmitter` interface that renders a scenario plan into source text for one framework.
3. Keep `locator.ts`, `oracle.ts`, and the generated support module under adapter ownership.

## Non-goals

- Changing what any test asserts, its title, tags, or step names.
- Generating specs from anything other than `TestCase[]`.

## Neutral logic to move out of `emit/ts.ts`

These functions contain no Playwright syntax and become the scenario-plan builder:

| Function | Purpose |
|----------|---------|
| `isStateChangeForm` | field-less form that flips state (done toggle) |
| `submittedParamsSource` | expected query parameters of a GET search form |
| `outcomeStepTitle` | readable step name for the outcome |
| `representativeTextValue` | value used for query-echo and text checks |
| `shouldForceValue`, `shouldForceInvalidOption` | when a value must bypass browser input limits |
| `linkLandingPath` (exported) | target path of a link click, or null |
| `formGroupKey`, `describeTitle`, `formDescribeTitle`, `specPathFor`, `routeSlug`, `canonicalPath` | grouping, titles, file layout |
| `testOptions` / `caseMeta` | tags and annotations; already shared with `manifest.ts` |

## Scenario plan (data)

```ts
// generator/src/scenario/types.ts
export type ScenarioPlan = {
  title: string;                  // exact leaf title; unique (manifest join key)
  describe: string[];             // role, page, form headings
  tags: string[];                 // '@negative' '@crud' '@role:admin' '@write'
  annotations: { type: string; description: string }[];
  role: string;
  session: 'role' | 'logged-out'; // auth specs run logged out
  skipUnlessRole: boolean;        // per-role gate (see PRD 3 for project mapping)
  steps: ScenarioStep[];
};

export type ScenarioStep = { title: string } & (
  | { kind: 'login'; mode: 'ensure' | 'fresh' }
  | { kind: 'open'; url: string; captureStatus: boolean }
  | { kind: 'locate-skip'; target: LocatorRef; reason: string }       // runtime skip if absent or hidden
  | { kind: 'fill'; field: FieldPlan }                                // text, check, select, file, forced value
  | { kind: 'click'; target: LocatorRef; acceptDialog?: boolean; force?: boolean }
  | { kind: 'select'; target: LocatorRef; value: string }
  | { kind: 'expect'; oracle: Oracle }
);

export type Oracle =
  | { type: 'error-state'; errorSelector: string; field?: LocatorRef }   // DOM error or validity
  | { type: 'native-invalid'; field: LocatorRef }                         // validity.valid === false
  | { type: 'no-server-error'; withStatus: boolean }
  | { type: 'route-allowed' | 'route-blocked' | 'route-inferred'; path: string }
  | { type: 'landed'; path: string; withSearch?: boolean }
  | { type: 'query-echo'; params: Record<string, string> }
  | { type: 'state-flipped'; formSelector: string; before: 'captured' }
  | { type: 'element-gone'; selector: string }
  | { type: 'text-visible'; valueRef: string }
  | { type: 'login-rejected' | 'logged-in' | 'logged-out' }
  | { type: 'absent-link'; target: LocatorRef };
```

`LocatorRef` is the existing `Locator` from `crawl.ts` plus optional `scope` (form selector) and
`ordinal`. `FieldPlan` wraps the existing `FieldValue` (`literal | runtime | ref`) from `fieldgen.ts`.
The builder lives in `generator/src/scenario/build.ts` and is a pure function
`planFor(testCase, config): ScenarioPlan`.

## Emitter interface

```ts
// generator/src/adapters/types.ts
export interface SpecEmitter {
  readonly specExtension: string;                       // '.spec.ts' | '.cy.ts'
  specPath(plan: ScenarioPlan, routeSlug: string): string;
  fileHeader(opts: { fakerLocale?: string; fakerSeed?: number; usesFaker: boolean }): string;
  describe(titles: string[], body: string): string;
  test(plan: ScenarioPlan, body: string): string;       // title, tags, annotations, session mode
  step(step: ScenarioStep): string;                     // one step, framework syntax
  locator(ref: LocatorRef): string;                     // replaces locator.ts rendering
  oracle(oracle: Oracle): string;                       // replaces oracle.ts rendering
  supportModule(config: TathyaConfig): { path: string; source: string } | null;
  scaffold(config: TathyaConfig): { path: string; source: string }[]; // framework config files
}
```

`emit/index.ts` then does: build plans, group by `specPath`, ask the emitter for each file, add the
support module and scaffold files, write `manifest.json` from the same `TestCase[]`.

## Requirements

- R2.1 `planFor` MUST be pure (no file or process access), deterministic, and unit-tested without any framework installed.
- R2.2 For every `TestCase`, the sum of `expect` steps in the plan MUST equal the assertion count the manifest records (`formAssertionCount`, `hasLandingAssertion` in `manifest.ts`). Either the manifest derives from the plan or a test asserts equality.
- R2.3 Step titles MUST be identical across adapters (they are part of the readable report); the emitter MAY drop them when the framework has no step API, but MUST keep them as comments or logs.
- R2.4 `locator(ref)` MUST implement the priority chain `testid, role, label, placeholder, id, name, css`; positional selectors are forbidden except `.first()` and the `nth` of `ordinal`.
- R2.5 The Playwright emitter MUST reproduce today's output exactly (PRD 1 R1.4). Move code, do not rewrite it.
- R2.6 `oracle()` for `error-state` and `native-invalid` MUST NOT assert message text.
- R2.7 The support module MUST be adapter-owned and imported through one path constant per adapter (today `SUPPORT_MODULE_PATH` and `SUPPORT_IMPORT` in `emit/support.ts`).
- R2.8 `emitJs` (`emit/js.ts`) MUST keep working for any adapter whose emitter produces TypeScript.
- R2.9 Faker expressions (`faker.ts`) MUST be emitted verbatim; the emitter provides only the import line and the seeding hook.

## Acceptance checklist

- [ ] `scenario/` builds a plan for all five `TestCase` kinds with unit tests (no Playwright import).
- [ ] Playwright emitter consumes plans; `tt generate` diff against the previous output is empty for the Blade, Inertia, and SauceDemo crawls.
- [ ] Plan assertion count equals manifest assertion count for every fixture.
- [ ] `locator.ts` and `oracle.ts` are reachable only through the adapter.
