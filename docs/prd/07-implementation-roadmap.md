# PRD 7: Implementation roadmap and decision log

Status: Draft. Depends on: PRD 1 to 6.

Each milestone is independently shippable and ends with an exit criterion that can be checked
mechanically. Sizes are rough: S under a day, M one to three days, L about a week.

## Milestones

### M0: Characterization (S)

Tasks
- Add a test that typechecks the emitted Playwright project (`ts.createProgram` over a temp directory) so refactors are safe.
- Snapshot the current generated output of the Blade, Inertia, and SauceDemo crawls into a golden directory (titles, tags, assertion counts, and full spec text).
Exit: `npm test` fails if any generated file changes.

### M1: Extract the scenario plan (M)

Tasks
- Create `generator/src/scenario/` with `types.ts` and `build.ts` (`planFor`), moving the neutral helpers listed in PRD 2.
- Make `emit/ts.ts` consume plans, still writing identical text.
- Unit-test `planFor` for all `TestCase` kinds; assert plan assertion count equals the manifest count.
Exit: M0 golden test passes unchanged.

### M2: Adapter interfaces and Playwright adapter (L)

Tasks
- Add `adapters/types.ts`, `registry.ts`; move `emit/ts.ts`, `emit/support.ts`, `locator.ts`, `oracle.ts` rendering into `adapters/playwright/`.
- Implement `TestRunner` for Playwright by moving `eval/playwright.ts`, `runPlaywright`, `mutationFilterArgs`, baseline detection, static analysis.
- Switch `emit/index.ts`, `cli.ts`, `eval/runner.ts`, `eval/baseline-static.ts` to the interfaces.
Exit: M0 golden test and the full `npm test` pass; `tt eval --stack blade` produces the same report structure (numbers vary only by run noise).

### M3: Config and CLI plumbing (S)

Tasks
- Add `output.framework`, the `cypress:` block, validation (PRD 5), `tt init` prompt, help text, example config, docs.
Exit: old configs unchanged; invalid combinations rejected with tests.

### M4: Cypress emitter and scaffold (L)

Tasks
- Spike (one day): verify `this.skip()` after commands, `cy.session` behavior with `hooks.reset`, `cy.request` status probe, `@cypress/grep` tag filtering, and WebKit support in the pinned Cypress version. Record findings in this file under "Spike results".
- Implement `SpecEmitter` for Cypress, the support module, `cypress.config.ts`, `run-json.mjs`.
- Add golden tests and run the conformance suite against Cypress.
Exit: generated Cypress specs for Blade run green on Chrome against the case study (clean build).

### M5: Cypress runner and evaluation (M)

Tasks
- Implement `TestRunner` for Cypress: per `(role, browser)` invocations, merge to `SuiteRun`, role gate skips, title filter for fault runs, baseline detection, static analysis patterns.
- Run `tt eval --stack blade` and `--stack inertia` with `framework: cypress`.
Exit: report produced with all five metric families; unstable-test list reviewed.

### M6: Parity hardening (L)

Tasks
- Fix flakes and locator misses found in M5; reach the thresholds in PRD 6 (parity matrix).
- Firefox and, if supported, WebKit runs; kappa; read-only mode; SauceDemo run.
Exit: parity matrix filled with real numbers on both case studies and SauceDemo.

### M7: Documentation and release (S)

Tasks
- Update `README.md`, `CLAUDE.md`, `AGENTS.md` (adapter layer, invariant that adapters keep manifest parity), `docs/prd/` status table.
- Remove the `experimental` label if the matrix passes twice in a row.
Exit: docs reviewed by someone who did not implement the adapter.

## Dependencies between milestones

M0 then M1 then M2 are strictly ordered. M3 can start after M2. M4 needs M2 and M3. M5 needs M4.
M6 needs M5. M7 closes.

## Decision log

| ID | Decision | Rationale | Revisit when |
|----|----------|-----------|--------------|
| D1 | The crawler stays on Playwright for all adapters | the contract is plain data; a second crawler adds cost without changing tests | never in this scope |
| D2 | Scenario plan is data, not shared code strings | Cypress cannot reuse `async/await` bodies | if a third adapter needs more step kinds |
| D3 | Cypress results come from the Module API through `cypress/run-json.mjs` | keeps attempt data and leaf titles; mocha JSON loses them | if Cypress changes the result schema |
| D4 | Use `@testing-library/cypress` for `role`, `label`, `placeholder` | needed to honor the locator priority chain | if accessible-name mismatch exceeds 2 percent |
| D5 | One Cypress invocation per `(role, browser)` pair | mirrors Playwright projects; makes kappa and flake keys identical | if memory or time cost is prohibitive |
| D6 | Navigation status via `cy.request` probe before `cy.visit` | Cypress has no `Response` from visit | if `cy.intercept` proves equivalent and cheaper |
| D7 | Role gate inside the spec (`before` + `this.skip()`) | reports other roles as skipped like Playwright | if `@cypress/grep` role filtering reports pending tests equivalently |
| D8 | `faultProject` means a browser name | decouples it from Playwright project naming | never |

## Risks

- Hidden coupling: strings of Playwright APIs also appear in docs, `init.ts`, and `eval/baseline-static.ts`; M2 includes a repo-wide search for `playwright` to catch leftovers.
- Evaluation comparability: Playwright and Cypress runs use different timing models, so durations are reported per framework and never pooled.
- Memory: running three browsers times two roles sequentially is slow on small hosts; allow `cypress.browsers` to be reduced for local runs.

## Spike results

(To be filled during M4.)

## Acceptance checklist

- [ ] Every milestone has an owner and a tracking issue.
- [ ] Exit criteria are executable commands or tests.
- [ ] Decision log is updated whenever a decision is revisited.
