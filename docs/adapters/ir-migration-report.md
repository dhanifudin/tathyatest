# Migration report: rule logic moved into the IR adapter layer

This report compares the rule logic of TathyaTest **before** and **after** the framework-adapter refactor.
Before, the generator could only write Playwright specs, and part of its rule logic lived inside the
Playwright code generator. After, every rule decides once into a framework-neutral **Intermediate
Representation (IR)**. Two adapters, Playwright and Cypress, render that IR, and the user picks one with
`--framework playwright|cypress` (or `output.framework` in the config).

The refactor's promise is that **no rule changed**. The last section gives the evidence.

> This is a record of the migration. Rules changed afterwards (form scoping, "missing fails, hidden skips",
> stronger oracles, crawl contract v3); [../how-it-works.md](../how-it-works.md) describes the current ones.

## 1. Architecture, before and after

```
BEFORE
crawl/<role>.json ─► generate/ (fieldgen, mapper, faker, rbac …) ─► TestCase[] ─► emit/ts.ts ──► Playwright specs
                                                                                 ▲   decides steps, fills, oracles
                                                                                 └── AND writes Playwright syntax

AFTER
crawl/<role>.json ─► generate/ (unchanged) ─► TestCase[] ─► ir/build.ts ─► TestPlan[] (IR) ─┬─► adapters/playwright ─► *.spec.ts
                                                            scenario rules                    └─► adapters/cypress    ─► *.cy.ts
                                                            (decides everything)                  (only render syntax)
```

There are two rule layers, and each was handled differently:

| Layer | What it decides | Files | What happened |
|---|---|---|---|
| Generation rules | *which* tests exist: variants per field constraint, CRUD cases, RBAC matrix, faker expressions, titles | `generate/fieldgen.ts`, `mapper.ts`, `faker.ts`, `rbac.ts`, `titles.ts`, `pagination-labels.ts`, `manifest.ts`, `crawl/crud.ts` | **Unchanged and not moved.** They never contained framework code; they produce `TestCase[]`, which is the IR's input. |
| Scenario rules | *how* each test runs: steps, fill strategy per field, oracle choice, skip conditions, step titles, file layout | previously `emit/ts.ts` and `generate/oracle.ts`, mixed with Playwright syntax | **Moved** into `ir/build.ts` and `ir/layout.ts`, which produce the IR (`ir/types.ts`). The Playwright syntax that was mixed in moved to `adapters/playwright/emitter.ts`. |

### File map

| Before | After |
|---|---|
| `generator/src/emit/ts.ts` (rules + Playwright syntax) | rules → `generator/src/ir/build.ts`, `generator/src/ir/layout.ts`; syntax → `generator/src/adapters/playwright/emitter.ts` |
| `generator/src/generate/oracle.ts` | rules → `ir/build.ts` (`errorOracle`, `nativelyObservable`); assertion text → the two emitters |
| `generator/src/generate/locator.ts` | `generator/src/adapters/playwright/locator.ts` (unchanged code) |
| `generator/src/emit/support.ts`, `emit/templates/support.ts` | `generator/src/adapters/playwright/support.ts`, `adapters/playwright/templates/support.ts` (unchanged code) |
| `generator/src/eval/playwright.ts`, `util/playwright-bin.ts` | `generator/src/adapters/playwright/runner.ts`, `adapters/playwright/bin.ts` |
| `cli.ts` `runPlaywright`, `mutationFilterArgs` | `adapters/playwright/runner.ts` |
| Playwright analyser in `eval/baseline-static.ts` | `adapters/playwright/analyze.ts` `analyzeSpecSource`; `baseline-static.ts` keeps only the directory walk and aggregation |
| `emit/js.ts` (wrote a temp TS tree, then transpiled it) | `emit/js.ts` `transpileFiles` (transpiles in memory; same output) |
| (none) | new: `ir/types.ts`, `adapters/types.ts`, `adapters/registry.ts`, `adapters/cypress/*`, root `cypress.config.ts` |

## 2. Rule-by-rule comparison

Each row is one rule that existed before the refactor. The **IR** column is where the rule is decided now and
which IR member carries the decision. The two right-hand columns show how each adapter writes that member.

### 2.1 Session and navigation

