# PRD 5: Config, CLI, and init

Status: Draft. Depends on: PRD 1, 3.

## Problem

The config schema (`generator/src/config.ts`, zod) has no way to name a framework, and three keys
are Playwright-shaped: `output.language`, `evaluation.faultProject`, `evaluation.baselineDir`.
The CLI (`generator/src/cli/cli.ts`) and `tt init` (`generator/src/cli/init.ts`) assume Playwright.

## Goals

1. One new config key selects the adapter; everything else keeps its meaning.
2. Existing configs keep working with no edits.
3. CLI help, `tt init`, and the example config describe the framework choice.

## Non-goals

- A plugin system for third-party adapters (registry is internal in this phase).

## Config changes

Update the zod schema first (CLAUDE.md rule), then the consumers.

```yaml
output:
  dir: tests/generated
  language: ts            # ts | js (unchanged)
  framework: playwright   # NEW: playwright | cypress (default playwright)

# Optional per-framework block; ignored by other adapters
cypress:
  browsers: [chrome, firefox]   # default [chrome]; webkit is experimental
  supportFile: tests/generated/support/e2e.ts
  video: false
  screenshotOnFailure: false

evaluation:
  faultProject: null      # now means a BROWSER name (chromium|firefox|webkit|chrome); null = all
  baselineDir: tests/manual   # contains specs for the selected framework only
```

## Requirements

- R5.1 `output.framework` MUST default to `playwright`; absent key MUST NOT change any behavior or output.
- R5.2 Unknown framework values MUST fail config validation with the list of supported ids.
- R5.3 Browser names MUST be normalized by the adapter (`chromium` and `chrome` refer to the same engine family for Cypress); the project id seen by metrics MUST stay `<role>-<browser>` with the adapter's canonical browser names listed in `TestRunner.browsers`.
- R5.4 A `cypress:` block MUST be rejected when `framework` is not `cypress`, to avoid silent misconfiguration.
- R5.5 `tt run [args...]` MUST pass extra arguments to the selected framework CLI; its help text MUST name the selected framework dynamically. `tt run --read-only|--write-only` semantics are unchanged (PRD 3 R3.2).
- R5.6 `tt report` MUST call `runner.showReport`; when a framework has no HTML report, print a clear message and exit 0.
- R5.7 `tt init` MUST ask for the framework (default Playwright) before language, write `output.framework`, and print the install commands for the chosen framework's dependencies.
- R5.8 `tt generate` MUST fail fast with an install hint when an adapter dependency is missing (R4.6).
- R5.9 `tt eval --stack <name>` MUST allow a stack to override `output.framework` and `output.dir`, so one repository can evaluate both frameworks in separate runs. Cross-stack tables label rows `<stack>/<framework>`.
- R5.10 `tathya.config.example.yaml`, `README.md` (config reference), `CLAUDE.md` (config shape), and `AGENTS.md` MUST be updated in the same change (AGENTS.md rule: config shape changes are documented together).
- R5.11 Credentials in the config MUST never be written into generated Cypress files; roles are passed via `Cypress.env` from `cypress.config.ts` which reads `TATHYA_CONFIG` at run time.

## Backward compatibility

- Configs without `output.framework` produce identical output and behavior.
- `playwright.config.ts` and `playwright.global-setup.ts` remain at the repository root for the Playwright adapter; the Cypress scaffold writes `cypress.config.ts` at the repository root and does not touch Playwright files.
- `evaluation.faultProject` documented value `chromium` continues to work for Playwright.

## Acceptance checklist

- [ ] Schema accepts the new keys and rejects invalid combinations (unit tests in `generator/test/config.test.ts`).
- [ ] `tt init` writes a valid config for each framework (test with the wizard's non-interactive path).
- [ ] An old config file round-trips unchanged.
- [ ] Docs updated: example config, README, CLAUDE.md, AGENTS.md.
