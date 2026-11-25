# CLAUDE.md: TathyaTest (tt)

Automated Playwright/Cypress test-case generator for functional testing of web apps with a login form,
server-rendered or single-page. The generator is framework-agnostic; the Laravel Blade/Inertia apps
under `case-study/` and SauceDemo are evaluation subjects, not the target.

```
tt init  →  tt crawl  →  tt generate  →  tt run  →  tt eval
(wizard)   (per role)    (specs out)    (Playwright)  (metrics report)
```

## Read these first

| File | Use it for |
|------|------------|
| `README.md` | quick start, commands, what is generated, read-only mode, outputs, documentation map |
| `docs/how-it-works.md` | crawler behavior and every generation rule (keyword rules, variants, CRUD, pagination, faker) |
| `docs/evaluation.md` | `tt eval`, evaluation vocabulary, SauceDemo and baselines |
| `docs/vscode.md` | tasks, breakpoints, Xdebug, troubleshooting |
| `AGENTS.md` | the invariants and contracts you must never break (crawl contract, RBAC, faults, locators, oracles, task boundaries) |
| `CONTRIBUTING.md` | workflow, commit style, PR checklist, how to add a variant, oracle, or fault |
| `docs/adapters/` | `adding-rules.md` (add a rule once for every framework), `ir-migration-report.md` (where each rule lives) |
| `docs/prd/` | requirements behind the framework adapters |
| `docs/history/` | superseded plans, kept for context only |

Do not restate those documents here. If a fact is wrong, fix it at its source.

## Repository map

```
generator/              TypeScript CLI (`tt`): src/{cli,crawl,auth,generate,ir,adapters,emit,eval,util}, test/ mirrors src/
case-study/             Laravel Breeze test targets (todo-blade, todo-inertia-react) with the eval harness
tests/manual/           hand-written baselines used by `tt eval`
tests/baseline-public/  three public SauceDemo suites (git submodules)
tathya.*.config.yaml    per-stack configs (public seeded credentials only); tathya.config.yaml is local
crawl/ tests/generated/ metrics*/ storageState/   generated outputs, ignored by git, never hand-edited
```

## Commands

```bash
make setup                          # first run: build tt, root deps, Playwright browsers, local config
make case-study-setup STACK=blade   # or inertia: composer, .env, key, sqlite, migrate+seed, assets
make serve STACK=blade              # COVERAGE=1 php artisan serve (inside nix-shell)
make verify                         # typecheck + lint + tests + tt smoke
cd generator && npm run typecheck && npm run lint && npm test
tt -c tathya.blade.config.yaml all  # -c goes BEFORE the sub-command
tt generate --framework cypress     # --framework goes AFTER it (playwright | cypress)
```

Always run PHP and `php artisan` inside `nix-shell`; PHP is not installed globally.
Seeded accounts: `admin@example.com` and `user@example.com`, password `password`.

## TypeScript conventions (`generator/`)

- Strict TypeScript: no `any`, no `@ts-ignore`, no `!` non-null assertions in `src` (lint enforces it).
- `src/config.ts` (zod) is the authoritative config validator: change it first, then consumers.
- `src/crawl/model.ts` is the crawl contract. Keep `src/crawl/dom-extract.ts` (the producer) in sync;
  bump `CRAWL_SCHEMA_VERSION` (currently 2) when a field changes meaning or is removed, add a zod
  default for purely additive fields.
- `generate/*`, `ir/*`, `eval/metrics/*`, `eval/stats.ts` are pure: no I/O, no Playwright. They take loaded
  data and return values. `eval/runner.ts` and `adapters/*/runner.ts` own process spawning and file writes.
- Rules are decided above the IR (`generate/` for which tests exist, `ir/build.ts` for how each runs); the
  emitters in `adapters/<framework>/emitter.ts` only render `TestPlan`s. Follow `docs/adapters/adding-rules.md`.
- `generate/faker.ts` returns **expression strings** that the IR carries verbatim; faker never runs at generation time.
- Nothing framework-specific in code paths. Emitted specs call no app endpoint except the optional
  `hooks.reset`; `tt eval` reaches the app through `evaluation.controlPlane` (default `/__testing/*`).
  Laravel knowledge belongs in `case-study/` and the example configs.
- Emitters build strings with template literals; never `eval` or `Function()`. The generated support
  modules are real files (`generator/src/adapters/<framework>/templates/`), so they are typechecked
  (the Cypress ones through `generator/tsconfig.cypress.json`).
- Library code does not call `process.exit` or `console.*`; throw, or use `src/logger.ts`.
- Use `@clack/prompts` for all prompts in `cli/init.ts`.
- Tests live in `generator/test/<area>/` mirroring `src/`. `test/golden.test.ts` pins the whole
  generation output on recorded crawls for each framework (`fixtures/golden/`, `fixtures/golden-cypress/`);
  regenerate with `UPDATE_GOLDEN=1` only for a deliberate change and review the diff.
- On Windows, keep LF line endings (`.gitattributes`); a CRLF checkout breaks the template loader and the golden test.

## PHP / Laravel conventions (`case-study/`)

The case studies are test targets, not production code; prefer clarity over elegance.

- Render validation errors with `<x-input-error :messages="$errors->get('field')" />` (Blade) or
  `[role=alert]` / `.text-red-600` (React) so the default `oracle.errorSelector` matches.
- Use `@method('PUT')` / `@method('DELETE')` in every edit/delete form so the CRUD classifier sees the verb.
- In React/Inertia pages keep real `form` metadata (`action`, `method`, field `name`, hidden `_method`).
- Name inputs after migration columns; `data.fields[name]` fills by the `name` attribute.
- Add `data-testid` only where no stable locator exists otherwise.
- Every fault id in `generator/src/eval/faults.ts` needs a `FaultRegistry::is('<id>')` toggle in both apps
  (`generator/test/eval/fault-sync.test.ts` enforces it).

## What NOT to do

- Do not hand-edit generated outputs (`crawl/`, `tests/generated/`, `metrics*/`). `tests/manual/` is
  hand-written and is edited by hand.
- Do not call `@faker-js/faker` at generation time.
- Do not assert exact error-message text in generated tests.
- Do not add error handling for cases that cannot happen (for example a null check on a zod-guaranteed value).
- Do not commit `tathya.config.yaml` (local, may hold real credentials).
- Do not run `php artisan` outside `nix-shell`.

## Verification checklist (before marking a change done)

- [ ] `cd generator && npm run typecheck && npm run lint && npm test` pass (includes the golden test)
- [ ] the emitted specs typecheck (the golden fixtures are covered by `npm run typecheck`)
- [ ] if the crawler changed: `tt crawl` produces valid JSON for each role
- [ ] if emitters changed: `tt generate` writes `manifest.json`; a create spec imports `@faker-js/faker`,
      declares `const f_<field> = faker.…` and asserts that variable (check both `--framework` values)
- [ ] if the IR or an adapter changed: `test/adapters/conformance.test.ts` passes for every framework
- [ ] if oracles changed: a negative test fails when the matching server validation is disabled
- [ ] if eval changed: `tt eval` writes `metrics/report.{json,md}`; activating a fault via
      `POST /__testing/fault` makes the matching tests fail