| # | Rule (unchanged) | Before | After: IR builder → IR member | Playwright rendering | Cypress rendering |
|---|---|---|---|---|---|
| 1 | Every test resets data and logs in fresh; read-only runs reuse the session and never reset | `emit/ts.ts` `loginStep` | `build.ts` `loginStep` → `Step login {mode: 'reset' \| 'reuse'}` | `app.loginAs(role)` / `app.ensureLoggedIn(role)` | `loginAs(role)` (reset hook, clear cookies, UI login) / `ensureLoggedIn(role)` (`cy.session`, cached) |
| 2 | Read-only mode turns each visit into an "is up" check | `emit/ts.ts` `openSteps` | `build.ts` `openSteps` → `Step open {capture: 'opened'}` + `Oracle route-allowed {capture: 'opened'}` | `const opened = await page.goto(url)` + `expectRouteAllowed(page, opened, path)` | `openPage(url, 'opened')` (status probe + visit) + `expectRouteAllowed('@opened', path)` |
| 3 | Auth specs run logged out | `emit/ts.ts` `specSource` (`test.use(storageState: empty)`) | plan `kind: 'auth'` | `test.use({ storageState: { cookies: [], origins: [] } })` | nothing needed: Cypress test isolation starts every test without a session |
| 4 | Valid login → logged in; wrong password → rejected | `emit/ts.ts` `authTest` | `build.ts` `authSteps` → `Step login-with` + `Oracle logged-in \| login-rejected` | `performLogin(page, u, p)`, `assertLoggedIn(page)` / `assertLoginRejected(page)` | `performLogin(u, p)`, `assertLoggedIn()` / `assertLoginRejected()` |
| 5 | Logout: submit the logout form directly when its control is hidden in a menu; afterwards the protected page needs a login | `emit/ts.ts` `authTest` (logout branch) | `build.ts` `authSteps` → `Step logout {submit}` + `Oracle logged-out {path}` | inline `form.evaluate(requestSubmit)` fallback, `assertLoggedOut(page, path)` | `submitLogout(formSelector, locator)`, `assertLoggedOut(path)` |

### 2.2 Form filling

| # | Rule (unchanged) | Before (`emit/ts.ts` `fillFormSource`) | After: `build.ts` `fillPlan` → `Fill` member | Playwright rendering | Cypress rendering |
|---|---|---|---|---|---|
| 6 | Runtime faker value declared once per test, filled from a variable | `decls` + `runtimeFill` | `Step declare {name, expr}` + `Fill type {value: var}` | `const f_x = <expr>;` `.fill(f_x)` | `const f_x = <expr>;` `fillIn(loc, f_x)` |
| 7 | A `*_confirmation` field echoes its source field's value | `ref` resolution | `Fill type {value: var \| literal}` | `.fill(f_src)` | `fillIn(loc, f_src)` |
| 8 | File inputs are never typed into: upload a MIME fixture, or clear for required-empty | `field.type === 'file'` branch | `Fill upload {mimeType}` / `Fill clear-file` | `setInputFiles(uploadFixture(m))` / `setInputFiles([])` | `.selectFile(uploadFixture(m))` / `clearFile(loc)` |
| 9 | Radio: check the value; required-empty unchecks the whole group | `field.type === 'radio'` branch | `Fill check` / `Fill uncheck-radios {name}` | `.check()` / `evaluateAll(uncheck)` | `.check()` / `uncheckRadios(name)` |
| 10 | Invalid option is forced through a temporary `<option>` | `shouldForceInvalidOption` | `Fill force-option {value}` | `locator.evaluate(appendChild option)` | `forceOption(loc, value)` |
| 11 | Required-empty on a select leaves nothing selected | options + required-empty branch | `Fill clear-select` | `evaluate(selectedIndex = -1)` | `clearSelect(loc)` |
| 12 | `maxlength-plus-one` / `very-long` bypass the browser's input limit | `shouldForceValue` | `Fill force-value {value}` | `evaluate(element.value = v)` | `forceValue(loc, v)` |
| 13 | Checkbox: checked for `on`/`true` | checkbox branch | `Fill set-checked {checked}` | `.setChecked(b)` | `.check()` / `.uncheck()` |
| 14 | Select: choose the option | options branch | `Fill select-option {value}` | `.selectOption(v)` | `.select(v)` |
| 15 | Everything else: type the literal | default branch | `Fill type {value: literal}` | `.fill("v")` | `fillIn(loc, "v")` |

The branch **order** in `fillPlan` is the same as before (file, radio, forced option, cleared select, forced
value, checkbox, select, text), so a field that matched two branches still takes the first one.

### 2.3 Submitting

