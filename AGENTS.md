# AGENTS.md — TathyaTest (tt)

Coordination guide for AI agents working on this codebase. Read this before writing any code.
Each section describes an invariant or decision rule an agent must respect regardless of the
specific task it has been given.

---

## Project in one paragraph

TathyaTest generates Playwright test specs automatically for any web app with a login form —
server-rendered or SPA; the generator assumes no framework (the Laravel case studies are evaluation
subjects). It crawls a target web app once per RBAC role using the Playwright crawler, extracts a
normalized element model, maps it against a dataset and an access-control matrix, and emits
Playwright `@playwright/test` specs covering the positive → negative → edge spectrum. The
generated specs are then executed cross-browser (Chromium, Firefox, WebKit) to produce a
Pass/Fail report. The user-facing binary is `tt`; its subcommands are `init`, `crawl`,
`generate`, `run`, `all`, and `eval` (metric-based evaluation → `metrics/report.{json,md}`).

---

## Component map and ownership

| Directory | What it owns | What it must NOT do |
|-----------|--------------|---------------------|
| `generator/src/cli/` | `tt` commands (`cli.ts`), entry (`main.ts`), `init.ts` wizard | Business logic beyond dispatch |
| `generator/src/config.ts` | zod config schema and loader (authoritative) | Anything but parsing and defaults |
| `generator/src/crawl/` | crawl contract (`model.ts`), crawl orchestration (`crawl.ts`), Playwright crawler (`session.ts`, `dom-extract.ts`, `a11y-merge.ts`), `crud.ts` classifier, `reachability.ts` | Run tests, generate specs |
| `generator/src/auth/` | login-control inference from HTML (`login.ts`) and its Playwright runtime (`login-runtime.ts`) | Crawl, generate |
| `generator/src/generate/` | pure generation logic: `mapper.ts` (+ `test-case.ts`, `titles.ts`, `pagination-labels.ts`), `fieldgen.ts`, `faker.ts` (expression strings), `oracle.ts` (assertion strings), `locator.ts`, `rbac.ts`, `manifest.ts` | I/O, Playwright calls, running anything |
| `generator/src/emit/` | `TestCase` to spec source (`ts.ts`, `js.ts`), the generated support module (`support.ts` + `templates/support.ts`), `manifest.json` writer | Crawl, run tests, read config files |
| `generator/src/eval/` | `tt eval` orchestration (`runner.ts`), Playwright JSON parsing, fault catalogue, report, static baseline analysis, `metrics/` (pure metric math), `stats.ts` | Metric math inside `runner.ts` (delegate to `metrics/`) |
| `generator/src/util/` | shared pure helpers (paths, escaping, Playwright binary lookup) | Domain logic |
| `generator/src/pipeline.ts` | the single generate stage used by `tt generate`, `tt all`, `tt eval` | Crawling or running |
| `case-study/todo-blade/`, `case-study/todo-inertia-react/` | Laravel Breeze test targets plus the eval harness (`FaultRegistry`, `CoverageCollector`) | Tool logic of any kind |
| `crawl/` | per-role crawl output (**generated, never hand-edited**) | |
| `tests/generated/` | generated specs, support module, `manifest.json` (**generated, never hand-edited**) | |
| `tests/manual/` | hand-written baseline suites (`blade/`, `inertia/`) | |
| `tests/baseline-public/saucedemo/` | three independent MIT Playwright suites (git submodules); baseline for the SauceDemo subject, see `SOURCES.md` | |
| `metrics/`, `metrics-saucedemo/` | `tt eval` reports (**generated, never hand-edited**) | |
| `docs/prd/` | PRDs for the framework-adapter work (Cypress first). Any adapter must keep the manifest parity invariants (unique titles, tag set, assertion counts), see `docs/prd/01-framework-adapters-architecture.md` | |

---

## The one contract you must never break

`crawl/<role>.json` is the **only interface** between the crawl layer and the generate layer.
The Playwright crawler must produce this schema. The generator must consume no other
representation of the target application.

