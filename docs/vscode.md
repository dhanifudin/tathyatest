# Developing in VS Code

The repository ships a `.vscode/` folder with recommended extensions, tasks, and debug configurations. This page
shows how to run the apps and `tt`, and how to debug the generator, its tests, the generated specs, and the PHP apps.

## Prerequisites

1. Nix, plus [direnv](https://direnv.net) and the **direnv** extension (`mkhl.direnv`) so VS Code
   loads the root `shell.nix` (PHP, Composer, browser libraries) from `.envrc`. Without direnv, start
   VS Code from a shell that already ran `nix-shell`.
2. `make install` (builds `generator/dist/` and links `tt`), `npx playwright install` once, and
   `make case-study-setup STACK=blade|inertia` (see Setup above). PHP only runs inside `nix-shell`;
   the tasks below already wrap it.
3. Open the folder in VS Code and accept the recommended extensions: direnv, Playwright Test,
   Vitest, PHP Debug (Xdebug), Intelephense, YAML.

## Run the applications and `tt`

Use **Terminal > Run Task** (or `Ctrl+Shift+P`, "Tasks: Run Task"):

| Task | What it does |
|------|--------------|
| `app: blade serve` | Blade case study on http://127.0.0.1:8000 with `COVERAGE=1` (PCOV) |
| `app: inertia serve` | React/Inertia case study on http://127.0.0.1:8001 (run `npm run build` in that app first) |
| `app: blade reset db`, `app: inertia reset db` | `php artisan migrate:fresh --seed` (admin and user accounts, password `password`) |
| `generator: build`, `generator: watch` | `tsc` once, or in watch mode while you edit `generator/src` |
| `generator: typecheck`, `generator: test` | `tsc --noEmit`, Vitest |
| `tt: crawl`, `tt: generate`, `tt: run`, `tt: all`, `tt: eval` | The pipeline stages; each asks which config to use (`tathya.blade.config.yaml`, `tathya.inertia-react.config.yaml`, `tathya.saucedemo.config.yaml`, `tathya.config.yaml`) |

Outputs land in `crawl/`, `tests/generated/`, and `metrics/`. They are generated, ignored by git, and
excluded from VS Code search and file watching; never edit them by hand. Start only one app server at
a time on a small machine, and run `tt eval` one stack at a time (`tt eval --stack blade`).

## Debug the generator (TypeScript)

`generator/tsconfig.json` emits source maps, so breakpoints in `generator/src/*.ts` bind to the
compiled `dist/` code.

1. Run `generator: build` once (the launch configurations also do it for you).
2. Set a breakpoint, for example in `generator/src/generate/mapper.ts` or `generator/src/crawl/crud.ts`.
3. Press `F5` and choose **tt: debug command**; pick the config and the command (`crawl`, `generate`,
   `run`, `all`, `eval`, `report`). Use **tt: eval one stack (blade)** for a quick evaluation pass.
4. To debug the crawler (`generator/src/crawl/session.ts` and `dom-extract.ts`), launch `crawl` and set breakpoints
   inside the Node side; the code inside `page.evaluate()` runs in the browser, so debug it with
   `PWDEBUG=1 tt crawl` or `console.log` instead.

The `-c <config>` option belongs before the sub-command: `tt -c tathya.blade.config.yaml generate`.

## Debug the unit tests (Vitest)

Open a test file under `generator/test/` and run **Vitest: current file** (`F5`) to hit breakpoints,
or use the Vitest sidebar (Testing view) to run and debug single tests. `generator: test` runs the
whole suite from the terminal.

## Debug the generated Playwright specs

- Use the Playwright Test extension (Testing view). It reads the root `playwright.config.ts`, which
  takes its target from `TATHYA_CONFIG` (set to `tathya.blade.config.yaml` in `.vscode/settings.json`;
  change it for another app). Tick "Show browser" to watch a test.
- Or press `F5` on **Playwright: generated suite** (headed, `admin-chromium`, one worker) or
  **Playwright: inspector (PWDEBUG)** to step with the Playwright Inspector. Edit the `--project`
  argument for another role or browser (`user-firefox`, `admin-webkit`, ...).
- After a failing run, `npx playwright show-trace test-results/<test>/trace.zip` opens the trace.
- Generated specs are overwritten on every `tt generate`; to change them, change the emitters in
  `generator/src/emit/`, not the specs.

## Debug the Laravel case studies (Xdebug)

The default shells ship PCOV for coverage and no Xdebug, so the evaluation numbers stay comparable.
For stepping through PHP use the separate debug shell:

1. Run the task `app: blade serve (xdebug)` (it uses `case-study/todo-blade/shell.debug.nix`; the
   Inertia app has an equivalent `shell.debug.nix`).
2. Start **Laravel: listen for Xdebug (9003)** and set breakpoints in `app/Http/Controllers/` or
   `app/Http/Requests/`.
3. Load a page or run a generated test; execution stops on your breakpoint.
4. Stop the Xdebug server and return to `app: blade serve` before running `tt eval`, since coverage and
   timing are only comparable on the standard shell.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Breakpoints show as unbound | run `generator: build`; check `dist/*.js.map` exists; launch with a configuration that has `sourceMaps` (all provided ones do) |
| `tt`, `node`, or `php` not found in the VS Code terminal | direnv is not loaded: run "direnv: Reload environment", or start VS Code from `nix-shell` |
| `Error: ... connect ECONNREFUSED 127.0.0.1:8000` | the application is not running; start `app: blade serve` first |
| Port 8000 or 8001 already in use | stop the other server task (one app at a time on small hosts) |
| WebKit project fails to launch | it needs a display; the root `playwright.config.ts` starts Xvfb when `DISPLAY` is unset, so install Xvfb or skip WebKit |
| `unknown option '-c'` | put `-c <config>` before the sub-command |
