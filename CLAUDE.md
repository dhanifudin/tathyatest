# CLAUDE.md — TathyaTest (tt)

Automated Playwright test-case generator for functional testing of MVC web apps.

**Pipeline:**
```
tt init  →  tt crawl  →  tt generate  →  tt run  →  tt eval
(wizard)   (per role)    (specs out)    (Playwright)  (metrics report)
```

Read `docs/implementation-plan.md` for the ordered build phases before making changes.
Read `AGENTS.md` for the contract invariants you must never break.

---

## Repo layout

```
tt/
├── case-study/todo-blade/          # Laravel Breeze Blade test target
├── case-study/todo-inertia-react/  # Laravel Breeze React/Inertia TS test target
├── generator/            # TypeScript — tt CLI + Playwright crawler + generator
│   ├── bin/tt            # CLI entry point
│   └── src/
│       ├── cli.ts        # commander dispatcher
│       ├── init.ts       # tt init wizard (@clack/prompts)
│       ├── config.ts     # zod-validated config loader
│       ├── crawl.ts      # per-role crawl contract + dispatcher
│       ├── extract/
│       │   └── rendered.ts  # Playwright crawler → crawl.json
│       ├── rbac.ts       # per-role diff → access matrix
│       ├── fieldgen.ts   # constraints → value variants (positive/negative/edge) + valid FieldValue
│       ├── faker.ts      # pure: field → runtime @faker-js/faker expression for valid fills
│       ├── oracle.ts     # novalidate-aware error assertion
│       ├── mapper.ts     # ElementModel + dataset + RBAC → TestCase intents
│       ├── locator.ts    # priority chain → Playwright locator source
│       ├── manifest.ts   # TestCase[] → tests/generated/manifest.json (eval enabler)
│       ├── stats.ts      # pure: mean/CI/Mann-Whitney U/rank-biserial/Fleiss κ
│       ├── metrics.ts    # pure: five-family computeMetrics (coverage/SUT/faults/quality/reliability)
│       ├── eval/         # runner.ts + faults.ts + report.ts + playwright.ts + baseline-static.ts
│       └── emit/         # ts.ts + js.ts — TestCase → spec source (+ manifest via index.ts)
├── crawl/                # runtime output: admin.json, user.json, ...
├── tests/generated/      # runtime output: auth/, crud/, rbac/ specs + manifest.json
├── tests/manual/         # hand-written baseline suites (blade/, inertia/) for the eval comparison
├── tests/baseline-public/
│   └── saucedemo/        # 3 public MIT Playwright suites (git submodules, pinned SHA)
│       ├── SOURCES.md    # provenance, license, SHA record — cite in paper
│       └── playwright.config.ts  # standalone wrapper (chromium, saucedemo.com, no storageState)
├── metrics/              # runtime output: report.json + report.md (tt eval)
├── playwright.config.ts  # 3 browser projects + per-role storageState
├── tathya.config.yaml    # gitignored (has creds) — see tathya.config.example.yaml
├── tathya.saucedemo.config.yaml   # SauceDemo eval subject (creds are public, can commit)
└── docs/
    └── implementation-plan.md
```

---

## Build and run commands

### Case study (Laravel — Phase 1)

Always run PHP commands inside `nix-shell`.

```bash
# Blade target at http://127.0.0.1:8000
nix-shell case-study/todo-blade/shell.nix
cd case-study/todo-blade
composer install
php artisan migrate --seed
php artisan serve

# React/Inertia target at http://127.0.0.1:8001
nix-shell case-study/todo-inertia-react/shell.nix
cd case-study/todo-inertia-react
composer install
npm install && npm run build
php artisan migrate --seed
php artisan serve --port=8001
```

Seeded credentials: `admin@example.com` / `password` and `user@example.com` / `password`.

### TypeScript generator and crawler

```bash
cd generator
npm install
npm run build                  # tsc → dist/
npm run typecheck              # tsc --noEmit (no build)
npm test                       # vitest unit tests
```

The `tt` binary lives at `generator/bin/tt`. Link it for global use:
```bash
npm link    # makes `tt` available in PATH
```

Repo-level build and verification are also available through `make`:
```bash
make install                   # build and link tt into the active Node/bin path
make uninstall                 # remove installed tt binary
make verify                    # runs checks and smokes the compiled tt entrypoint
```

If your shell resolves `tt` through `asdf`, `make install` refreshes that asdf-managed binary as
well so the active shim does not keep an older version.

### Full pipeline (once everything is built)

```bash
tt init                        # interactive wizard → infers login fields and writes tathya.config.yaml
tt crawl                       # crawl per role → crawl/{role}.json
tt generate                    # refresh crawl if needed, then generate specs → tests/generated/
tt run                         # npx playwright test
tt all                         # crawl → generate → run
tt eval                        # instrumented run → metrics/report.{json,md}
npx playwright show-report
```

### Metric-based evaluation (`tt eval`)

