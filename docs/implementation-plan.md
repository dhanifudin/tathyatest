# TathyaTest — Implementation Plan (Incremental, Ordered Steps)

> Historical note: this document records the original multi-engine prototype plan. The current
> implementation has since been refactored to a single Playwright crawler in `generator/`; the
> Go `crawler/` module and `tt-crawler` binary are no longer part of the active architecture.

Automated Playwright test-case generator for functional testing of MVC web apps. It crawls a
target site (per RBAC role), extracts a normalized element model, and generates Playwright specs
covering the **positive → negative → edge** spectrum, then executes them cross-browser.

**Pipeline:** `input URL → crawl (per role) → extract element model → map (+ dataset + RBAC matrix)
→ generate specs → execute (Chromium/Firefox/WebKit) → Pass/Fail report`.

**Binary:** user-facing CLI `tt` (`tathyatest`); subcommands `init`, `crawl`, `generate`, `run`,
`all`. Go static engine builds to helper `tt-crawler`.

---

## Implementation Checklist

Use this checklist to track the implementation against the ordered plan. Runtime output folders
(`crawl/`, `tests/generated/`, `storageState/`) remain generated artifacts and should not be
hand-edited.

### Done

- [x] Root repository layout scaffolded.
- [x] Root PHP 8.4/Composer Nix shell added (`shell.nix`, `.envrc`) and verified with direnv.
- [x] Canonical `tathya.config.example.yaml` committed; real `tathya.config.yaml` ignored.
- [x] Go static crawler module created with config loading, Laravel login, authenticated Colly crawl,
      Goquery extraction, locator descriptors, CRUD classification, and per-role JSON output.
- [x] Static crawler seeds configured `crawl.include` routes after login, so authenticated routes do
      not have to be discoverable from `/`.
- [x] Static crawler now seeds the post-login landing URL first and discovers same-origin internal
      URLs from anchors, form actions, formactions, and route-like data attributes.
- [x] TypeScript crawl contract mirror added in `generator/src/crawl.ts`.
- [x] Rendered crawler added and now seeds the post-login landing URL plus configured
      `crawl.include` routes after login.
- [x] Static crawl outputs that only contain an empty root/login page fall back to the rendered
      crawler, so JS-rendered apps such as Sauce Demo can be discovered.
- [x] Generator config validation, init wizard, RBAC diff, field variants, oracle, locator rendering,
      mapper, TS/JS emitters, and CLI commands implemented.
- [x] Root Playwright config added with per-role Chromium/Firefox/WebKit projects.
- [x] Playwright global setup added to write `storageState/<role>.json` once per configured role.
- [x] Generated auth specs opt out of role storage state so login tests exercise real login behavior.
- [x] Generated role-specific specs skip when running under the wrong role project.
- [x] Generated server-validation assertions check the source page URL after redirect-back, not the
      form action URL.
- [x] Generated maxlength/very-long value variants force DOM values when browser APIs would truncate
      input because of client-side constraints.
- [x] Laravel Breeze Blade todo case-study added with login, admin/user roles, Todo CRUD,
      admin-only users page, migrations, seeders, and Blade validation indicators.
- [x] Laravel Breeze React/Inertia TypeScript todo case-study added with matching RBAC, CRUD,
      validation, seed data, and rendered-crawler-friendly form metadata.
- [x] Separate Blade/static and Inertia/rendered config examples added.
- [x] Laravel case study dependencies installed, local `.env`/SQLite runtime files created, app key
      generated, and `php artisan migrate:fresh --seed` verified.
- [x] Static crawl verified against the live Laravel app: `crawl/admin.json` includes `/admin/users`;
      `crawl/user.json` does not.
- [x] `tt generate` verified against real crawl output; emitted TypeScript specs pass `tsc --noEmit`.
- [x] Playwright Chromium auth/RBAC smoke verified for admin and user projects.
- [x] Playwright Chromium CRUD create-form spectrum verified for the admin role.
- [x] Playwright Firefox browser binary installed and smoke verified through the root Nix shell.
- [x] Playwright WebKit GTK smoke verified under a direct Xvfb display through the root Nix shell.
- [x] Full generated CRUD suite verified across Chromium, Firefox, and WebKit with per-test DB
      reset and automatic Xvfb-backed WebKit launch.
