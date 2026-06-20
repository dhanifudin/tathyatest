# TathyaTest (tt)

TathyaTest generates Playwright specs from a Playwright crawl of a web app. It crawls once per RBAC role,
extracts a normalized element model into `crawl/<role>.json`, maps that model against a dataset and
access matrix, and emits Playwright tests for positive, negative, and edge coverage.

## Layout

- `generator/`: TypeScript CLI, Playwright crawler, and test generator, exposed as `tt`.
- `case-study/todo-blade/`: Laravel Breeze Blade todo target.
- `case-study/todo-inertia-react/`: Laravel Breeze React/Inertia TypeScript todo target.
- `tathya.blade.config.example.yaml`: Blade case-study config reference.
- `tathya.inertia-react.config.example.yaml`: Inertia case-study config reference.
- `tathya.config.example.yaml`: canonical generic config reference.
- `tathya.saucedemo.config.yaml`: SauceDemo (external React SPA) evaluation subject.
- `tests/baseline-public/saucedemo/`: Three independent public Playwright suites (git submodules)
  used as the human-written baseline for `tt eval` EQ5. See `SOURCES.md` inside for attribution.
- `crawl/` and `tests/generated/`: runtime outputs, intentionally ignored by git.

## Setup

Use `make install` to build the generator CLI:

```bash
make install
```

That produces the compiled generator CLI at `generator/dist/` and a `tt` command in the active
Node/asdf bin path or your npm prefix/bin directory.

Use `make verify` to run the generator checks, then smoke the compiled `tt` entrypoint:

```bash
make verify
```

Use `make baseline-init` to initialise the public SauceDemo baseline submodules:

```bash
make baseline-init
```

Use `make uninstall` to remove the installed `tt` binary.

After install, you can run `tt` from any directory as long as the npm global bin directory is on
`PATH`.
If `tt` is managed by `asdf`, `make install` also refreshes the asdf-linked `tt` binary so the
shell resolves the latest build instead of an older shim target.

For manual development, you can still run the package-specific commands below.

```bash
cd generator
npm install
npm run build
npm link
```

For the Blade Laravel case study:

```bash
nix-shell case-study/todo-blade/shell.nix
cd case-study/todo-blade
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate:fresh --seed
php artisan serve
```

Use `tathya.blade.config.example.yaml` as `tathya.config.yaml` when testing this target.

For the React/Inertia case study:

```bash
nix-shell case-study/todo-inertia-react/shell.nix
cd case-study/todo-inertia-react
composer install
npm install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate:fresh --seed
npm run build
php artisan serve --port=8001
```

Use `tathya.inertia-react.config.example.yaml` as `tathya.config.yaml` when testing this target.

Seeded credentials are `admin@example.com` / `password` and `user@example.com` / `password`.
The admin can reach `/admin/users`; the user receives a 403.

## SauceDemo evaluation subject

`tathya.saucedemo.config.yaml` targets `https://www.saucedemo.com` as a third evaluation subject —
a React SPA on a different tech stack to support a generalizability claim. The credentials
(`standard_user` / `secret_sauce`) are public. Because this is an external app with no control
plane, **SUT code coverage (Family B) and fault injection (Family C) do not apply**; `tt eval`
reports only model coverage (A), test-suite quality (D), and reliability/efficiency/baseline (E).

The human-written baseline for EQ5 comes from three independent public Playwright suites
(MIT-licensed, three different authors) stored as git submodules:

```bash
make baseline-init   # git submodule update --init --recursive
```

See `tests/baseline-public/saucedemo/SOURCES.md` for provenance, license, and pinned SHAs.

The baseline can be run standalone:

```bash
npx playwright test --config=tests/baseline-public/saucedemo/playwright.config.ts
```

## Commands

```bash
tt init
tt crawl
tt generate
tt run
tt all
tt eval
```

`tt crawl` uses the Playwright crawler for every target. It logs in once per configured role, starts
from the authenticated landing page, then follows same-origin URLs discovered from the live DOM.
Legacy configs that still contain `extractor.engine` are accepted, but the value is ignored.

`crawl.include` is optional explicit seeding for paths the crawler should visit in addition to
URLs discovered from the authenticated app DOM. Generic configs leave it empty; target-specific
case-study configs may include known routes such as `/todos` or `/admin`.

`tt generate` refreshes crawl outputs if they are missing or stale, then writes auth, forms,
interactions, and RBAC specs into `output.dir` using `output.language` (`ts` or `js`), plus a
`manifest.json` describing every generated test. Valid create/update fields are filled at runtime
from `@faker-js/faker` (seedable via `data.faker.seed`); the target field of a negative/edge case
stays a deterministic literal.

`tt eval` runs the metric-based evaluation and writes `metrics/report.{json,md}`: model coverage,
system-under-test code coverage (PCOV), fault-detection effectiveness (mutation score over a seeded
fault catalogue), test-suite quality, and reliability/efficiency with a hand-written baseline
comparison (`tests/manual/<stack>`). It reads `evaluation.stacks` to run the study across the Blade
and React/Inertia case studies. Requires the target servers running with `COVERAGE=1` for coverage,
and PCOV (`all.pcov` is in each `shell.nix`). Flags: `--stack`, `--repeat`, `--no-faults`,
`--no-coverage`, `--no-baseline`.

`tt init` asks for a project name, creates a slugged directory, and writes the config inside it:

```bash
tt init
cd my-test
tt crawl
tt generate
tt run
```

The wizard asks for URL/domain, then each credential role with its username and password before
prompting for another role, then asks for the generated Playwright language. Login
controls are inferred at crawl/test runtime. The generated specs are written to `tests/generated`
inside the project directory.

## Coverage

`coverage` can be `positive`, `negative`, `edge`, or `all`.

- Positive: valid login, valid form submissions, authorized navigation.
- Negative: wrong password, required-empty, type/pattern/length/range failures, invalid options,
  duplicate configured unique fields, confirmation mismatch, RBAC blocked routes. Use
  `data.requiredFields` to force blank negatives for fields the crawl missed.
- Edge: exact boundaries, long values, unicode, whitespace, optional omissions.

Assertions check state instead of exact error messages. Server-side validation expects a visible
error indicator from `oracle.errorSelector`; native validation checks HTML validity state.

## Known Gaps

Custom Laravel validation rules, closure rules, FormRequest logic that is not visible in HTML,
security/injection testing, performance testing, and mobile/native apps are out of scope for this
prototype. Use `data.unique` and `data.confirmFields` for server-only hints the crawler cannot infer.