**The schema lives in two synchronized places:**

```
generator/src/crawl/model.ts        ← TypeScript types, zod validator, CRAWL_SCHEMA_VERSION
generator/src/crawl/dom-extract.ts  ← the crawler output, must emit the same shape
```

**Rule:** if you change the schema in one place, change it in both files in the same commit.
Never add fields in the crawler without mirroring them in the validator and consumers. Bump
`"schemaVersion"` (`CRAWL_SCHEMA_VERSION` in `crawl/model.ts`) when a field changes meaning or is
removed; additive fields keep the number and get a zod default.

Full schema reference:
```jsonc
{
  "baseUrl": "string",
  "schemaVersion": 2,            // contract version; v1 files carried "engine" instead (dropped on load)
  "role": "string",              // role name from config.auth.roles[].name
  "crawledAt": "ISO8601 string",
  "pages": [{
    "url": "string",             // path only, e.g. "/todos"
    "title": "string",
    "forms": [{
      "action": "string",
      "method": "GET | POST",    // HTTP method of the form element
      "crudOp": "create | update | delete | logout | unknown",  // see src/crawl/crud.ts classifyCrudOp
      "noValidate": "boolean",   // form[novalidate] attribute
      "fields": [{
        "name": "string",
        "type": "string",        // input[type]
        "label": "string | null",
        "required": "boolean",
        "constraints": {
          "minlength": "number | null",
          "maxlength": "number | null",
          "min": "string | null",
          "max": "string | null",
          "step": "string | null",
          "pattern": "string | null",
          "inputmode": "string | null",
          "accept": "string | null"
        },
        "options": "[{ value, label }] | null",  // select/radio/checkbox
        "nameHints": "string[]",   // e.g. ["confirmation"] from *_confirmation suffix
        "locator": { "strategy": "testid|role|label|placeholder|id|name|css", "value": "string" }
      }],
      "submit": { "text": "string | null", "locator": { "strategy": "...", "value": "..." } }
    }],
    "links": [{ "href": "string", "text": "string", "locator": {...} }],
    "buttons": [{ "text": "string", "locator": {...} }],
    "tables": [{ "headers": "string[]", "rowCount": "number" }]
  }]
}
```

---

## RBAC crawl invariant

The crawler MUST crawl once per role in `config.auth.roles[]` and write one file per role
to `crawl/<role-name>.json`. Never merge role crawls into a single file. The generator reads
all `crawl/*.json` files and produces the access matrix by diffing them.

**Access matrix rule:** a route belongs to role R's positive set if and only if it appears
in `crawl/<R>.json`. A route that appears for role A but not role B is automatically a
negative authorization test for role B (expect redirect/403).

---

## Fault-injection invariant (`tt eval`)

The fault catalogue in `generator/src/eval/faults.ts` is the source of truth for which faults the
evaluator seeds. **Every fault `id` MUST have a matching toggle in both case studies' `FaultRegistry`
consumers** (`StoreTodoRequest`, `UpdateTodoRequest`, `EnsureRole`, `TodoController`,
`Auth/LoginRequest`). A fault whose id is not honoured by the app is un-killable and silently
deflates the fault-detection rate. Activation is HTTP-only: `POST /__testing/fault {id}` /
`POST /__testing/fault/clear` (env-gated, CSRF-exempt). Each fault's `relevant(entry)` predicate
selects the manifest tests that should detect it; the fault counts as *detected* if any relevant test fails (the JSON report keeps the historical field names `killed` and `mutationScore`).

**SauceDemo external subject scope:** `tathya.saucedemo.config.yaml` targets an external app.
Set `faults: false` and `coverage: none` in its stack config. Fault injection and SUT coverage
(SUT coverage and fault injection, evaluation families B and C) **do not apply** and must not be attempted. Only Families A, D, E run.
The baseline for the SauceDemo subject is `tests/baseline-public/saucedemo/` (git submodules, MIT). A static quality
comparison (`baseline-static.ts`) always runs from spec sources; the dynamic Mann-Whitney U run
requires the public suites to be installed (`make baseline-init`) and green.