- [x] Rendered crawler now queries Playwright ARIA snapshots to keep role/name parity with the
      browser accessibility tree.
- [x] README updated with setup, commands, config, coverage, and known gaps.
- [x] Verification run: Go build/test, generator typecheck/test/build, root Playwright config
      typecheck.

### Partial

- [x] Laravel case study uses Breeze-style auth scaffolding instead of a hand-written login/logout
      shim.
- [x] Generated CRUD specs now harden duplicate setup data, forced invalid select injection, and
      multi-field confirmation coordination at runtime.
- [ ] RBAC tests assert status/redirect state but do not yet assert richer redirect/403 UI behavior.
- [ ] WebKit headless WPE launch resolves libraries after wrapper patching, but still cannot create a
      WPE EGL display on this host; use GTK WebKit under Xvfb for now.

### Remaining

- [x] Run rendered crawl and compare schema shape with static crawl.
- [x] Verify Laravel login with feature tests for both seeded roles.
- [x] Run broader CRUD suites for update/delete workflows after adding per-test data isolation.
- [x] Add a first-class WebKit/Xvfb runner path for `tt run` or fix headless WPE EGL initialization.
- [x] Run `tt run` / `npx playwright test --reporter=list` across Chromium, Firefox, and WebKit.
- [x] Stop the Laravel server and confirm generated specs fail, proving they are not vacuous.
- [x] Add focused tests for crawler include seeding, emitted auth storage-state opt-out, and global
      setup config parsing.
- [x] Harden locator inference and CSS fallback selection in both crawl engines.

---

## Phase 0 — Repository layout & prerequisites

0.1. Confirm toolchain: Node 24 (global), Go (for crawler), PHP 8.4 + Composer via
     `nix-shell` (global `php-init 8.4` writes `shell.nix`).

0.2. Target repo layout:
```
tt/
├── case-study/todo-blade/          # Laravel Breeze Blade todo app
├── case-study/todo-inertia-react/  # Laravel Breeze React/Inertia TS todo app
├── crawler/             # Go module — STATIC engine, builds to `tt-crawler`
├── generator/           # TypeScript — tt CLI, rendered engine, generator
├── crawl/               # per-role crawl outputs: admin.json, user.json
├── tests/generated/     # emitted specs: auth/, forms/, interactions/, rbac/
├── playwright.config.ts
├── tathya.config.yaml
└── docs/
```

---

## Phase 1 — Scaffold the Laravel case study (with RBAC roles)

1.1. `cd case-study/todo-blade` and `php-init 8.4 pdo_sqlite,sqlite3,dom,...` (already generated
     `shell.nix` + `.envrc`).

1.2. Inside `nix-shell`: `composer create-project laravel/laravel .`; configure `.env` for SQLite
     (`DB_CONNECTION=sqlite`, touch `database/database.sqlite`).

1.3. Add Laravel **Breeze (Blade stack)** for server-rendered auth (`composer require laravel/breeze
     --dev && php artisan breeze:install blade`); `npm install && npm run build`.

1.4. Add RBAC: migration adding a `role` column to `users` (`admin` | `user`); a `role`/`is_admin`
     middleware; register it on routes.

1.5. Build the Todo domain: `Todo` model + migration (e.g. `title` required maxlength:255, `body`
     nullable, `due_date` date, `done` boolean) + resource controller + Blade CRUD views using
     `@method('PUT')` / `@method('DELETE')` and Breeze's `<x-input-error>` for validation display.

1.6. Add an **admin-only module** (e.g. `/admin/users` route behind the role middleware) so the
     RBAC access-matrix tests have a real asymmetry to assert.

1.7. Add server-side validation in a `StoreTodoRequest`/`UpdateTodoRequest` (required, max, date,
     plus a `unique` field somewhere to exercise the unique-negative path).

