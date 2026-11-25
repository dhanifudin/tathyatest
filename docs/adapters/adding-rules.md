# Adding rules to the IR adapter layer

This guide shows how to add a test-generation rule so that **both** output frameworks (Playwright and Cypress,
and any later adapter) get it. You write the rule once; the user picks the output with `--framework`.

Read [ir-migration-report.md](ir-migration-report.md) first if you want to know where every existing rule lives.

## 1. The mental model

```
crawl/<role>.json
      │
      ▼
generate/            GENERATION RULES — which tests exist
(fieldgen, mapper,   field variants, CRUD cases, RBAC matrix, faker expressions, titles
 faker, rbac, …)
      │  TestCase[]          (generate/test-case.ts)
      ▼
ir/build.ts          SCENARIO RULES — how each test runs
ir/layout.ts         steps, fill strategy, oracle choice, skip conditions, step titles, files, tags
      │  TestPlan[]  = the IR (ir/types.ts): plain data, no framework syntax
      ▼
adapters/<framework>/emitter.ts   RENDERING — framework syntax only, no decisions
adapters/<framework>/templates/   runtime helpers (login, oracles) in that framework
adapters/<framework>/runner.ts    running, tag filters, result parsing
```

Three rules of thumb:

- **A decision belongs above the IR.** If you find yourself writing `if (variant.name === …)` in an emitter, move
  it to `ir/build.ts` and express the outcome as IR data.
- **The IR says what, not how.** A member such as `{ type: 'native-invalid', target }` names an observable state,
  not an API call.
- **Every IR union is rendered exhaustively.** Each emitter `switch`es over `Step`, `Fill` and `Oracle` and ends with
  `assertNever(...)`. A new member therefore **fails `tsc`** until every adapter renders it. Treat a compile error
  in an emitter as your to-do list.

## 2. Pick the layer

| You want to … | Layer | Files you touch | Adapter work? |
|---|---|---|---|
| test a new field constraint or input value (e.g. a new negative variant) | generation | `generate/fieldgen.ts` (+ `mapper.ts` if it needs a filter) | none, if an existing fill and oracle fit |
| change *how* an existing kind of test runs (another oracle for a case, a different fill for a variant) | scenario | `ir/build.ts` | none, if the IR members already exist |
| check a new kind of state, or act in a new way | IR vocabulary | `ir/types.ts`, `ir/build.ts`, **every** emitter and template | yes, one renderer per adapter |
| support a new framework | adapter | `adapters/<new>/…`, `adapters/registry.ts`, `adapters/types.ts` | it *is* the adapter |

## 3. Recipe A: a new generation rule (no adapter work)

Example: a negative variant that submits an email address with a trailing dot (`user@example.com.`).

1. **Add the variant** in `generator/src/generate/fieldgen.ts`, next to the other `type` negatives:

   ```ts
   if (field.type === 'email') {
     variants.push({ kind: 'negative', name: 'email-trailing-dot', value: 'user@example.com.', outcome: 'error' });
   }
   ```

   A variant is pure data: a name, a deterministic literal value (never faker: the target field of a negative
   stays literal, see AGENTS.md), and an outcome (`success`, `error` or `graceful`).
2. **Classify it for the manifest**: `constraintKindFor` in `generate/manifest.ts` maps a variant name to its
   constraint kind. The name does not end in `-format`, so add `if (variantName === 'email-trailing-dot') return 'type';`.
3. **Give it a readable title**: `humanVariant` in `generate/titles.ts` phrases each variant
   (`… rejects an empty value`). Titles must stay globally unique; the manifest joins on them.
4. **Skip it where it cannot be observed**: if the browser blocks the value before submit on a form without
   `novalidate`, add the name to `NATIVELY_UNFALSIFIABLE_VARIANTS` in `generate/mapper.ts`.
5. **Nothing else.** `ir/build.ts` already turns an `error` outcome into `server-error` or `native-invalid`, and
   fills a literal with `Fill type`. Both emitters already render those. The new test appears in Playwright and in
   Cypress with the same title, tags and step titles.
