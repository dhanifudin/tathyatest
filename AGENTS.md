# AGENTS.md — TathyaTest (tt)

Coordination guide for AI agents working on this codebase. Read this before writing any code.
Each section describes an invariant or decision rule an agent must respect regardless of the
specific task it has been given.

---

## Project in one paragraph

TathyaTest generates Playwright test specs automatically. It crawls a target web app once per
RBAC role (using either a Go static crawler or a Playwright rendered crawler), extracts a
normalized element model, maps it against a dataset and an access-control matrix, and emits
Playwright `@playwright/test` specs covering the positive → negative → edge spectrum. The
generated specs are then executed cross-browser (Chromium, Firefox, WebKit) to produce a
Pass/Fail report. The user-facing binary is `tt`; its subcommands are `init`, `crawl`,
`generate`, `run`, `all`.

---

## Component map and ownership

| Directory | Language | What it owns | What it must NOT do |
|-----------|----------|--------------|---------------------|
| `crawler/` | Go | Static HTTP crawl + HTML extraction → `crawl/<role>.json` | Run a browser, generate specs, read specs |
| `generator/src/extract/rendered.ts` | TypeScript | Playwright DOM crawl → `crawl/<role>.json` | Run tests, generate specs |
| `generator/src/init.ts` | TypeScript | Interactive wizard → `tathya.config.yaml` | Crawl, generate, run |
| `generator/src/rbac.ts` | TypeScript | Diff per-role crawls → access matrix | I/O beyond reading `crawl/*.json` |
| `generator/src/fieldgen.ts` | TypeScript | Constraints → value variants | I/O of any kind (pure function) |
| `generator/src/oracle.ts` | TypeScript | Return assertion code strings | Playwright calls, I/O (pure function) |
| `generator/src/mapper.ts` | TypeScript | Element model + RBAC + dataset → TestCase intents | I/O, Playwright, emitting source |
| `generator/src/emit/` | TypeScript | TestCase → `.spec.ts`/`.spec.js` source strings | Crawl, run tests, read config |
| `generator/src/cli.ts` | TypeScript | Wire subcommands, orchestrate pipeline | Business logic beyond dispatch |
| `case-study/todo-blade/` | PHP/Laravel | Breeze Blade test target application | Tool logic of any kind |
| `case-study/todo-inertia-react/` | PHP/Laravel + React | Breeze React/Inertia test target application | Tool logic of any kind |
| `crawl/` | JSON (runtime) | Per-role crawl output — **generated, never hand-edited** | — |
| `tests/generated/` | TS/JS (runtime) | Generated specs — **generated, never hand-edited** | — |

---

## The one contract you must never break

`crawl/<role>.json` is the **only interface** between the crawl layer and the generate layer.
Both engines (Go static, TS rendered) must produce the identical schema. The generator must
consume no other representation of the target application.

**The schema is defined in three synchronized places:**

```
crawler/internal/model/   ← Go structs (authoritative source for static engine)
generator/src/crawl.ts    ← TypeScript types (authoritative source for generator)
generator/src/extract/rendered.ts  ← must emit the same shape
```

**Rule:** if you change the schema in one place, change it in all three in the same commit.
Never add fields in one place without mirroring them in the others. Use `"schemaVersion"` in
the JSON root if a breaking change is unavoidable, and update all consumers.

Full schema reference:
```jsonc
{
  "baseUrl": "string",
  "engine": "static | rendered",
  "role": "string",              // role name from config.auth.roles[].name
  "crawledAt": "ISO8601 string",
  "pages": [{
    "url": "string",             // path only, e.g. "/todos"
    "title": "string",
    "forms": [{
      "action": "string",
      "method": "GET | POST",    // HTTP method of the form element
      "crudOp": "create | update | delete | unknown",  // derived from _method input
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

## Locator priority chain (enforce everywhere)

All locator computations — in both the Go extractor, the rendered extractor, and `locator.ts`
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
- `type` format violated (email, url, number, tel) → error
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
- One titled test per variant: `"<page> <form> — <field> <variant> → <outcome>"`.

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
an error **indicator** is present. The Breeze default oracle selector is:
`.invalid-feedback, [role=alert], .text-red-600, x-input-error p`.

---

## Agent task boundaries (multi-agent coordination)

When multiple agents work in parallel, respect these ownership boundaries to avoid conflicts:

| Agent task | Files it may write | Files it must read-only |
|---|---|---|
| Build Go crawler | `crawler/**` | `crawler/internal/model/` → sync to `generator/src/crawl.ts` |
| Build rendered engine | `generator/src/extract/rendered.ts` | `crawler/internal/model/` (schema) |
| Build generator logic | `generator/src/{fieldgen,oracle,mapper,locator,rbac,emit}/**` | `generator/src/crawl.ts`, `crawl/*.json` |
| Build CLI/init | `generator/src/{cli,init,config}.ts`, `generator/bin/tt` | generator src |
| Build case study | `case-study/todo-blade/**`, `case-study/todo-inertia-react/**` | nothing in `crawler/` or `generator/` |
| Write playwright config | `playwright.config.ts` | `generator/src/config.ts` |

**Never write to `crawl/` or `tests/generated/`** — those are runtime outputs produced by
`tt crawl` and `tt generate`. Hand-editing them will be overwritten.

---

## Verification an agent must run before declaring a task done

Agents must not claim a component is complete without running its verification. Minimum bar:

### After touching `crawler/`:
```bash
cd crawler && go build ./...    # must succeed
go test ./...                   # must pass
```
Manually inspect one `crawl/<role>.json` to confirm schema matches Phase 3 of the plan.

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
- **JS-rendered forms** (Livewire, Inertia, Vue) when `engine: static` — the Go engine only
  sees server-rendered HTML; switch `engine: rendered` for these targets.
- **Security/injection testing** — out of scope; `edge` payloads are robustness-only.
- **Non-functional testing** (performance, load, security audits) — out of scope.
- **Mobile/native apps** — out of scope.

Do not add features to address these gaps without explicit instruction. Document any new gap
discovered in this file under this section.

---

## Config change protocol

When `tathya.config.yaml`'s schema changes:
1. Update the zod schema in `generator/src/config.ts` first.
2. Update `tathya.config.example.yaml`.
3. Update `init.ts` wizard prompts to collect the new field.
4. Update the Go config structs in `crawler/internal/config/` if the field is consumed there.
5. Update `CLAUDE.md` "Config shape" section and this file if the change affects a contract.
