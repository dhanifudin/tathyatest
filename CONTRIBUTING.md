# Contributing to TathyaTest

Thanks for helping. This file is the short path from a fresh clone to a reviewed change. For the
rules the generator must never break, read [AGENTS.md](AGENTS.md); for how the tool works, read
[README.md](README.md).

## 1. Set up

Prerequisites: Node 24 (see `.nvmrc` / `.tool-versions`), Nix (PHP and Composer live in `nix-shell`),
and optionally direnv. Then:

```bash
make setup                           # build tt, install root deps and Playwright browsers, create tathya.config.yaml
make case-study-setup STACK=blade    # Laravel Blade target (STACK=inertia for the React/Inertia one)
make serve STACK=blade               # http://127.0.0.1:8000, COVERAGE=1
tt -c tathya.blade.config.yaml all   # crawl, generate, run (in another terminal)
```

Seeded accounts: `admin@example.com` and `user@example.com`, password `password`.
VS Code users: see [docs/vscode.md](docs/vscode.md) for tasks and debug configurations.

## 2. Repository layout

| Path | What it is |
|------|------------|
| `generator/src/{cli,crawl,auth,generate,emit,eval,util}` | the `tt` implementation, one folder per pipeline stage |
| `generator/test/` | Vitest tests mirroring `src/`; `golden.test.ts` pins whole-generation output |
| `case-study/` | Laravel test targets with the evaluation harness (`FaultRegistry`, `CoverageCollector`) |
| `tests/manual/`, `tests/baseline-public/` | baselines compared against generated suites |
| `docs/prd/` | requirements for upcoming work (framework adapters); `docs/history/` is archived planning |

Generated outputs (`crawl/`, `tests/generated/`, `metrics*/`, `storageState/`) are ignored by git and
must never be edited by hand. `make clean-outputs` removes them.

## 3. Make a change

1. Branch from `main`.
2. Make the change with tests. Behavior-preserving refactors must keep `test/golden.test.ts` green
   without regenerating it; a deliberate output change regenerates the golden files with
   `UPDATE_GOLDEN=1 npx vitest run test/golden.test.ts` and the diff is part of the review.
3. Run the gates: `cd generator && npm run typecheck && npm run lint && npm test` (or `make verify`).
4. If you touched PHP, run `php artisan test` for both case studies inside `nix-shell`.
5. Update the documentation that describes what you changed (README, AGENTS.md, PRDs).

### Commit style

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`.

- types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`
- scopes (optional): `crawl`, `auth`, `generate`, `emit`, `eval`, `cli`, `case-study`, `prd`
- imperative mood, no trailing period, body explains why. One logical change per commit.

### Pull request checklist

- [ ] typecheck, lint, and tests pass; golden diff reviewed if it changed
- [ ] new behavior has a test; bug fixes have a regression test
- [ ] no generated outputs or credentials committed (`tathya.config.yaml` stays local)
- [ ] docs updated; `CHANGELOG.md` has an entry for user-visible changes

## 4. Recipes

**Add a field-variant rule.** Edit `generator/src/generate/fieldgen.ts` (pure), add cases to
`test/generate/fieldgen.test.ts`, then add a row to the variant table in [docs/how-it-works.md](docs/how-it-works.md).
If the browser would block the value before the server sees it, add the variant name to
`NATIVELY_UNFALSIFIABLE_VARIANTS` in `generate/mapper.ts`.

**Add an oracle.** Oracles return source strings: `generate/oracle.ts` for assertions built from a form,
the shared helpers in `emit/templates/support.ts` for runtime logic. Never assert exact error text.

**Add a seeded fault.** Add the entry to `FAULT_CATALOGUE` in `generator/src/eval/faults.ts` (id, class,
`relevant` matcher), add a `FaultRegistry::is('<id>')` toggle in both case studies, and note whether it is
a negative control (`expected: 'survives'`). `test/eval/fault-sync.test.ts` fails until both apps honour the id.

**Change the crawl contract.** Edit `crawl/model.ts` and `crawl/dom-extract.ts` together, bump
`CRAWL_SCHEMA_VERSION` for breaking changes, and re-record the crawl fixtures used by the golden test.

**Add a config key.** Zod schema in `src/config.ts` first, then consumers, the example and per-stack
configs, `cli/init.ts` if the wizard should ask, and `tathya.config.example.yaml`.

## 5. Where to ask

Open an issue in the repository for bugs and design questions. Security-sensitive reports should go to the
maintainers privately rather than to a public issue.