1.8. Seeders: `admin@example.com` and `user@example.com` (both password `password`) + a few todos.

1.9. Verify: `php artisan migrate --seed && php artisan serve` → app at `http://127.0.0.1:8000`;
     both users log in; admin reaches `/admin/users`, user is redirected/403.

---

## Phase 2 — Config schema (`tathya.config.yaml`)

2.1. Define the canonical config shape (consumed by both engines + generator):
```yaml
baseUrl: http://127.0.0.1:8000
extractor:
  engine: static            # static (Go/Goquery) | rendered (Playwright)
output:
  dir: tests/generated
  language: ts              # ts | js
coverage: all               # positive | negative | edge | all
oracle:
  errorSelector: ".invalid-feedback, [role=alert], .text-red-600"   # Breeze default
auth:
  loginPath: /login
  roles:
    - { name: admin, username: admin@example.com, password: password }
    - { name: user,  username: user@example.com,  password: password }
crawl:
  maxDepth: 3
  maxPages: 100
  include: []               # optional explicit seed paths; app routes are discovered from DOM links/forms
  exclude: []
data:
  fields:   { title: "Buy groceries", body: "Milk, eggs, bread" }
  defaults: { text: "Sample", email: "user@example.com", number: "1" }
  unique:   [email]         # generate duplicate-value negatives for these fields
  duplicates: { email: "existing@example.com" } # seeded duplicate values for negative cases
  confirmFields: []         # extra confirmation pairs (auto-detects *_confirmation)
```

2.2. Provide a committed `tathya.config.example.yaml`; keep the real one (with creds) gitignored.

---

## Phase 3 — The element-model contract (`crawl/<role>.json`)

3.1. Define the shared contract — produced identically by both engines, one file per role:
```jsonc
{
  "baseUrl": "...", "engine": "static", "role": "admin", "crawledAt": "...",
  "pages": [{
    "url": "/todos", "title": "Todos",
    "forms": [{
      "action": "/todos", "method": "POST", "crudOp": "create", "noValidate": false,
      "fields": [{
        "name": "title", "type": "text", "label": "Title", "required": true,
        "constraints": { "minlength": null, "maxlength": 255, "min": null, "max": null,
                         "step": null, "pattern": null, "inputmode": null, "accept": null },
        "options": null, "nameHints": [],
        "locator": { "strategy": "label", "value": "Title" }
      }],
      "submit": { "text": "Create", "locator": { "strategy": "role", "value": "button:Create" } }
    }],
    "links": [...], "buttons": [...], "tables": [...]
  }]
}
```

3.2. **Laravel CRUD classification:** read hidden `<input name="_method" value="PUT|DELETE">` to set
     `crudOp` (create/update/delete).

3.3. **Locator priority chain:** `data-testid` → `getByRole(name)` → `getByLabel` →
     `getByPlaceholder` → stable `#id` → `name` → CSS (last resort). Never `nth-child`/hashed classes.

---

## Phase 4 — Go static engine (`crawler/` → `tt-crawler`)

4.1. `go mod init`; deps: `gocolly/colly/v2`, `PuerkitoBio/goquery`, `gopkg.in/yaml.v3`.

4.2. `internal/config`: load `tathya.config.yaml` into shared structs.

4.3. `internal/auth`: Laravel login per role — GET login page, read `_token` via Goquery, POST
     credentials, retain the session cookie jar.

4.4. `internal/crawl`: Colly BFS with the authenticated jar; same-origin; honor `maxDepth`,
     `maxPages`, `include`/`exclude`.

4.5. `internal/extract`: Goquery → contract, capturing forms (`action`/`method`/`crudOp`/
     `noValidate`), **full field constraints**, `nameHints`, labels, links, buttons, tables, and
     computed locators.

4.6. `internal/model` + `main.go`: write `crawl/<role>.json` for each role; build to `tt-crawler`.

---

## Phase 5 — Rendered engine (`generator/src/extract/rendered.ts`)

5.1. Playwright logs in per role; BFS-crawls the **live DOM**.

