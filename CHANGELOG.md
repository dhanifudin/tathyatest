# Changelog

All notable changes to this project are recorded here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/); versions are not tagged yet, so entries are grouped by theme.

## Unreleased

### Added
- Framework-neutral generator: configurable reset hook and evaluation control plane, keyword-based CRUD
  classification, `mode: read-only` (`tt generate|all --read-only`, `tt run --read-only|--write-only`).
- Readable generated suites: one spec per category and route shape, a typechecked support module,
  scenario-style titles, `@tier @category @role:x @read|@write` tags.
- Deeper oracles (GET query echo, state flip, link landing, logout, inferred REST routes, RBAC affordances).
- 18-fault catalogue with four negative controls and a clean-build "failing or flaky" list in `tt eval`.
- PRDs for framework adapters (`docs/prd/`), VS Code tasks and debug configurations, CI workflow.
- `make setup`, `make case-study-setup`, `make serve`, `make clean-outputs`.

### Changed
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