| # | Rule (unchanged) | Before | After | Playwright | Cypress |
|---|---|---|---|---|---|
| 16 | Submit control scoped to its form by `form[action$="…"]` (one form per table row), else the first match | `formActionSelector`, `scopedSubmitSource` | `build.ts` `formActionSelector`, `submitTargetOf` → `SubmitTarget` | `(count > 0 ? scoped : first)` expression | `submitForm(this, formSelector, locator)` |
| 17 | A hidden submit control skips the test instead of failing it | `submitClickSource` | `Step submit` | `test.skip(!isVisible, 'submit control is not visible')` | `submitForm` calls `this.skip()` when hidden |
| 18 | Delete accepts a `confirm()` dialog | `submitClickSource` (`variant.name === 'delete'`) | `Step submit {acceptDialog: true}` | `page.once('dialog', accept)` | `cy.on('window:confirm', () => true)` |
| 19 | Fieldless update form with a label is a state change: remember its text first | `isStateChangeForm` + `const before` | `Step capture-text {name: 'before'}` | `const before = await control.textContent()` | `captureSubmitText(…, 'before')` (alias `@before`) |

### 2.4 Oracles (outcome of a form)

The selection order of `formAssertion` (before) and `formOracles` (after) is identical:

| # | Condition (checked in this order) | Before (`emit/ts.ts` `formAssertion`, `generate/oracle.ts`) | After: IR oracles | Playwright | Cypress |
|---|---|---|---|---|---|
| 20 | delete form, `delete` variant | `toHaveCount(0)` on the form + graceful | `record-gone`, `body-graceful` | `expect(page.locator(form)).toHaveCount(0)`; body not 500 | `expectGone(form)`; `expectGraceful()` |
| 21 | error outcome with `novalidate`, or a constraint the field does not carry natively (`nativelyObservable`) | `errorAssertionSource` server branch | `server-error {errorSelector, urlPattern}` | error indicator visible + `toHaveURL(regex)` | `expectServerError(selector, pattern)` |
| 22 | error outcome otherwise (HTML5 validation) | `errorAssertionSource` native branch | `native-invalid {target}` | `toHaveJSProperty('validity.valid', false)` | `expectInvalid(loc)` (`validity.valid === false`) |
| 23 | graceful outcome (edge variants) | `gracefulAssertionSource` | `body-graceful` | body not matching `/500\|server error\|exception/i` | `expectGraceful()` (same regex) |
| 24 | state-change form | `expectStateFlipped` | `state-flipped {formSelector}` | `expectStateFlipped(page, form, before)` | `expectStateFlipped(form, '@before')` |
| 25 | valid GET form with submitted values (only when the `<form>` declares a `method` or an `action` attribute) | `submittedParamsSource` | `query-echo {params}` | `expectQueryEcho(page, {…})` | `expectQueryEcho({…})` |
| 26 | valid create/update with a text value to echo | `representativeTextValue` | `text-visible {value}` | `getByText(v).first()` visible | `expectTextVisible(v)` |
| 27 | anything else | graceful | `body-graceful` | as #23 | as #23 |

Step titles (`outcomeStepTitle`: "Expect a validation error", "Expect the record to be gone", …) are part of the
IR (`Step.title`) and are therefore identical in both frameworks.

### 2.5 Interactions, pagination, RBAC

| # | Rule (unchanged) | Before | After | Playwright | Cypress |
|---|---|---|---|---|---|
| 28 | Act on a crawled control, skip when absent or hidden | `interactionTest`, `paginationTest` | `Step act {target, action, skipReason}` | `test.skip(count === 0 \|\| !visible, reason)` + `target.click()` / `selectOption` | `skipUnlessVisible(this, loc, n, reason)` + `nth(loc, n).click()` / `.select()` |
| 29 | A same-origin, non-logout link must land on its path | `linkLandingPath` | `layout.ts` `linkLandingPath` → `Oracle landed {withSearch: false}` | `toHaveURL(url => url.pathname === p)` | `expectLanded(p, false)` |
| 30 | A pagination control must land on its path and query | `pathAndSearch` | `Oracle landed {withSearch: true}` | `url.pathname + url.search === p` | `expectLanded(p, true)` |
| 31 | Every interaction ends with "no server error" | literal step | `Oracle no-server-error` | `expectNoServerError(page)` | `expectNoServerError()` |
| 32 | RBAC route allowed / blocked / inferred, judged from the response status | `rbacTest` | `Step open {capture: 'response'}` + `route-allowed \| route-blocked \| route-inferred` | `const response = await page.goto()` + helper | `openPage(url, 'response')` (status via `cy.request`) + helper on `@response` |
| 33 | An affordance another role sees must have zero matches | `rbacTest` (affordance) | `Oracle absent {target}` | `toHaveCount(0)` | `expectAbsent(loc)` (`should('not.exist')`) |