6. **Test it**: add a case to `test/generate/fieldgen.test.ts`, then regenerate and review the golden files
   (section 7). The golden diff shows the new test in `test/fixtures/golden/**` *and* `test/fixtures/golden-cypress/**`.
7. Add the row to the variant table in `docs/how-it-works.md`.

## 4. Recipe B: a new scenario rule with existing IR members

Example: today the `whitespace` edge variant (a value padded with spaces) only checks that the page has no server
error. Suppose it should also prove the value was saved, by finding the echoed text on the page.

1. Change the decision in `formOracles` (`generator/src/ir/build.ts`), before the `graceful` branch:

   ```ts
   const representative = representativeTextValue(testCase);
   if (testCase.variant.name === 'whitespace' && representative) {
     return [{ type: 'text-visible', value: representative }];
   }
   if (testCase.variant.outcome === 'graceful') return [{ type: 'body-graceful' }];
   ```

   `text-visible` already exists in the IR, so this is a pure decision change.

2. Keep the manifest in step. If the number of assertions of a test changes, update `formAssertionCount` in
   `generate/manifest.ts`. `test/adapters/conformance.test.ts` fails until IR assertion counts and manifest counts
   agree again.
3. Add or adjust a case in `test/ir/build.test.ts`. That test runs without any framework installed.
4. Regenerate the golden files and review both directories.

No emitter changes: both adapters already render `text-visible`.

## 5. Recipe C: a new IR member (new oracle, fill or step)

Example: after a native-validation failure, also check that the browser **focused the invalid field**. That is a
new observable state, so it needs a new oracle `field-focused`.

### Step 1: declare it in the IR (`generator/src/ir/types.ts`)

```ts
export type Oracle =
  | …
  /** The browser moved focus to the field whose constraint failed. */
  | { type: 'field-focused'; target: Locator };
```

Name the state, not an API. Keep the payload to what any framework needs: here, the crawled locator.

### Step 2: decide when it applies (`generator/src/ir/build.ts`)

```ts
export function errorOracle(form: Form, field: Field, errorSelector: string, expectedPath?: string, variantName?: string): Oracle[] {
  if (form.noValidate || !nativelyObservable(field, variantName)) return [{ type: 'server-error', … }];
  return [{ type: 'native-invalid', target: field.locator }, { type: 'field-focused', target: field.locator }];
}
```

`errorOracle` now returns a list, so its caller in `formOracles` spreads it (`return errorOracle(…)` in place of
`return [errorOracle(…)]`), and `test/ir/oracle.test.ts` expects arrays. Then `npm run typecheck` fails in **both**
emitters:

```
src/adapters/playwright/emitter.ts: Argument of type '{ type: "field-focused"; … }' is not assignable to parameter of type 'never'.
src/adapters/cypress/emitter.ts:    Argument of type '{ type: "field-focused"; … }' is not assignable to parameter of type 'never'.
```

### Step 3: render it in every adapter

Playwright, `oracleSource` in `generator/src/adapters/playwright/emitter.ts`:

```ts
case 'field-focused':
  return `await expect(${locatorSource(oracle.target)}).toBeFocused();`;
```

Cypress, `oracleSource` in `generator/src/adapters/cypress/emitter.ts`, plus a helper in the Cypress template
(the spec stays one readable call; the helper also gets imported automatically when it is used, because the
emitter derives the import list from the `HELPERS` array):

```ts
case 'field-focused':
  return `expectFocused(${locatorSource(oracle.target)});`;
```

```ts
// generator/src/adapters/cypress/templates/tathya.ts
export function expectFocused(locator: Loc): void {
  cy.tt(locator).first().should('have.focus');
}
```

and add `'expectFocused'` to `HELPERS` in the Cypress emitter.

Runtime logic that is longer than one line belongs in the adapter's template (`templates/support.ts` for
Playwright, `templates/tathya.ts` for Cypress), never inline in the IR or in the builder. Both templates are real
TypeScript and are typechecked (`npm run typecheck` covers `tsconfig.cypress.json`).

### Step 4: keep the invariants