`tt eval` produces the quantitative evaluation (publication target). It reads
`evaluation.stacks` (per case study: config + baseUrl + coverage source), and per stack:
times crawl/generate, runs the generated suite `evaluation.repeat` times for CI + flake, runs the
hand-written `tests/manual/<stack>` baseline, collects SUT coverage, and injects each fault in the
catalogue. It writes `metrics/report.json` + `report.md` with five metric families:

1. **Coverage** (RQ1) — element/route/CRUD/RBAC-matrix/constraint-kind, tier counts.
2. **SUT code coverage** (RQ2) — PCOV line/branch-proxy/function + exact route coverage.
3. **Fault detection** (RQ3) — mutation score per class + fault-localization accuracy.
4. **Test-suite quality** (RQ4) — assertion density, locator mix, brittle-locator ratio.
5. **Reliability/efficiency/baseline** (RQ5) — flake, Fleiss κ, time mean ± 95% CI,
   generated-vs-manual Mann-Whitney U + effect size.

Faults are seeded in the case studies via `FaultRegistry` (toggled by `POST /__testing/fault`);
the fault id catalogue lives in `generator/src/eval/faults.ts`. Coverage needs PCOV
(`COVERAGE=1` + `all.pcov` in `shell.nix`) and is read via `GET /__testing/coverage`.

**SauceDemo evaluation subject** (`tathya.saucedemo.config.yaml`): a third subject — a React SPA
on an external public server — is evaluated for **generalizability**. Because we cannot instrument
a third-party app, SUT coverage (RQ2) and fault injection (RQ3) are **not applicable** for this
stack (set `coverage: none` and `faults: false` in the stack config). Families A, D, and E run
normally. The EQ5 baseline for SauceDemo comes from three independent MIT-licensed GitHub Playwright
suites stored as pinned git submodules in `tests/baseline-public/saucedemo/`. Run
`make baseline-init` once to clone them. A **static quality comparison** (test count, assertion
density, brittle-locator ratio, locator mix) is always produced from spec source analysis even if
the public suites are not executed; the dynamic Mann-Whitney U comparison requires a green run.

### Playwright (direct)

```bash
npx playwright install         # install browser binaries (once)
npx playwright test            # run generated specs
npx playwright test --ui       # interactive UI mode
```

---

## Technology stack conventions

### TypeScript (`generator/`)

- Strict TypeScript: `"strict": true`, no `any`, no `@ts-ignore`.
- Zod schema in `src/config.ts` is the authoritative validator — update it first when the
  config shape changes, then update the consuming code.
- `src/crawl.ts` types and zod schema are the crawl contract. Keep
  `src/extract/rendered.ts` output synchronized with it.
- `fieldgen.ts` is pure (no I/O). It returns `FieldVariant[]` and the valid `FieldValue` union
  (`literal` | `runtime` faker expr | `ref` to a confirmation source). Unit-tested, no Playwright.
- `faker.ts`, `stats.ts`, and `metrics.ts` are pure (no I/O, no Playwright). `faker.ts` returns a
  runtime `@faker-js/faker` **expression string** emitted into the spec — faker never runs at
  generation time. `stats.ts`/`metrics.ts` take already-loaded data → report objects.
- `eval/` does all I/O for `tt eval` (process spawning, HTTP control, file writes); keep the
  computation in `metrics.ts`/`stats.ts`. `eval/playwright.ts`'s `parsePlaywrightJson` is pure.
- `oracle.ts` is pure. It returns assertion code strings, not Playwright calls.
- `mapper.ts` must never read files or spawn processes — it receives already-loaded data.
- `emit/ts.ts` and `emit/js.ts` must produce syntactically valid Playwright specs. Run
  `tsc --noEmit` against emitted TS to verify before calling generation "done".
- Generated specs go in `tests/generated/`. Never manually edit files in that directory —
  they are overwritten on every `tt generate`.
- Use `@clack/prompts` for all interactive prompts in `init.ts`. No `readline` or `inquirer`.

### PHP / Laravel (`case-study/todo-blade/`, `case-study/todo-inertia-react/`)

- The case study is a **test target**, not production code. Prioritise clarity over elegance.
- Use `<x-input-error :messages="$errors->get('field')" />` for all validation error display
  so the default `oracle.errorSelector` (`.text-red-600, [role=alert]`) works out of the box.
- In React/Inertia pages, render validation errors with `[role=alert]` or `.text-red-600`.
- Use `@method('PUT')` / `@method('DELETE')` in every edit/delete form so the crawler
  reads the hidden `_method` input to classify CRUD operations.
- In React/Inertia pages, keep real `form` metadata (`action`, `method`, field `name`, hidden
  `_method`) so the crawler can extract the same contract.
- Name form inputs consistently with the migration column names — the generator maps
  `data.fields[name]` to fill values by the field `name` attribute.
