# PRD 4: Cypress adapter

Status: Draft. Depends on: PRD 1, 2, 3.

## Problem

Teams that already use Cypress cannot adopt TathyaTest output. The Cypress adapter generates
`*.cy.ts` specs from the same scenario plans and runs and evaluates them with the same metrics.
Cypress is not a re-skin of Playwright: it has a command queue instead of `async/await`, no
projects, no navigation `Response`, and different locator semantics. This document fixes the
design decisions so implementers do not have to rediscover them.

## Goals

1. Full parity with the Playwright adapter: five spec categories, three tiers, per-role sessions,
   read-only mode, `tt eval` metric families, cross-browser agreement, fault runs, baseline comparison.
2. Same test titles, tags, step names, and assertion counts as the Playwright output.

## Non-goals

- A Cypress crawler, component testing, or Cypress Cloud features.
- Multi-tab or `cy.origin` flows. Login and links are same-origin, as the generator already assumes (`linkLandingPath` returns null for other origins).

## Capability mapping

| Capability | Playwright (today) | Cypress (decision) |
|------------|--------------------|--------------------|
| Spec file | `*.spec.ts`, `async ({ page, app })` | `*.cy.ts`, `function () {}` callbacks (so `this.skip()` works) |
| Steps | `await test.step(title, fn)` | no step API: emit `cy.log('[step] title')` and keep the title in a comment; values pass through aliases or `.then` |
| Tags and annotations | `{ tag, annotation }` details, `--grep` | `@cypress/grep` tags in test config (`{ tags: [...] }`); annotations become a trailing comment |
| Read/write filter | `--grep-invert @write` | `--env grepTags=-@write` (and `-@read`) |
| Role gate | project `<role>-<browser>` plus `test.skip(({ role }) => ...)` | `before(function () { if (Cypress.env('role') !== 'admin') this.skip(); })`; tests in other roles report as pending (skipped), matching R3.4 |
| Sessions | `storageState` from global setup | `cy.session(role, () => uiLogin(role), { validate, cacheAcrossSpecs: true })` in a `loginAs` custom command |
| Logged-out specs | `test.use({ storageState: empty })` | rely on test isolation (default since Cypress 12) and never call `loginAs`; explicit `cy.clearAllCookies()` for safety |
| Navigation status | `const response = await page.goto(url)` | `cy.request({ url, failOnStatusCode: false, followRedirect: true })` captured in an alias (`@nav`), then `cy.visit(url, { failOnStatusCode: false })`; oracles read `@nav` |
| Runtime skip | `test.skip(await target.count() === 0 || !visible, why)` | `cy.get('body').then($b => { if ($b.find(sel).length === 0) this.skip(); })`; `cy.get` fails on absence, so never use it for the probe |
| Network idle | `waitForLoadState('networkidle')` | none: rely on retried assertions; for redirects use `cy.location('pathname', { timeout }).should(fn)` |
| URL assertions | `expect(page).toHaveURL(fn \| RegExp)` | `cy.location().should(loc => expect(loc.pathname).to.eq(p))`, `cy.url().should('match', re)` |
| Locators | `getByTestId/Role/Label/Placeholder`, `locator` | `cy.get('[data-testid=...]')`, `cy.findByRole`, `cy.findByLabelText`, `cy.findByPlaceholderText` (dependency `@testing-library/cypress`), `cy.get('#id')`, `cy.get('[name=...]')`, CSS |
| Uniqueness | `.first()`, `.nth(n)`, scoping with a Locator | `.first()`, `.eq(n)`, `cy.get(formSel).within(() => ...)` |
| Fill | `fill`, `check`, `setChecked`, `selectOption` | `.clear().type(v, { parseSpecialCharSequences: false })`, `.check()/.uncheck()`, `.select(v)`; very long values via `.invoke('val', v).trigger('input')` |
| Empty fill | `fill('')` | `.clear()` |
| Forced values | `locator.evaluate(el => ...)` | `.then($el => { ... })` (same page context, simpler) |
| File upload | `setInputFiles({ name, mimeType, buffer })` | `.selectFile({ contents: Cypress.Buffer.from(...), fileName, mimeType })`; clearing a selection via `.then($el => { $el[0].value = '' })` |
| Dialogs | `page.once('dialog', d => d.accept())` | Cypress auto-accepts `confirm`; add `cy.on('window:confirm', () => true)` for clarity |
| Force click | `click({ force: true })` | `click({ force: true })` |
| Form submit | `form.evaluate(el => el.requestSubmit())` | `cy.get(form).then($f => $f[0].requestSubmit())` |
| Validity oracle | `toHaveJSProperty('validity.valid', false)` | `.then($el => expect($el[0].validity.valid).to.eq(false))` |
| API call | `page.request.fetch(reset)` | `cy.request({ method, url })` (shares the cookie jar) |
| Faker seed | `test.beforeAll(() => faker.seed(n))` | `before(() => { faker.seed(n); })`; `@faker-js/faker` must be resolvable by the preprocessor |
| Retries | none configured | `retries: { runMode: 0, openMode: 0 }` (flake metrics need raw outcomes) |
| Browsers | projects chromium, firefox, webkit | `cypress run --browser chrome\|firefox\|webkit`; WebKit needs `experimentalWebKitSupport: true` and Playwright's WebKit installed |
| Reporter | JSON reporter, joined by leaf title | Module API (see "Result mapping") |

## Generated files

```
tests/generated/
  auth/login.cy.ts
  forms/<slug>.cy.ts  interactions/<slug>.cy.ts  pagination/<slug>.cy.ts  rbac/<slug>.cy.ts
  support/e2e.ts            # custom commands: loginAs, ensureLoggedIn, resetData, oracles
  support/tathya.ts         # shared helper functions (same names as the Playwright support module)
  manifest.json
cypress.config.ts           # scaffold, written once, not overwritten if edited
cypress/run-json.mjs        # runner script that calls cypress.run and writes normalized JSON
```

