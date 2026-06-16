# CLAUDE.md — TathyaTest (tt)

Automated Playwright test-case generator for functional testing of MVC web apps.

**Pipeline:**
```
tt init  →  tt crawl  →  tt generate  →  tt run
(wizard)   (per role)    (specs out)    (Playwright)
```

Read `docs/implementation-plan.md` for the ordered build phases before making changes.
Read `AGENTS.md` for the contract invariants you must never break.

---

## Repo layout

```
tt/
├── case-study/todo-blade/          # Laravel Breeze Blade test target
├── case-study/todo-inertia-react/  # Laravel Breeze React/Inertia TS test target
├── crawler/              # Go module — static engine, builds to tt-crawler
├── generator/            # TypeScript — tt CLI + rendered engine + generator
│   ├── bin/tt            # CLI entry point
│   └── src/
│       ├── cli.ts        # commander dispatcher
│       ├── init.ts       # tt init wizard (@clack/prompts)
│       ├── config.ts     # zod-validated config loader
│       ├── crawl.ts      # per-role crawl dispatcher
│       ├── extract/
│       │   └── rendered.ts  # rendered engine (Playwright → crawl.json)
│       ├── rbac.ts       # per-role diff → access matrix
│       ├── fieldgen.ts   # constraints → value variants (positive/negative/edge)
│       ├── oracle.ts     # novalidate-aware error assertion
│       ├── mapper.ts     # ElementModel + dataset + RBAC → TestCase intents
│       ├── locator.ts    # priority chain → Playwright locator source
│       └── emit/         # ts.ts + js.ts — TestCase → spec source
├── crawl/                # runtime output: admin.json, user.json, ...
├── tests/generated/      # runtime output: auth/, crud/, rbac/ specs
├── playwright.config.ts  # 3 browser projects + per-role storageState
├── tathya.config.yaml    # gitignored (has creds) — see tathya.config.example.yaml
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

### Go static engine (Phase 4)

```bash
cd crawler
go mod tidy
go build -o ../tt-crawler .    # outputs tt-crawler at repo root
go test ./...
```

### TypeScript generator (Phases 5–8)

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
make install                   # install crawler + link tt into the active Node/bin path
make uninstall                 # remove installed tt / tt-crawler binaries
make verify                    # runs checks and smokes the compiled tt entrypoint
```

The static crawler now resolves `tt-crawler` from the local project first and then from `PATH`,
so a `go install`ed binary can be tested from other directories too.
If your shell resolves `tt` through `asdf`, `make install` refreshes that asdf-managed binary as
well so the active shim does not keep an older version.

### Full pipeline (once everything is built)

```bash
tt init                        # interactive wizard → infers login fields and writes tathya.config.yaml
tt crawl                       # crawl per role → crawl/{role}.json
tt generate                    # refresh crawl if needed, then generate specs → tests/generated/
tt run                         # npx playwright test
tt all                         # crawl → generate → run
npx playwright show-report
```

### Playwright (direct)

```bash
npx playwright install         # install browser binaries (once)
npx playwright test            # run generated specs
npx playwright test --ui       # interactive UI mode
```

---

## Technology stack conventions

### Go (`crawler/`)

- Package per concern: `internal/config`, `internal/auth`, `internal/crawl`,
  `internal/extract`, `internal/model`.
- Structs in `internal/model` are the **canonical source of truth** for `crawl.json` — keep
  them in sync with `generator/src/crawl.ts` at all times.
- Use `gopkg.in/yaml.v3` for config (not `v2`).
- Colly cookie jar must be shared between `auth` and `crawl` — do not create a new jar after
  login or the authenticated session is lost.
- Goquery selectors must read `input[name="_method"]` to classify CRUD operations.
- Every `crawl/<role>.json` gets `"engine": "static"` and `"role": "<name>"` at the top level.
- No global state — pass config + jar through function arguments.
- Errors: return `error`, never `log.Fatal` inside library functions. Fatal only in `main`.

### TypeScript (`generator/`)

- Strict TypeScript: `"strict": true`, no `any`, no `@ts-ignore`.
- Zod schema in `src/config.ts` is the authoritative validator — update it first when the
  config shape changes, then update the consuming code.
- `src/crawl.ts` types must **mirror** `internal/model` structs exactly — this is the
  Go↔TS contract. If you change one, change the other.
- `fieldgen.ts` is pure (no I/O). Each exported function takes constraints → returns
  `FieldVariant[]`. Keep it testable with vitest unit tests, no Playwright dependency.
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
- Use `@method('PUT')` / `@method('DELETE')` in every edit/delete form — the Go extractor
  reads the hidden `_method` input to classify CRUD operations.
- In React/Inertia pages, keep real `form` metadata (`action`, `method`, field `name`, hidden
  `_method`) so the rendered crawler can extract the same contract.
- Name form inputs consistently with the migration column names — the generator maps
  `data.fields[name]` to fill values by the field `name` attribute.
- Add `data-testid` attributes to key elements only where stable locators are otherwise
  impossible — but don't add them everywhere; the locator chain handles most cases.

---

## The element-model contract (DO NOT break)

Every change to the `crawl.json` schema must be coordinated across **three** files:
1. `crawler/internal/model/` — Go structs (source of truth for the static engine)
2. `generator/src/crawl.ts` — TypeScript types (mirror of the Go structs)
3. `generator/src/extract/rendered.ts` — rendered engine output (must match the schema)

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

- Do not manually edit anything under `crawl/` or `tests/generated/` — both are runtime outputs.
- Do not add error handling for cases that cannot happen (e.g. null-check a value guaranteed
  by the zod schema).
- Do not call `process.exit` inside library code — throw errors and let `cli.ts` handle exit.
- Do not use `eval` or `Function()` in the emitters — build spec strings with template literals.
- Do not add Playwright assertions for exact error message text — the copy is unknowable at
  generation time and changes with i18n.
- Do not run `php artisan` commands outside `nix-shell` — PHP is not available globally.
- Do not commit `tathya.config.yaml` (has credentials) — only `tathya.config.example.yaml`.
- Do not add browser automation to the Go crawler — it is a static HTTP fetcher only.

---

## Verification checklist (run before marking any phase done)

- [ ] `go build ./...` passes with zero warnings in `crawler/`
- [ ] `npm run typecheck` passes in `generator/`
- [ ] `npm test` (vitest) passes for `fieldgen.ts` and `oracle.ts`
- [ ] `tt crawl` produces valid JSON at `crawl/<role>.json` for each configured role
- [ ] `tsc --noEmit` passes against a generated `.spec.ts` file
- [ ] `npx playwright test` runs and the report shows at least one pass per spec category
  (auth, crud, rbac)
- [ ] A negative test that submits an empty required field produces a **failing** test when
  the Laravel validation is intentionally disabled (proves the oracle is real)

---

## Key files to read first (ordered)

1. `docs/implementation-plan.md` — phased build steps (Phases 0–10)
2. `AGENTS.md` — contract invariants and agent-coordination rules
3. `crawler/internal/model/` — the element-model contract structs
4. `generator/src/crawl.ts` — the TypeScript mirror of the contract
5. `tathya.config.example.yaml` — canonical config reference