5.2. Read the same constraints + accessibility tree (computed role/name) + `aria-invalid`.

5.3. Emit the **identical** `crawl/<role>.json` contract (so downstream is engine-agnostic).

---

## Phase 6 — Generator (`generator/`, TypeScript)

6.1. `package.json` + `tsconfig.json`; deps: `@playwright/test`, `@clack/prompts`, `commander`,
     `zod`, `yaml`, `@faker-js/faker`.

6.2. `src/config.ts`: load + zod-validate config (incl. `auth.roles[]`).

6.3. `src/init.ts`: interactive **`tt init`** wizard (`@clack/prompts`) — prompt project name,
     URL/domain, crawler engine, login path, credentials, and generated Playwright language;
     infer login controls from the login page; create the slugged project directory; write
     `tathya.config.yaml` and `tests/generated/` inside it.

6.4. `src/crawl.ts`: per-role crawl loader + dispatcher (static → shell `tt-crawler`; rendered →
     `extract/rendered.ts`).

6.5. `src/rbac.ts`: diff per-role crawls into a matrix `route → { reachableBy: [roles] }`.

6.6. `src/fieldgen.ts`: from constraints + `data.unique`/`duplicates`/`confirmFields`, produce **labeled value
     variants** — valid, empty (required), bad-format (type), pattern-fail, length ±1, range ±1,
     invalid-option, duplicate (unique), confirmation-mismatch, robustness (long/unicode/whitespace).

6.7. `src/oracle.ts`: `noValidate`-aware error assertion — DOM error via `oracle.errorSelector`
     when server-validated, else `validity.valid === false`. Assert error **state**, never copy.

6.8. `src/locator.ts`: render a locator descriptor → Playwright locator source.

6.9. `src/mapper.ts`: combine element model + dataset + RBAC matrix → `TestCase` intents across
     **positive / negative / edge** and **RBAC positive / negative**, filtered by `coverage`.

6.10. `src/emit/ts.ts` + `src/emit/js.ts`: `TestCase` → `@playwright/test` spec source; one titled
      test per variant; write into `tests/generated/{auth,forms,interactions,rbac}/` in `output.language`.

---

## Phase 7 — Test coverage spectrum (what step 6 must emit)

7.1. **Positive:** per-role login; CRUD create/update/delete with valid data; authorized nav;
     RBAC role reaches its own routes.

7.2. **Negative (auto from attributes):** wrong-password login; required-empty; format violation;
     pattern-fail; length/range boundary ±1; forced invalid select option; RBAC role blocked from
     another role's route (redirect/403). Use `data.requiredFields` to force blank negatives when
     the crawl misses a required field.

7.3. **Negative (server-only via config hints):** duplicate `data.unique`/`duplicates` value; `*_confirmation`
     mismatch. Custom `Rule::`/closures are a documented gap (not auto-derived).

7.4. **Edge (input-robustness only):** boundary-exact length, very-long, unicode, whitespace,
     omitted optional → assert graceful handling (no 500). No injection/XSS probes.

---

## Phase 8 — Playwright execution + orchestration

8.1. Root `playwright.config.ts`: projects chromium/firefox/webkit; `baseURL`; per-role global
     setup → `storageState/<role>.json` (login once, reuse).

8.2. `tt run` wraps `npx playwright test` → HTML report (Pass/Fail).

8.3. `tt all` runs the full pipeline: crawl (per role) → generate → run.

8.4. `generator/bin/tt` + `src/cli.ts` (commander): wire `init | crawl | generate | run | all`.

---

## Phase 9 — Verification (end-to-end)

9.1. **Target up:** `cd case-study/todo-blade && nix-shell --run "php artisan migrate --seed && php artisan serve"`
     → admin/user log in; admin reaches `/admin/users`, user blocked.

9.2. **Wizard:** `tt init` → answer prompts (project name, URL, engine, login path, add admin +
     user, generated language) → `<project>/tathya.config.yaml` written with `auth.roles[]`,
     inferred login controls, and `<project>/tests/generated/` created.

