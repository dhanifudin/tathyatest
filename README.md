# TathyaTest (`tt`)

TathyaTest writes browser tests for you. It logs in to your web app as each user role, records every page,
form, and link it can reach, and generates [Playwright](https://playwright.dev) tests from that record:
the happy path, the invalid inputs, the edge cases, and who may open what. It works for any app with a login
form, server-rendered or single-page. The Laravel apps in `case-study/` and the public SauceDemo site are
practice and evaluation targets, not what the tool is limited to.

```
tt crawl  →  tt generate  →  tt run  →  tt eval (optional)
 learn the    write the       run in      measure how good
 app          tests           3 browsers  the tests are
 crawl/       tests/generated/  report    metrics/report.md
```

## Quick start

You need Node 24, Nix (for PHP and Composer), and Git. From a fresh clone:

```bash
make setup                          # build and link `tt`, install Playwright and a local config
make case-study-setup STACK=blade   # set up the demo Laravel app (STACK=inertia for the React one)
make serve STACK=blade              # start it on http://127.0.0.1:8000 (leave this running)
```

In a second terminal:

```bash
tt -c tathya.blade.config.yaml all  # crawl, generate, and run the tests
tt report                           # open the HTML report
```

The demo accounts are `admin@example.com` and `user@example.com`, password `password`.
`make help` lists every shortcut; `make verify` runs the project's own checks.

## Use it on your own app

Create a config with the app URL and one login per role, then run the three steps.
The smallest working config:

```yaml
baseUrl: http://127.0.0.1:8000
auth:
  roles:
    - { name: admin, username: admin@example.com, password: password }
```

`tt init` asks for the URL, each role's login, and the language of the generated specs, then writes the config
inside a new project folder; `tathya.config.example.yaml` documents every option. Then:

```bash
tt crawl      # learn the app: writes crawl/<role>.json
tt generate   # write the tests into tests/generated/
tt run        # run them
```

If your app has an endpoint that restores its test data, add `hooks.reset: { method: POST, path: /your/reset }`
and every test calls it first; otherwise tests run against whatever data the app holds.

## Commands

| Command | What it does |
|---------|--------------|
| `tt init` | wizard that writes a config in a new project folder |
| `tt crawl` | log in once per role and record the app into `crawl/<role>.json` |
| `tt generate` | write specs and `manifest.json` into `tests/generated/` (re-crawls if the crawl is missing or stale; `--fresh` forces it) |
| `tt run [playwright args]` | run the specs, for example `tt run --project admin-chromium --grep @auth` |
| `tt report` | open the HTML report of the last run |
| `tt all` | crawl, generate, and run in one go |
| `tt eval` | measure the suite ([docs/evaluation.md](docs/evaluation.md)) |

Two things to remember: `-c <config>` picks a config other than `tathya.config.yaml` and goes **before** the
command (`tt -c my.yaml generate`); and `--read-only` (see below) keeps only tests that never change data.

## What gets generated

Each form and page becomes tests in three tiers, controlled by `coverage` in the config:

- **positive**: valid login, valid form submissions, each role opening the pages it may open.
- **negative**: wrong password, empty required fields, wrong formats, out-of-range values, duplicates, and pages a
  role must not reach.
- **edge**: exact limits, very long values, unicode, whitespace, optional fields left out.

The tests are grouped into five spec files per page shape (auth, forms, interactions, pagination, RBAC) and carry
tags such as `@negative`, `@role:admin`, and `@read` or `@write`. Assertions check state (an error indicator is
visible, the URL changed, a field is invalid) and never exact message text. The exact rules for every variant are
in [docs/how-it-works.md](docs/how-it-works.md).

Valid values for create and update forms are generated fresh on every run with `@faker-js/faker` (repeatable with
`data.faker.seed`); the one field a negative or edge test is probing keeps a fixed value. `tt crawl` stops with a clear
message when the app at `baseUrl` is not running.

## Read-only monitoring

Every test is tagged `@read` or `@write`. `tt all --read-only` generates and runs only the tests that cannot
change data, so it is safe against staging or production. Run it on a schedule to check that every route, link,
pager, and search still works for every role:

```bash
*/15 * * * * cd /srv/tathya && tt -c tathya.prod.config.yaml all --read-only
```

## Project layout

```
generator/     the `tt` tool (TypeScript): src/{cli,crawl,auth,generate,emit,eval,util}, tests in test/
case-study/    two Laravel demo apps (Blade, Inertia+React) with the evaluation harness
tests/         manual/ hand-written baselines; baseline-public/ three public SauceDemo suites (git submodules)
docs/          guides (below); prd/ plans for new features; history/ archived plans
tathya.*.yaml  ready-made configs for the three demo targets; tathya.config.yaml is your local copy
```

Everything `tt` writes is generated, ignored by git, and never edited by hand. `make clean-outputs` removes it.

| Path | Written by | Contents |
|------|-----------|----------|
| `crawl/<role>.json` | `tt crawl` | the recorded app, one file per role |
| `tests/generated/` | `tt generate` | specs, shared `support/tathya.ts`, `manifest.json` |
| `storageState/<role>.json` | Playwright setup | logged-in session per role |
| `test-results/`, `playwright-report/` | `tt run` | traces and the HTML report |
| `metrics/`, `metrics-saucedemo/` | `tt eval` | `report.json` and `report.md` |

The product is TathyaTest, the command is `tt`, and config files and variables use the prefix `tathya`.

## Documentation

| Read | When you want to |
|------|------------------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | set up for development, follow the commit style, add a rule, oracle, or fault |
| [docs/how-it-works.md](docs/how-it-works.md) | understand the crawler and every generation rule |
| [docs/vscode.md](docs/vscode.md) | run, debug, and test inside VS Code (tasks, breakpoints, Xdebug) |
| [docs/evaluation.md](docs/evaluation.md) | measure the suites with `tt eval`; SauceDemo and baselines |
| [case-study/README.md](case-study/README.md) | run and extend the Laravel demo apps |
| [AGENTS.md](AGENTS.md) | the invariants contributors and AI agents must not break |
| [docs/prd/](docs/prd/README.md) | requirements for upcoming work (Cypress adapter) |
| [CHANGELOG.md](CHANGELOG.md) | what changed |

## Known limits

Server-only rules that never show in the HTML (custom validation closures, business logic), security and
performance testing, and mobile or native apps are out of scope. Use `data.unique` and `data.confirmFields` in the
config to hint at server rules the crawler cannot see.
