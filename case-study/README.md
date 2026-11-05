# Case studies

Two small Laravel 12 applications (a todo list with admin and user roles) are the evaluation subjects
for TathyaTest. They share one feature set so results can be compared across rendering mechanisms:

| App | Rendering | Port | Config | Baseline |
|-----|-----------|------|--------|----------|
| `todo-blade/` | server-rendered Blade | 8000 | `tathya.blade.config.yaml` | `tests/manual/blade` |
| `todo-inertia-react/` | Inertia + React + TypeScript | 8001 | `tathya.inertia-react.config.yaml` | `tests/manual/inertia` |

They are test targets, not production code. Both started from Laravel Breeze; registration, password reset
and profile pages were removed so the surface stays small.

## Run one

```bash
make case-study-setup STACK=blade   # or inertia: composer, .env, key, sqlite, migrate + seed, npm build
make serve STACK=blade              # COVERAGE=1 php artisan serve (inside nix-shell)
tt -c tathya.blade.config.yaml all  # crawl, generate, run
```

Seeded accounts: `admin@example.com` and `user@example.com`, password `password`. The admin can open
`/admin/users`; the user gets a 403. PHP only runs inside `nix-shell` (`shell.nix`); `shell.debug.nix` adds
Xdebug for stepping through PHP from VS Code and must not be used for evaluation runs.

Tests: `php artisan test` inside `nix-shell`. `RoutesResolveTest` fails if a declared route has no
controller action or answers 5xx, so the apps stay clean targets.

## Evaluation harness (not application behavior)

| Piece | Where | Purpose |
|-------|-------|---------|
| Control plane | `routes/testing.php` | `POST /__testing/reset` reseeds the database; `POST /__testing/fault` and `/fault/clear` toggle seeded faults; `GET /__testing/coverage` and `POST /__testing/coverage/reset` report PCOV coverage. Loaded only when `APP_ENV` is `local` or `testing`; every route re-checks it |
| `FaultRegistry` | `app/Support/FaultRegistry.php` | holds the active fault id; consumers call `FaultRegistry::is('<id>')` |
| `CoverageCollector`, `CoverageMiddleware` | `app/Support/`, `app/Http/Middleware/` | collect executed lines per request when `COVERAGE=1`; excluded from the coverage denominator |

Faults live in `StoreTodoRequest`, `UpdateTodoRequest`, `EnsureRole`, `TodoController`, and
`Auth/AuthenticatedSessionController` / `LoginRequest`. **Every id in `generator/src/eval/faults.ts` must
be honoured by both apps**; `generator/test/eval/fault-sync.test.ts` fails otherwise.

## Conventions the generator relies on

- Validation errors render with `<x-input-error>` (Blade) or `[role=alert]` / `.text-red-600` (React), matching
  `oracle.errorSelector`.
- Edit and delete forms carry a hidden `_method` (`@method('PUT')`, `@method('DELETE')`).
- Input `name` attributes equal the migration column names.
- The paginator labels are plain words (`lang/en/pagination.php` in the Blade app).
- `Route::resource('todos', ...)` excludes `show`: declaring a route without its action answers HTTP 500.
- Coverage needs PCOV (`all.pcov` in `shell.nix`) and `COVERAGE=1`; do not mix it with Xdebug in one run.