9.3. **Static crawl:** `tt crawl` → inspect `crawl/admin.json` & `crawl/user.json`; admin includes
     `/admin/users`, user does not; create form shows full constraints + `crudOp` on edit/delete.

9.4. **Rendered parity:** set `extractor.engine: rendered`; `tt crawl` → same-shape per-role files;
     diff vs static to confirm contract parity.

9.5. **Generate:** `tt generate` → `tests/generated/{auth,forms,interactions,rbac}/`; each form yields
     positive + negative + edge specs, and crawled links/buttons yield interaction specs;
     `coverage: positive` drops negatives/edges; flip `output.language` ts↔js → both valid.

9.6. **Execute:** `tt run` across all browsers → positives pass; negatives pass by detecting the
     error state (empty `title` → Breeze error; bad email rejected); RBAC admin-can / user-blocked.
     `npx playwright show-report`.

9.7. **Failure sanity:** stop the Laravel server, re-run → specs fail with clear errors (tests
     assert real behavior, not vacuously passing).

---

## Phase 10 — Docs

10.1. `README.md`: setup (nix-shell, npm), the `tt` commands, the engine switch, config reference,
      coverage toggle, and the documented gaps (custom server rules; security/injection out of scope).

---

## Phase 11 — Runtime faker + metric-based evaluation (`tt eval`)

11.1. **Runtime faker for valid fills.** `faker.ts` (pure) maps a field → a runtime
      `@faker-js/faker` expression string. `fieldgen.ts` exports `FieldValue`
      (`literal` | `runtime` | `ref`); `validFieldValue` makes valid fills runtime (unique fields
      get a uniqueness suffix), confirmation fields `ref` their source. `mapper.ts` threads
      `Record<string, FieldValue>`; the negative/edge **target** field stays a deterministic literal.
      `emit/ts.ts` declares `const f_<field> = <expr>` and asserts that variable on create/update.
      Config gains `data.faker { locale, seed }`; `init.ts` prompts for them.

11.2. **Test manifest.** `emit/index.ts` writes `tests/generated/manifest.json` (one entry per test:
      category, tier, role, route, targetField, constraintKind, assertionCount, locatorStrategy,
      faultClass) via the pure `manifest.ts` — the enabler for coverage/quality metrics.

11.3. **Pure metric core.** `stats.ts` (mean, 95% CI, Mann-Whitney U, rank-biserial, Fleiss κ) and
      `metrics.ts` (`computeMetrics` over five families: model coverage, SUT code coverage, fault
      detection, test-suite quality, reliability/efficiency + baseline). Unit-tested with fixtures.

11.4. **Eval orchestration.** `eval/faults.ts` (fault catalogue + relevance predicates),
      `eval/playwright.ts` (`runPlaywrightJson` + pure `parsePlaywrightJson`), `eval/runner.ts`
      (per-stack: timed crawl/generate, R repeat runs, baseline, coverage, fault loop),
      `eval/report.ts` (JSON + Markdown + cross-stack table). `cli.ts` adds `tt eval`. Config gains
      the `evaluation` block (`stacks`, `repeat`, `manualBaselineSecPerCase`, `baselineDir`,
      `faults`, `faultProject`).

11.5. **Case-study instrumentation (both stacks).** PCOV in `shell.nix`; `CoverageMiddleware` +
      `CoverageCollector` (line/function/branch-proxy/route coverage via PCOV + token analysis);
      `FaultRegistry` with `TT_FAULT` toggles in `StoreTodoRequest`/`UpdateTodoRequest`/`EnsureRole`/
      `TodoController`/`Auth/LoginRequest`; HTTP control plane (`/__testing/fault`,
      `/__testing/coverage`). Hand-written baseline suites in `tests/manual/{blade,inertia}`.

---

## Out of scope (this prototype)
Non-functional testing, mobile, CI/CD, AI-assisted mapping (later roadmap years); multi-app dataset
(Kompen/Jayanti/Whistleblower) — todo only; security/injection probes (input-robustness edges only);
custom Laravel validation rules beyond `data.unique`/`duplicates`/`confirmFields` hints.
