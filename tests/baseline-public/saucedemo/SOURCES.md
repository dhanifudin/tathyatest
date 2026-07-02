# SauceDemo Public Baseline — Provenance

These independent, third-party Playwright suites serve as the human-written baseline for
TathyaTest's EQ5 (baseline comparison) evaluation against `https://www.saucedemo.com`.

Each repository is pinned to a specific commit SHA via git submodule so the comparison
is reproducible. All suites are licensed under the MIT License.

## Suites

| # | Repository | Author | License | Pinned SHA | Language | Coverage |
|---|-----------|--------|---------|-----------|----------|---------|
| 1 | [ashutoshfolane/playwright-saucedemo](https://github.com/ashutoshfolane/playwright-saucedemo) | Ashutosh Folane | MIT | `0925c3c` | TypeScript | Login, logout, cart, checkout, inventory add/remove |
| 2 | [aferminboada/portfolio-playwright-typescript-e2e-tests-pageObjetModel-saucedemo](https://github.com/aferminboada/portfolio-playwright-typescript-e2e-tests-pageObjetModel-saucedemo) | Alejandro Fermin Boada | MIT | `5b72fe5` | TypeScript | Login, cart, checkout, inventory, navigation |
| 3 | [renanpacheco21/automation_sauceDemo_playwright](https://github.com/renanpacheco21/automation_sauceDemo_playwright) | Renan Pacheco | MIT | `51764d4` | TypeScript | Login validation, cart validation, checkout, product sorting and validation |

## Running the suites

The suites share a single wrapper Playwright config (`playwright.config.ts` in this directory)
that targets `https://www.saucedemo.com` via a single Chromium project. Each suite's own
`playwright.config.ts` and `tsconfig.json` are ignored at the wrapper level.

```bash
# From the repo root — initialise submodules first:
make baseline-init

# Then install dependencies for each submodule:
(cd tests/baseline-public/saucedemo/ashutoshfolane-playwright-saucedemo && npm install)
(cd tests/baseline-public/saucedemo/aferminboada-saucedemo-pom && npm install)
(cd tests/baseline-public/saucedemo/renanpacheco21-saucedemo-playwright && npm install)

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