Illustrative output of one negative form test (shape only):

```ts
import { loginAs, expectValidityFalse } from '../support/tathya';

describe('admin · /todos/create', function () {
  before(function () { if (Cypress.env('role') !== 'admin') this.skip(); });
  describe('"Create" form → POST /todos', function () {
    it('admin · /todos/create · "Create" form → POST /todos · title rejects an empty value',
       { tags: ['@negative', '@crud', '@role:admin', '@write'] }, function () {
      loginAs('admin');                                        // cy.session under the hood
      cy.log('[step] Open /todos/create'); cy.visit('/todos/create');
      cy.log('[step] Fill the form');      cy.findByLabelText('Title', { exact: true }).clear();
      cy.log('[step] Submit');             cy.findByRole('button', { name: 'Create' }).click();
      expectValidityFalse(cy.findByLabelText('Title', { exact: true }));
    });
  });
});
```

## Result mapping

Use a small Node script (`cypress/run-json.mjs`) that calls the Module API `cypress.run({ browser, env, spec })`
and writes `SuiteRun`. For each `runs[].tests[]` entry: `title = test.title.at(-1)` (the leaf), `status`
from `state` (`passed` to passed, `failed` to failed, `pending` or `skipped` to skipped), `durationMs`
from the last attempt's wall-clock duration, `project = projectName(role, browser)`. The adapter runs
one invocation per `(role, browser)` pair and merges the results. This is decision D3 in PRD 7; the
alternative (mocha JSON reporter) loses attempt data.

## Requirements

- R4.1 The emitter MUST produce no `await`, `async`, or Playwright import; all values cross commands via aliases or `.then`.
- R4.2 Every test MUST be a `function () {}` callback so `this.skip()` is available.
- R4.3 `loginAs(role)` MUST use `cy.session` with a `validate` that revisits a protected path and fails if the login form shows; session setup MUST use the same login-control inference as Playwright (port `inferLoginControls` to `cy.document().then(...)`; the pure core is `login.ts: inferLoginControlsFromHtml`).
- R4.4 Navigation oracles (`route-allowed`, `route-blocked`, `route-inferred`, `no-server-error` with status) MUST obtain the status from `cy.request` with `failOnStatusCode:false`, and MUST NOT trigger side effects (GET only, no mutation).
- R4.5 Absence probes MUST use `cy.get('body').then(...)` or `.should('not.exist')`; `cy.get(sel)` on a possibly absent element is forbidden in probes.
- R4.6 `role` and `label` locator strategies MUST use `@testing-library/cypress` with `testIdAttribute: 'data-testid'`; if the plugin is missing, `tt generate` MUST fail with an install hint.
- R4.7 Because Playwright records `role:name` from its ARIA snapshot and Testing Library computes names differently, the conformance run (PRD 6) MUST report the share of `role` locators that fail to resolve on the case studies; target is at most 2 percent, and any miss SHOULD fall back to the `label` or `name` strategy recorded in the contract.
- R4.8 Tags MUST be registered through `@cypress/grep`; `@read` and `@write` filtering MUST give the same test sets as Playwright.
- R4.9 `cypress.config.ts` MUST set `video: false`, `screenshotOnRunFailure: false` (configurable), `retries` to 0, `baseUrl` from the tt config, and `specPattern` for the generated directory.
- R4.10 Read-only mode MUST reuse the cached session, call no reset hook, and assert each page is up (status below 400) before exercising it.
- R4.11 Unsupported browsers (WebKit when the experimental flag or Playwright WebKit is missing) MUST be detected before the run and reported as an error, never as test failures.
- R4.12 Spec files MUST be valid TypeScript under the project's `tsconfig` with `types: ["cypress", "@testing-library/cypress"]`.

## Known gaps and chosen workarounds

| Gap | Workaround | Residual risk |
|-----|------------|---------------|
| No navigation `Response` | `cy.request` probe before `cy.visit` | one extra GET; stateful GETs unsupported |
| Accessible-name differences | fall back to `label` or `name` locator | few mismatches; measured in conformance |
| No `networkidle` | retried assertions, `cy.location` waits | slower failures on very slow pages |
| `selectFile` cannot clear | set `value=''` via `.then` | framework-handled change events must be triggered manually |
| WebKit experimental | marked experimental in docs and report | kappa with WebKit may be unavailable |
| `cy.session` caching across specs | `cacheAcrossSpecs: true` | stale session after `hooks.reset` that deletes users; call `Cypress.session.clearAllSavedSessions()` after reset when users are re-seeded |

## Dependencies to pin (versions chosen at implementation time, at least two weeks old)

`cypress`, `@cypress/grep`, `@testing-library/cypress`, `@faker-js/faker`, `typescript`. Record exact
versions in `docs/prd/07-implementation-roadmap.md` when M4 starts.

## Open questions

1. Does `this.skip()` work reliably after Cypress commands in the targeted version for all runtime-skip points? Verify in the M4 spike before committing to the emitter shape.
2. Should `cy.request` probing be replaced by `cy.intercept` on the document request to avoid the extra GET? Measure on the case studies in M4.

## Acceptance checklist

- [ ] All five spec categories emit for Blade, Inertia React, and SauceDemo crawls and typecheck.
- [ ] Titles, tags, and per-test assertion counts equal the manifest.
- [ ] `tt run` and `tt eval` complete on both Laravel case studies with Chrome and Firefox; WebKit documented as experimental or working.
- [ ] Read-only mode selects the same tests as Playwright.
- [ ] Parity thresholds from PRD 6 are met.