**Faker invariant:** valid create/update fills are runtime faker (`FieldValue.runtime`); the
**target field of a negative/edge variant stays a deterministic literal** so the flake/consistency
metric is not polluted by random data. Never call faker at generation time — `faker.ts` returns an
expression string emitted into the spec.

---

## Locator priority chain (enforce everywhere)

All locator computations — in both the rendered extractor and `locator.ts`
— must follow this exact priority order. Breaking it produces brittle generated tests.

```
1. data-testid           →  strategy: "testid"
2. ARIA role + name      →  strategy: "role"
3. <label> text          →  strategy: "label"
4. placeholder           →  strategy: "placeholder"
5. stable #id            →  strategy: "id"
6. name attribute        →  strategy: "name"
7. CSS (no nth-child,    →  strategy: "css"
        no hashed class)
```

Never output `nth-child`, positional pseudo-selectors, or Tailwind/hash-suffixed class names
as locators. If none of the above yields a stable selector, emit `strategy: "css"` with the
most specific stable ancestor + element tag.

---

## Coverage spectrum (what the generator must emit per `config.coverage`)

An agent working on `fieldgen.ts`, `mapper.ts`, or `emit/` must produce test cases for
every tier that `config.coverage` enables. Default is `all`.

**Positive** (always):
- Valid login per role
- CRUD create / update / delete with valid dataset values
- Authorized navigation: each role visits a route it can reach

**Negative** (`coverage: negative | all`):
- Wrong-password login → stays on login + error visible
- Required field submitted empty → error indicator visible
- `type` format violated (email, url, tel only; `number` and date-like inputs are sanitised by the browser) → error
- `pattern` regex violated → error
- `minlength`/`maxlength` violated by ±1 character → error
- `min`/`max`/`step` out of range by ±1 → error
- `<select>` / radio with invalid option (forced via JS override) → error
- Duplicate value for a `data.unique` field → error
- `*_confirmation` field mismatch (or `data.confirmFields`) → error
- RBAC: role B visits a route only reachable by role A → redirect or 403

**Edge** (`coverage: edge | all`):
- Boundary-exact length (exactly `maxlength` characters) → success
- Very long string (10× `maxlength` or 10 000 chars when no limit) → no 500, handled
- Unicode: emoji, RTL, CJK → no 500, handled
- Leading/trailing whitespace in text fields → no 500, handled
- All optional fields omitted → no 500, form accepts

**Constraints:**
- Assert error **state** (element visible, field `:invalid`), never exact message text.
- Edge payloads are robustness-only. No `<script>`, `'--`, `OR 1=1`, or injection strings.
- One titled test per variant, phrased as a scenario: `"<role> · <page> · \"<submit>\" form → <METHOD> <action> · <field> rejects an empty value"` — see `humanVariant` in `mapper.ts`; titles must stay globally unique (the manifest joins on them).

---

## Error oracle rules (`oracle.ts`)

The oracle code `oracle.ts` returns must branch on `form.noValidate`:

```
noValidate === true   → server re-renders with errors
                        assert: oracle.errorSelector is visible near the field
                                AND current URL is the form URL (redirect back)

noValidate === false  → HTML5 native validation prevents submit
                        assert: input.validity.valid === false  (via toHaveJSProperty)
                                OR input matches :invalid
```

Never generate an assertion for a specific error message string. Generate an assertion that
an error **indicator** is present. The built-in default selector list lives in `generator/src/config.ts` (`oracle.errorSelector`);
the case-study configs use `.invalid-feedback, [role=alert], .text-red-600, x-input-error p`.

---

## Agent task boundaries (multi-agent coordination)

When multiple agents work in parallel, respect these ownership boundaries to avoid conflicts:

