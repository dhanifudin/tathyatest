# Evaluating the generated suites (`tt eval`)

`tt eval` measures how good the generated tests are: how much of the app they cover, how many seeded faults they
catch, how readable and stable they are, and how they compare with hand-written suites. It is used for the research
evaluation; you do not need it to generate and run tests.

## What it does

`tt eval` runs the metric-based evaluation and writes `metrics/report.{json,md}`: model coverage,
system-under-test code coverage, fault-detection effectiveness (share of a seeded fault
catalogue the suite detects), test-suite quality, and reliability/efficiency with a hand-written baseline
comparison (`tests/manual/<stack>`). By default it evaluates the config it was pointed at as a
single stack; `--stack <name>` picks one entry of `evaluation.stacks`, and `--all-stacks` runs
the cross-stack study over the Blade and React/Inertia case studies (hours; unreachable stacks
are skipped). SUT coverage and fault injection switch on automatically when the app answers
`GET /__testing/coverage` / `POST /__testing/fault/clear` (the case studies do, with
`COVERAGE=1` and PCOV from `shell.nix`); plain apps simply get the other metric families.
Flags: `--stack`, `--all-stacks`, `--repeat`, `--no-faults`, `--no-coverage`, `--no-baseline`.

## Evaluation vocabulary

`tt eval` reports five metric groups. Older documents and code comments name them "families" (A to E) or
evaluation questions (EQ1 to EQ5); the report headings call them RQ1 to RQ5. They are the same list:

| Group | Report section | Measures |
|-------|----------------|----------|
| A | RQ1 model coverage | elements, routes, forms, fields, navigation, RBAC matrix, constraint kinds, tiers, CRUD per resource |
| B | RQ2 SUT code coverage | PCOV line, branch-proxy, function, and route coverage of the app under test |
| C | RQ3 fault detection | share of seeded faults the suite detects, per class, and localization accuracy |
| D | RQ4 test-suite quality | assertion density, locator mix, brittle-locator ratio, smells |
| E | RQ5 reliability, efficiency, baseline | flake rate, cross-browser kappa, time, throughput, comparison with the manual baseline |

The "fault-detection rate" is what older text calls the mutation score; the JSON report keeps the field
names `mutationScore` and `killed` for compatibility with existing analysis scripts. The research article
uses its own, smaller numbering and does not use this list.

## SauceDemo evaluation subject

`tathya.saucedemo.config.yaml` targets `https://www.saucedemo.com` as a third evaluation subject —
a React SPA on a different tech stack to support a generalizability claim. The credentials
(`standard_user` / `secret_sauce`) are public. Because this is an external app with no control
plane, **SUT code coverage and fault injection do not apply**; `tt eval`
reports only model coverage (A), test-suite quality (D), and reliability/efficiency/baseline (E).

The human-written baseline comes from three independent public Playwright suites
(MIT-licensed, three different authors) stored as git submodules:

```bash
make baseline-init   # git submodule update --init --recursive
```

See `tests/baseline-public/saucedemo/SOURCES.md` for provenance, license, and pinned SHAs.

The baseline can be run standalone:

```bash
npx playwright test --config=tests/baseline-public/saucedemo/playwright.config.ts
```

## Running on a small machine

Evaluate one stack at a time (`tt eval --stack blade`, then `--stack inertia`) and start only one app server at a
once. `--all-stacks` runs both and can take hours; use `make clean-outputs` to reset generated reports.