### 2.6 Layout, metadata, locators

| # | Rule (unchanged) | Before | After | Playwright | Cypress |
|---|---|---|---|---|---|
| 34 | One file per category and route shape | `specPathFor`, `routeSlug` | `layout.ts` `specStemFor` → `TestPlan.file` | `<stem>.spec.ts` | `<stem>.cy.ts` |
| 35 | `describe` per role, sub-`describe` per form; role gate per group | `describeTitle`, `formGroupKey`, `formDescribeTitle` | `layout.ts` → `TestPlan.describe`, `formGroup` | `test.describe` + `test.skip(role !== r)` | `describe` + `before(() => { if (currentRole() !== r) this.skip(); })` |
| 36 | Tags `@tier @category @role:x @read\|@write` and annotations from the manifest classification | `testOptions` | `layout.ts` `tagsAndAnnotations` → `TestPlan.tags`, `annotations` | `{ tag, annotation }` | `{ tags }` (@cypress/grep) + annotation comment |
| 37 | Locator priority chain testid → role → label → placeholder → id → name → css | `generate/locator.ts` | locators stay crawl data (`Locator`) inside the IR | `getByTestId`, `getByRole`, `getByLabel(exact)`, `getByPlaceholder`, `locator('#id')`, `[name=…]`, css | `byTestId`, `byRole`, `byLabel`, `byPlaceholder`, `byId`, `byName`, `byCss` resolved by `@testing-library/dom` with Playwright's name matching (role/placeholder substring, label exact) |
| 38 | Faker runs only at test runtime, seedable | `fakerPreamble` | `Step declare` (verbatim expression) | `import { faker }` + `test.beforeAll(seed)` | `import { faker }` + `before(seed)` |

### 2.7 Running and evaluating