| Agent task | Files it may write | Files it must read-only |
|---|---|---|
| Build the crawler | `generator/src/crawl/{session,dom-extract,a11y-merge}.ts` | `generator/src/crawl/model.ts` (schema) |
| Build generator logic | `generator/src/{generate,emit}/**` | `generator/src/crawl/model.ts`, `crawl/*.json` |
| Build CLI/init | `generator/src/cli/**`, `generator/src/config.ts`, `generator/bin/tt` | generator src |
| Build case study | `case-study/todo-blade/**`, `case-study/todo-inertia-react/**` | nothing in `generator/` |
| Write playwright config | `playwright.config.ts` | `generator/src/config.ts` |

**Never write to `crawl/` or `tests/generated/`** — those are runtime outputs produced by
`tt crawl` and `tt generate`. Hand-editing them will be overwritten.

---

## Verification an agent must run before declaring a task done

Agents must not claim a component is complete without running its verification. Minimum bar:

### After touching `generator/`:
```bash
cd generator
npm run typecheck               # tsc --noEmit, zero errors
npm test                        # vitest, all tests pass
```
For emitter changes: run `tt generate` against a real crawl output and verify the emitted
`.spec.ts` passes `tsc --noEmit`.

### After touching `case-study/todo-blade/` or `case-study/todo-inertia-react/`:
```bash
# inside nix-shell:
php artisan migrate:fresh --seed
php artisan test                # Laravel feature tests
php artisan serve &
curl -s http://127.0.0.1:8000 | grep -i "login"   # app responds
```

For `case-study/todo-inertia-react/`, also run:
```bash
npm install
npm run build
```

### After any cross-layer change (schema, config shape):
Run the full pipeline end-to-end:
```bash
tt crawl && tt generate && npx playwright test --reporter=list
```
All specs must produce at least one pass. No spec may vacuously pass (stop the Laravel server
and confirm the same specs now fail).

---

## Documented gaps (do not attempt to auto-derive these)

The following are known limitations of the first prototype, intentionally out of scope:

- **Custom Laravel validation rules** (`Rule::`, closures, FormRequest with complex logic) —
  not visible in HTML; covered only by `data.unique`/`confirmFields` config hints.
- **Closed or hidden flows** that the Playwright crawler cannot discover from authenticated DOM links,
  forms, buttons, or configured seeds.
- **Security/injection testing** — out of scope; `edge` payloads are robustness-only.
- **Non-functional testing** (performance, load, security audits) — out of scope.
- **Mobile/native apps** — out of scope.
- **Pre-authentication flows** (registration, forgot/reset password, email verification) — the
  crawler logs in first and only walks the authenticated surface; only the login form itself is
  exercised (valid, wrong password, logout).
- **Cross-field and conditional validation** (date ranges, "required when X is set", totals) —
  not expressible as per-field HTML constraints; the generator emits one field variant at a time.
- **Malformed values for `number`/date-like/`color` inputs** — browsers sanitise them to empty
  before submission (and Playwright refuses to type them), so there is no format negative for
  those types; `required-empty`, `min`/`max` and `step` cover them instead.

Do not add features to address these gaps without explicit instruction. Document any new gap
discovered in this file under this section.

---

## Config change protocol

When `tathya.config.yaml`'s schema changes:
1. Update the zod schema in `generator/src/config.ts` first.
2. Update the example and per-stack configs (`tathya.config.example.yaml`, `tathya.blade.config.yaml`,
   `tathya.inertia-react.config.yaml`).
3. Update the `generator/src/cli/init.ts` wizard prompts to collect the new field.
4. Update the configuration notes in `README.md` and this file if the change affects a contract.

The config now also carries `data.faker { locale, seed }` (runtime create-data) and an
`evaluation` block (`stacks`, `repeat`, `manualBaselineSecPerCase`, `baselineDir`, `faults`,
`faultProject`) consumed by `tt eval`.
