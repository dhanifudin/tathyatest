# TathyaTest (tt)

TathyaTest generates Playwright specs from a crawl of an MVC web app. It crawls once per RBAC role,
extracts a normalized element model into `crawl/<role>.json`, maps that model against a dataset and
access matrix, and emits Playwright tests for positive, negative, and edge coverage.

## Layout

- `crawler/`: Go static crawler, built as `tt-crawler`.
- `generator/`: TypeScript CLI and generator, exposed as `tt`.
- `case-study/todo-blade/`: Laravel Breeze Blade todo target for the static crawler.
- `case-study/todo-inertia-react/`: Laravel Breeze React/Inertia TypeScript todo target for the rendered crawler.
- `tathya.blade.config.example.yaml`: Blade/static config reference.
- `tathya.inertia-react.config.example.yaml`: Inertia/rendered config reference.
- `tathya.config.example.yaml`: canonical Blade/static config reference.
- `crawl/` and `tests/generated/`: runtime outputs, intentionally ignored by git.

## Setup

Use `make install` to build the compiled crawler and generator CLI:

```bash
make install
```

That produces:

- `tt-crawler` in `$(go env GOPATH)/bin` or the `GOBIN` you set
- the compiled generator CLI at `generator/dist/`
- a `tt` command in the active Node/asdf bin path or your npm prefix/bin directory

Use `make verify` to run the generator and Go checks, then smoke the compiled `tt` entrypoint:

```bash
make verify
```

Use `make uninstall` to remove the installed `tt` and `tt-crawler` binaries.

After install, you can run `tt` and `tt-crawler` from any directory as long as the Go bin
directory and npm global bin directory are on `PATH`.
`tt crawl` now falls back to `tt-crawler` on `PATH` after checking the local project paths.
If `tt` is managed by `asdf`, `make install` also refreshes the asdf-linked `tt` binary so the
shell resolves the latest build instead of an older shim target.

For manual development, you can still run the package-specific commands below.

```bash
cd crawler
go mod tidy
go build -o ../tt-crawler .

cd ../generator
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

## Commands

```bash
tt init
tt crawl
tt generate
tt run
tt all
```

`tt crawl` uses `extractor.engine` from `tathya.config.yaml`:

- `static`: invokes the Go `tt-crawler`.
- `rendered`: uses Playwright from the generator and is required for the React/Inertia target.

`tt generate` refreshes crawl outputs if they are missing or stale, then writes specs into
`output.dir` using `output.language` (`ts` or `js`).

`tt init` asks for a project name, creates a slugged directory, and writes the config inside it:

```bash
tt init
cd my-test
tt crawl
tt generate
tt run
```

The wizard asks for URL/domain, crawler engine, then each credential role with its username and
password before prompting for another role. It infers the login field names from the login page,
then asks for the generated Playwright language. The generated specs are written to
`tests/generated` inside the project directory.

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