- Add `data-testid` attributes to key elements only where stable locators are otherwise
  impossible — but don't add them everywhere; the locator chain handles most cases.

---

## The element-model contract (DO NOT break)

Every change to the `crawl.json` schema must be coordinated across **two** files:
1. `generator/src/crawl.ts` — TypeScript types and zod validator
2. `generator/src/extract/rendered.ts` — Playwright crawler output (must match the schema)

Schema version is tracked by the `"engine"` field. Add a `"schemaVersion"` field if a
breaking change is needed, and update all three places atomically.

---

## Locator priority chain (enforce everywhere)

When computing `locator.strategy` + `locator.value`, always follow this order:

1. `data-testid` → `{ strategy: "testid", value: "<value>" }`
2. Accessible role + name → `{ strategy: "role", value: "<role>:<name>" }`
3. `<label for>` or wrapping `<label>` → `{ strategy: "label", value: "<label text>" }`
4. `placeholder` → `{ strategy: "placeholder", value: "<placeholder>" }`
5. Stable `id` (not hashed/generated) → `{ strategy: "id", value: "<id>" }`
6. `name` attribute → `{ strategy: "name", value: "<name>" }`
7. CSS path (last resort, no `nth-child`, no hashed class) → `{ strategy: "css", value: "..." }`

Breaking this order produces brittle tests. Never use positional selectors.

---

## Coverage spectrum rules (enforce in mapper.ts + fieldgen.ts)

| Tier | Condition | What to emit |
|------|-----------|--------------|
| `positive` | always | valid login, CRUD happy path, authorized nav, RBAC role reaches its routes |
| `negative` | `coverage: negative\|all` | wrong password, required-empty, format violation, pattern-fail, length/range ±1, RBAC blocked route, duplicate unique, confirmation mismatch; use `data.requiredFields` to force blank negatives for missed fields |
| `edge` | `coverage: edge\|all` | boundary-exact, very-long (10×maxlength), unicode, leading/trailing whitespace, omit optional fields |

- Each variant = one titled test: `"<page> <form> — <field> <variant> → <outcome>"`.
- Negative tests must assert error **state** (error element visible OR `validity.valid===false`),
  never exact message text.
- `oracle.ts` branches on `form.noValidate`: `true` → DOM error via `oracle.errorSelector`;
  `false` → `toHaveJSProperty('validity.valid', false)`.
- Edge payloads are robustness-only (graceful/no-500); no injection or XSS probes.

---

## What NOT to do

- Do not manually edit anything under `crawl/`, `tests/generated/` (incl. `manifest.json`), or
  `metrics/` — all are runtime outputs. `tests/manual/` is hand-written and IS edited by hand.
- Do not call `@faker-js/faker` at generation time. `faker.ts` returns an expression string that
  runs inside the emitted spec (fresh per run, seedable via `data.faker.seed`).
- Keep `eval/faults.ts` fault ids in sync with the `FaultRegistry` toggles in both case studies —
  a fault whose id has no PHP toggle is silently un-killable.
- Do not add error handling for cases that cannot happen (e.g. null-check a value guaranteed
  by the zod schema).
- Do not call `process.exit` inside library code — throw errors and let `cli.ts` handle exit.
- Do not use `eval` or `Function()` in the emitters — build spec strings with template literals.
- Do not add Playwright assertions for exact error message text — the copy is unknowable at
  generation time and changes with i18n.
- Do not run `php artisan` commands outside `nix-shell` — PHP is not available globally.
- Do not commit `tathya.config.yaml` (has credentials) — only `tathya.config.example.yaml`.
---

## Verification checklist (run before marking any phase done)

- [ ] `npm run typecheck` passes in `generator/`
- [ ] `npm test` (vitest) passes for `fieldgen`, `faker`, `oracle`, `stats`, `metrics`, `eval`
- [ ] `tt crawl` produces valid JSON at `crawl/<role>.json` for each configured role
- [ ] `tt generate` writes `tests/generated/manifest.json` (one entry per test) and a create spec
  imports `@faker-js/faker`, declares `const f_<field> = faker.…`, and asserts that variable
- [ ] `tsc --noEmit` passes against a generated `.spec.ts` file
- [ ] `npx playwright test` runs and the report shows at least one pass per spec category
  (auth, crud, rbac)
- [ ] A negative test that submits an empty required field produces a **failing** test when
  the Laravel validation is intentionally disabled (proves the oracle is real)
- [ ] `tt eval` writes `metrics/report.{json,md}`; setting `TT_FAULT=validation_title_required`
  via `POST /__testing/fault` makes the matching negative test fail (fault killed)

---

## Key files to read first (ordered)

1. `docs/implementation-plan.md` — phased build steps (Phases 0–10)
2. `AGENTS.md` — contract invariants and agent-coordination rules
3. `generator/src/crawl.ts` — the element-model contract
4. `generator/src/extract/rendered.ts` — Playwright crawler output
5. `tathya.config.example.yaml` — canonical config reference
