# PRD 6: Testing, quality gates, and rollout

Status: Draft. Depends on: PRD 1 to 5.

## Problem

Today `generator/test/emit.test.ts` is a golden test of Playwright strings, and emitted TypeScript is
never typechecked by the test suite (only by a manual rule in CLAUDE.md). With two adapters the
risk is silent divergence: different titles, different assertion counts, different tag sets, or a
Cypress suite that is weaker than the Playwright one. The evaluation is a published artifact, so
parity must be measured, not assumed.

## Goals

1. A conformance suite every adapter must pass.
2. Per-adapter golden tests and an emitted-code typecheck in CI.
3. A parity matrix with measurable thresholds for the Cypress release.

## Non-goals

- Pixel or performance parity. Time per test differs by framework and is reported, not gated.

## Conformance suite

Location: `generator/test/adapters/conformance.test.ts`, parameterized over all registered adapters.
Input: fixture `TestCase[]` covering every kind and tier (reuse the fixtures in `emit.test.ts`).
For each adapter it asserts:

1. Every title is unique and equals `manifest.title` for the same case.
2. Tags per test equal `@tier @category @role:x @read|@write` from `manifest.ts`.
3. The number of assertions the emitter writes per test equals `formAssertionCount` and `hasLandingAssertion`.
4. No assertion mentions error message text; locators follow the priority chain; no positional selector other than `.first()` and `ordinal`.
5. `faker` expressions appear only inside test bodies or hooks, never at module top level except the import and the seed.
6. The emitted project typechecks (`ts.createProgram` against the adapter's types) and `emitJs` output parses.
7. `filterArgs('read-only')` and `filterArgs('write-only')` produce the same selected set of titles as the tags imply (computed from the manifest).

## Golden tests

Move today's Playwright expectations from `emit.test.ts` into `generator/test/adapters/playwright/`
without changing them (this is the proof of R1.4). Add `generator/test/adapters/cypress/` with the
equivalent assertions for the Cypress mapping table in PRD 4.

## Parity matrix (Cypress vs Playwright on the same crawl)

| Dimension | Measure | Threshold for release |
|-----------|---------|-----------------------|
| Test inventory | set of titles in `manifest.json` | identical |
| Tag sets | per-title tags | identical |
| Assertions | per-title count | identical |
| Model coverage (EQ1) | element, route, form, field, nav, RBAC, constraint kinds | identical (computed from the manifest, not execution) |
| Pass rate on a clean build | `passRate` over 5 repeats, Chrome and Firefox | at least 99 percent and within 1 point of Playwright |
| Flake rate | `flakeRate` | within 1 point of Playwright; unstable list explained |
| Fault detection | detectable faults detected / controls surviving | same set killed (14 of 14) and same controls surviving (4 of 4) on Blade and Inertia |
| SUT coverage | route, function, line coverage | within 5 points |
| Cross-browser agreement | Fleiss kappa over the supported browsers | at least 0.9 where defined; documented when WebKit is unavailable |
| Read-only mode | titles selected | identical to Playwright |
| Role locators | share failing to resolve | at most 2 percent (R4.7) |

## CI

1. `npm run typecheck && npm test` in `generator/` (includes conformance and golden tests).
2. A job that runs `tt generate` for each adapter on stored crawl fixtures (`tests/fixtures/crawls/`, add if missing) and diffs against checked-in expected listings of titles and tags.
3. A nightly or manual job (case-study servers needed, memory heavy) that runs `tt eval --stack blade` for each framework and uploads `metrics/report.md`.
4. `tsc --noEmit` over `tests/generated` for each adapter (root `tsconfig.json` already includes `tests/**/*.ts`; add a Cypress tsconfig).

## Rollout

1. Land the refactor (M1 to M3) behind `framework: playwright` only; publish when the empty-diff gate passes.
2. Ship Cypress as `experimental` in the CLI help until the parity matrix passes on both case studies and SauceDemo.
3. Document known gaps in the README; remove `experimental` when thresholds hold for two consecutive runs.

## Acceptance checklist

- [ ] Conformance suite exists and runs for every registered adapter in CI.
- [ ] Emitted code typechecks in CI for both adapters.
- [ ] Parity matrix filled in with real numbers in the pull request that removes `experimental`.