| # | Rule (unchanged) | Before | After (`TestRunner`) | Playwright | Cypress |
|---|---|---|---|---|---|
| 39 | `--read-only` / `--write-only` filter by tag | `cli.ts` `mutationFilterArgs` | `runner.run({mode})` | `--grep-invert @write` / `@read` | `--expose grepTags=-@write` / `-@read` |
| 40 | Project id is `<role>-<browser>`; other roles' tests are reported `skipped` | Playwright projects | `runner.runJson` | root `playwright.config.ts` projects | one Cypress run per (role × browser); role-gated tests come back `pending` → `skipped` |
| 41 | Fault runs select the relevant tests by exact title | regex built in `eval/runner.ts` | `runJson({titles})`: the runner builds the filter | escaped titles joined by `\|` (`--grep`) | `grep="t1; t2"` + `grepFilterSpecs` |
| 42 | `faultProject` restricts fault runs to one browser for every role | project names built in `eval/runner.ts` | `runJson({browsers})` | `<role>-<browser>` projects | `--browser <browser>` per role |
| 43 | Manual baseline = specs of this framework in `baselineDir`, optionally with its own config | `hasSpecs` (`*.spec.*`), `playwright.config.ts` | `runner.specFile`, `runner.configFileName` | `*.spec.(t\|j)s`, `playwright.config.ts` | `*.cy.(t\|j)s`, `cypress.config.ts` |
| 44 | Static analysis of the baseline and generated suites (every source file except the other framework's specs) | `baseline-static.ts` | `runner.staticAnalysis`, `runner.foreignSpecFile` | `analyzeSpecSource` (TypeScript AST) | `analyzeCypressSource` (regex: `it(`, `.should(`, `expect*` / `assert*` helpers, `cy.get`, `findByRole` …) |

## 3. Evidence that the existing logic did not change

1. **Byte-identical Playwright output.** `generator/test/golden.test.ts` generates the full suite from the recorded
   Blade and SauceDemo crawls and compares every file byte for byte with `test/fixtures/golden/`. It passes after
   the refactor with **no change to any fixture under `test/fixtures/golden/`** (`git diff --stat` on that directory is
   empty). Every Playwright spec, the support module and `manifest.json` are therefore exactly what the old
   emitter wrote.
2. **Moved tests, same expectations.** `test/emit/emit.test.ts` became `test/adapters/playwright/emitter.test.ts`, and
   `test/generate/locator.test.ts` became `test/adapters/playwright/locator.test.ts`. Their assertions were not edited;
   only the entry points changed (`emitTs` → `emit`, `specPathFor` → `specStemFor` + extension).
   `test/generate/oracle.test.ts` became `test/ir/oracle.test.ts` and asserts the same three branches on the IR value
   instead of on Playwright text. The generation-rule tests (`fieldgen`, `mapper`, `faker`, `rbac`, `crud`,
   `manifest`) were not touched.
3. **Assertion counts.** `test/adapters/conformance.test.ts` checks that, for every test generated from the Blade
   crawl, the number of IR oracles equals the `assertionCount` the manifest records (the manifest is still built from
   `TestCase[]` by the old `manifest.ts`). It also checks that every manifest title appears exactly once, with its
   manifest tags, in both the Playwright and the Cypress output, and that neither asserts on message text.
   (Since the migration the counts are derived from the IR by `ir/count.ts` instead of being mirrored in
   `manifest.ts`, and the conformance test compares them with the static analysis of the emitted specs.)
4. **Same results on a live app.** The same SauceDemo crawl, generated and run with both frameworks:

   | Framework | Browser | Passed | Failed | Skipped |
   |---|---|---|---|---|
   | Playwright | Chromium | 23 | 10 | 4 |
   | Cypress | Electron (Chromium) | 23 | 10 | 4 (pending) |

   The 10 failures are the same tests in both frameworks, and they come from the crawl, not from an adapter.
   Nine target a login form the live crawl recorded on `/inventory.html` that the logged-in page does not render.
   One is the GET query-echo oracle on the checkout form, which SauceDemo handles in JavaScript. The 4 skips are
   the same burger-menu controls, hidden on load. `tt eval --framework cypress --repeat 1` on the same app wrote a
   complete report (families A, D, E) with these same 10 tests listed as failing on the clean build.

## 4. Deviations from the PRDs (`docs/prd/`)

| PRD item | PRD plan | Implemented | Why |
|---|---|---|---|
| D3 / PRD 4 result mapping | a `cypress/run-json.mjs` script | the Module API `cypress.run()` called in-process by `adapters/cypress/runner.ts` | same data (leaf title, state, duration) with one file less |
| D4 / R4.6 locators | `@testing-library/cypress` commands | `@testing-library/dom` queries behind one retrying `cy.tt(locator)` query | one resolver serves retried actions, synchronous visibility probes and absence checks |
| R4.3 sessions | `cy.session` for `loginAs` | `loginAs` logs in fresh after the reset hook (like Playwright's `loginAs`); only `ensureLoggedIn` (read-only) caches with `cy.session` | a reset may re-seed users, so a cached session could be stale; this matches the Playwright behavior exactly |
| PRD 4 tag/env syntax | `--env grepTags=…`, `Cypress.env()` | `--expose grepTags=…`, `Cypress.expose('role')`, credentials via `env` + `cy.env()` | Cypress 15.10 deprecated `Cypress.env()`; @cypress/grep 7 reads `expose` |
| R5.4 | reject a `cypress:` block under `framework: playwright` | accepted and ignored | `--framework` must be able to switch one config between frameworks |
| R5.9 report labels | rows labelled `<stack>/<framework>` | Cypress rows are `<stack>/cypress`; Playwright rows keep the bare stack name | existing Playwright reports keep their row names |
| (new) settle window | — | Cypress visibility probes poll up to 2 s before skipping | a Cypress callback runs right after `load`, before a client-rendered page draws its controls; Playwright's probe round-trip hides that gap |

## 5. Known Cypress gaps

| Gap | Effect | Mitigation |
|---|---|---|
| `cy.visit` refuses non-HTML responses | a crawled route that serves JSON fails under Cypress, not Playwright | rare for crawled pages; reported as a failure, never hidden |
| Support helpers act on the first match, where Playwright locators are strict | an ambiguous locator passes in Cypress where Playwright reports a strict-mode error | the crawler's locators are unique per page in the case studies |
| WebKit is experimental in Cypress | needs `experimentalWebKitSupport` (set) and `npm install --save-dev playwright-webkit` | a missing browser is reported as an error before the run, never as failures |
| No HTML report | `tt report --framework cypress` prints a note | the `tt run` console summary is the report |
| Fault-run titles containing `;` | @cypress/grep would split them | no generated title contains `;` (`shortcut:` comment in `runner.ts`) |
| No public Cypress baseline for SauceDemo | the baseline comparison is n/a for `--framework cypress` on SauceDemo | the Laravel case studies have hand-written Cypress baselines (`tests/manual/*/baseline.cy.ts`) |
