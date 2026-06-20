# SauceDemo Public Baseline — Provenance

These independent, third-party Playwright suites serve as the human-written baseline for
TathyaTest's EQ5 (baseline comparison) evaluation against `https://www.saucedemo.com`.

Each repository is pinned to a specific commit SHA via git submodule so the comparison
is reproducible. All suites are licensed under the MIT License.

## Suites

| # | Repository | Author | License | Pinned SHA | Language | Coverage |
|---|-----------|--------|---------|-----------|----------|---------|
| 1 | [MarkJB/saucelabs-playwright](https://github.com/MarkJB/saucelabs-playwright) | Mark J. Beaumont | MIT | `b0e2331` | TypeScript | Login, inventory, cart, navigation, end-to-end |
| 2 | [paweljelonek/saucedemo-playwright-ts](https://github.com/paweljelonek/saucedemo-playwright-ts) | Paweł Jelonek | MIT | `29c2e13` | TypeScript | Login, cart, checkout, inventory, navigation, product details |
| 3 | [nettokrt/playwright-saucedemo-e2e](https://github.com/nettokrt/playwright-saucedemo-e2e) | nettokrt | MIT | `667059e` | TypeScript | Login, cart, checkout, product search/filter, bug-user edge cases |

## Running the suites

The suites share a single wrapper Playwright config (`playwright.config.ts` in this directory)
that targets `https://www.saucedemo.com` via a single Chromium project. Each suite's own
`playwright.config.ts` and `tsconfig.json` are ignored at the wrapper level.

```bash
# From the repo root — initialise submodules first:
make baseline-init

# Then install dependencies for each submodule:
(cd tests/baseline-public/saucedemo/markjb-saucelabs-playwright && npm install)
(cd tests/baseline-public/saucedemo/paweljelonek-saucedemo-playwright-ts && npm install)
(cd tests/baseline-public/saucedemo/nettokrt-playwright-saucedemo-e2e && npm install)

# Run with the wrapper config (from repo root):
npx playwright test --config=tests/baseline-public/saucedemo/playwright.config.ts
```

> **Note:** Each submodule ships its own `node_modules` install and TypeScript compilation
> path. The static quality comparison (`analyzeBaselineDir`) reads spec sources and always
> produces numbers without requiring a live run. The dynamic Mann-Whitney U comparison
> (execution duration) is best-effort and requires the suites to run green.

## Attribution

These suites are included solely for research comparison under the terms of their respective
MIT Licenses. No modifications have been made to the original source files.
