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

## Reproducing the article evaluation

`make paper-eval` runs the protocol used in the article: it evaluates Blade, then Inertia, then SauceDemo, one
stack at a time, with `tathya.paper.config.yaml` (5 repeats, faker seed 42, fault runs on Chromium). It starts
and stops each Laravel app with `COVERAGE=1` (PCOV), so run it on an otherwise idle machine and do not mix it with the
Xdebug shell. Prerequisites: `make setup`, `make case-study-setup STACK=blade`, `make case-study-setup STACK=inertia`,
and `make baseline-init` for the public SauceDemo suites. To run one stack: `STACKS=blade make paper-eval`.

Reports are written per stack to `metrics/<stack>/report.{json,md}` and merged into `metrics/report.{json,md}`, so
running stacks one after another accumulates instead of overwriting. Every stack report starts with its
provenance: commit (and whether the tree was dirty), tool and Playwright versions, Node, host CPU and memory, and
the protocol (repeat, seed, comparison browser, server mode). Quote it when you quote a number.

### What each number measures

| Report line | Definition |
|-------------|------------|
| Route / form / field / nav coverage | against the crawl model the tool built itself (circular by construction) |
| Declared-route coverage | against `evaluation.expectedRoutes`, the application's own route list, outside the crawler |
| Fields probed | fields targeted by at least one negative or edge test (a valid submit alone proves nothing per field) |
| SUT coverage | PCOV executable lines, functions, branch proxy and method+URI routes of the application code; the harness is excluded; read after the crawl and the first generated run only, with crawl-only coverage reported next to it |
| Assertion density, locator mix | one TypeScript-AST analyser applied to the emitted specs and to the baseline sources (page objects included, `node_modules` skipped); the manifest figure is a cross-check |
| Duration per execution | mean per-execution duration on both sides, optionally restricted to one browser (`evaluation.comparisonBrowser`); suite wall-clock is reported separately |
| Flake rate | tests whose executed status changed between repeats; skipped executions are not verdicts and are listed separately |
| Cross-browser kappa | Fleiss kappa per repeat (mean); observed agreement and the disagreeing tests are reported because kappa degenerates when every verdict is the same |
| Mann-Whitney | one median duration per test, with a bootstrap 95% interval for the rank-biserial effect size |

### Known limits of the protocol

Generated and baseline repeats alternate so host drift is not confounded with the suite, but the manual baselines
were written by the tool authors and are small; unique-field values embed `Date.now()`, so seed 42 fixes the generated
data except those suffixes; SauceDemo is a live external site. State these when reporting results.