- **No message text.** An oracle checks state (visibility, validity, URL, focus), never the wording of an error.
- **Assertion count.** A new oracle adds an assertion to some tests. Update `generate/manifest.ts`
  (`formAssertionCount` or `hasLandingAssertion`), and if one oracle stands for several manifest assertions, its
  weight in `test/adapters/conformance.test.ts`.
- **Locator chain.** Use the crawled `Locator` from the IR; never build positional selectors.
- **Same step titles.** Titles live in the IR (`Step.title`); an emitter must not invent its own.

### Step 5: tests and docs

- `test/ir/build.test.ts`: when the builder emits the new member.
- `test/adapters/playwright/emitter.test.ts`: a `toContain` check of the rendered line, if useful.
- Regenerate the golden files (section 7) and review both directories.
- Document the rule in `docs/how-it-works.md` and add a row to the tables in `ir-migration-report.md`.

New **fills** (`Fill`) and **steps** (`Step`) follow the same five steps. A step that hands a value to a later step
(like the status of a navigation) declares a named capture in the IR (see `Capture`). Playwright renders it as a
`const`, Cypress as an alias (`@response`).

## 6. Recipe D: a new framework adapter

1. Add the id to `FRAMEWORKS` in `generator/src/adapters/types.ts`. `config.ts` (`output.framework`) and the
   `--framework` CLI option accept it from then on.
2. Create `generator/src/adapters/<id>/` with:
   - `emitter.ts`, a `SpecEmitter` whose `files(plans, config)` returns every file (specs plus support modules)
     keyed by path. Copy the structure of an existing emitter: group by `plan.file`, then `plan.role`, then
     `plan.formGroup`; render `Step`, `Fill` and `Oracle` with exhaustive switches.
   - `templates/` and `support.ts` for the runtime helpers, pinned from the config the way
     `adapters/cypress/support.ts` does it.
   - `runner.ts`, a `TestRunner`: `run`, `runJson` (one `SuiteRun` outcome per test and project
     `<role>-<browser>`, other roles' tests as `skipped`), `showReport`, `specFile`, `configFileName`,
     `staticAnalysis`.
3. Register it with one line in `generator/src/adapters/registry.ts`.
4. Add a root scaffold (the framework's config file) that reads `TATHYA_CONFIG` and `TATHYA_TESTDIR`, like
   `playwright.config.ts` and `cypress.config.ts`.
5. Add the framework to the `frameworks` list of `test/golden.test.ts`. The conformance suite
   (`test/adapters/conformance.test.ts`) runs over `FRAMEWORKS` automatically. Add a tsconfig for its templates if
   they need other global types, and wire it into `npm run typecheck`.
6. Update `copy-templates.mjs` (the build copies template sources into `dist`) and `tt init`'s framework prompt.

## 7. Regenerating and reviewing the golden files

The golden test pins the complete output for the recorded Blade and SauceDemo crawls, per framework.

```bash
cd generator
npm test                                              # fails and shows the diff after a deliberate change
UPDATE_GOLDEN=1 npx vitest run test/golden.test.ts    # rewrites test/fixtures/golden and golden-cypress
git diff test/fixtures                                # review: only the tests your rule should touch changed
npm run typecheck && npm run lint && npm test         # the emitted Cypress golden is typechecked too
```

A behavior-preserving refactor must pass **without** regenerating. If `test/fixtures/golden/` changes when you did
not intend to change Playwright output, the refactor changed a rule.

## 8. Checklist

- [ ] The decision sits in `generate/` or `ir/build.ts`, never in an emitter.
- [ ] New IR members are rendered by every adapter (`tsc` is green).
- [ ] No assertion on message text; locators come from the crawl; titles unique; tags unchanged.
- [ ] Manifest `assertionCount` matches the IR (conformance test green).
- [ ] Faker stays a runtime expression (`Step declare`); the target value of a negative or edge variant is a literal.
- [ ] Golden diff reviewed for both frameworks; `npm run typecheck && npm run lint && npm test` pass.
- [ ] `docs/how-it-works.md` and `ir-migration-report.md` updated.
