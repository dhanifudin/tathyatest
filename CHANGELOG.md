# Changelog

All notable changes to this project are recorded here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/); versions are not tagged yet, so entries are grouped by theme.

## Unreleased

### Fixed (crawler and Playwright generator)
- Crawl: denial and server-error pages are no longer recorded as reachable; one bad page no longer ends the
  crawl; depth limits links instead of stopping; logout links are skipped and a lost session logs in again;
  one login rule for crawler and specs; locators are verified against the accessibility tree.
- Crawl contract v3 (in-page links, effective form method, radio groups, prefilled fields, config
  fingerprint). Older crawls are taken again.
- Generation: radios and repeated names no longer break a spec file; native validation is used only where the
  browser can see the violation; valid values honour field constraints; script writes are not read-only.
- Oracles: record links by route shape, updates by reopening the edit page, accepted input must show no
  validation error, only a 404 may be an app shell, anchored URL checks.
- Tests act inside their crawled form with whole-name locators; **a missing control fails, a hidden one
  skips**; `tt eval` lists tests that never execute.

Results measured before these changes are not comparable: test counts, assertion counts and density,
navigation coverage and skips all differ.

### Added
- Cypress output: `tt generate|run|all|report|eval --framework playwright|cypress` and `output.framework` in the
  config; a `cypress.browsers` list; root `cypress.config.ts`; hand-written Cypress baselines
  (`tests/manual/*/baseline.cy.ts`); `tt init` asks for the framework.
- Intermediate Representation (`generator/src/ir/`): every scenario rule decides once into a framework-neutral
  `TestPlan`; adapters (`generator/src/adapters/{playwright,cypress}`) only render and run it. Guides:
  `docs/adapters/adding-rules.md`, `docs/adapters/ir-migration-report.md`.
- Conformance tests across adapters, a Cypress golden suite (typechecked), IR builder tests.
- `.gitattributes` keeps LF line endings so the template loader and golden test work on Windows checkouts.
- Framework-neutral generator: configurable reset hook and evaluation control plane, keyword-based CRUD
  classification, `mode: read-only` (`tt generate|all --read-only`, `tt run --read-only|--write-only`).
- Readable generated suites: one spec per category and route shape, a typechecked support module,
  scenario-style titles, `@tier @category @role:x @read|@write` tags.
- Deeper oracles (GET query echo, state flip, link landing, logout, inferred REST routes, RBAC affordances).
- 18-fault catalogue with four negative controls and a clean-build "failing or flaky" list in `tt eval`.
- PRDs for framework adapters (`docs/prd/`), VS Code tasks and debug configurations, CI workflow.
- `make setup`, `make case-study-setup`, `make serve`, `make clean-outputs`.

### Changed
- Playwright output is byte-identical; its code moved from `emit/ts.ts`, `emit/support.ts`, `generate/locator.ts`,
  `generate/oracle.ts` and `eval/playwright.ts` into `ir/` (rules) and `adapters/playwright/` (syntax, runner).
- `generator/src` regrouped into `cli`, `crawl`, `auth`, `generate`, `emit`, `eval`, `util`; `mapper.ts`,
  `metrics.ts` and `extract/rendered.ts` split into focused modules; one generate stage shared by
  `tt generate`, `tt all` and `tt eval`.
- Tests are typechecked; ESLint (no non-null assertions, no import cycles) and Prettier config added.
- The Blade and Inertia configs are committed (public seeded credentials only) and the duplicate
  `*.example.yaml` copies were removed.
- `docs/implementation-plan.md` and `docs/analysis-plan.md` moved to `docs/history/`.
- README shortened to a quick start and documentation map; the detailed material moved to
  `docs/how-it-works.md`, `docs/evaluation.md` and `docs/vscode.md`.

### Fixed
- Login selectors for elements that only carry `data-testid` never matched; `#id` selectors escape special characters.
- Server-error oracle checks the response status and error-page shapes instead of any "500" in the body.
- Generated login check waits for slow redirects (WebKit) before judging a successful login.
- Laravel case studies: no `show` route without an action, plain-text paginator labels, harness excluded from SUT coverage.
