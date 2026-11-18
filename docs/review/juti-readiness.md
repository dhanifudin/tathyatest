# JUTI readiness review: research questions versus implementation

This review maps each research question of the JUTI article to the code that measures it, the evidence
the recorded reports contain, the weaknesses a reviewer would raise, and the fix. It was produced from
a code and manuscript review plus a graphify knowledge graph of the repository (324 code files, 1,637
nodes, 3,060 edges; AST extraction only). Status values are updated as the fixes land.

Legend: **open** not fixed, **fixed** code or protocol changed, **disclosed** kept but stated as a threat in the article.

## How the graph was used

`graphify-out/` is local analysis output (gitignored). Queries that back the findings:

| Question | What the graph shows |
|----------|----------------------|
| Where is model coverage computed and what feeds nav coverage? | `coverageMetrics()` (`eval/metrics/coverage.ts`) sits in the same community as `generate/mapper.ts`, `generate/rbac.ts` and `util/paths.ts`: the evaluation re-uses the generator's own `navScenarioKeysForPage()` and `routeShape()`. Numerators (manifest) and denominators (crawl) both come from the tool, which is why EQ1 is circular. |
| How does SUT coverage reach the report? | `runner.ts: runStack()` calls `fetchCoverage()` which reads `GET /__testing/coverage`, produced by `case-study/*/app/Support/CoverageCollector.php`. Reset and fetch both live in `runStack`, around the crawl, the generated runs and the baseline run, so all three are included. |
| What feeds the quality and baseline comparison? | `baselineComparison()` in `metrics/baseline.ts` combines `reliabilityOf()`, `locatorRobustnessOf()` and `analyzeBaselineDir()` (`eval/baseline-static.ts`). The generated side reads `ManifestEntry`, the baseline side reads spec source: two different instruments. |
| Where do flake rate and kappa come from? | `reliabilityOf()` and `crossBrowserAgreement()` (`metrics/reliability.ts`) use `fleissKappa()` from `eval/stats.ts`; kappa is computed on the first repeat only. |

## RQ1: coverage of the functional surface

| # | Finding | Evidence | Fix | Status |
|---|---------|----------|-----|--------|
| 1.1 | Line coverage counts non-executable lines (`namespace`, `use`, signatures, declarations), so 24 to 36% is mostly a counting artifact | `CoverageCollector::analyze`; uncovered lines are declarations | count executable lines only | open |
| 1.2 | Fault toggles and `AppServiceProvider::boot` remain in the denominator | `StoreTodoRequest::applyFaults`, `FaultRegistry::is` guards | exclude | open |
| 1.3 | Coverage includes the crawl, every repeat and the baseline suite | `runner.ts` reset before crawl, fetch after baseline | reset after crawl, fetch before baseline, report each part | open |
| 1.4 | Branch coverage is a line proxy; routes keyed by URI, not method | `CoverageCollector::report`, `routeCoverage` | key by method and URI; keep "proxy" wording | open |
| 1.5 | Model coverage is circular (denominators from the tool's crawl) | `eval/metrics/coverage.ts` | add an out-of-model measure against `route:list` | open |
| 1.6 | Field coverage equals form coverage; unique and confirmation kinds come from config; 7 of 13 kinds exist in the apps | `coverage.ts`, configs | require a filled or targeted field; extend the apps; ablation | open |
| 1.7 | Nav 17/19 is a key mismatch on `link:/logout`, not a gap; the article blames pagination controls | `navScenarioKeysForPage` vs `interactionCasesForPage` | skip logout links when a logout form exists; match by key, not count | open |
| 1.8 | SauceDemo config seeds all pages and supplies `required` through hints | `tathya.saucedemo.config.yaml` | reduced-seed run, state the hints | open |

## RQ2: quality, reliability and efficiency versus baselines

| # | Finding | Evidence | Fix | Status |
|---|---------|----------|-----|--------|
| 2.1 | Assertion density and brittle ratio use different instruments on each side (manifest vs regex) | `metrics/quality.ts`, `eval/baseline-static.ts` | one AST analyser over both | open |
| 2.2 | Baseline analysis scans `node_modules` and cannot see page objects; the CSS residual formula is wrong | `collectSpecFiles`, `baseline-static.ts` | ignore `node_modules`, follow imports, classify selector strings | open |
| 2.3 | "Duration per test" compares suite wall-clock per manifest test with per-execution time | `metrics/reliability.ts`, `metrics/baseline.ts` | per-execution on both sides, Chromium-only comparison | open |
| 2.4 | Skipped tests are in the flake denominator; runtime skips hide failures; kappa uses one repeat and degenerates when everything passes | `metrics/reliability.ts` | exclude skips, report skip counts, kappa per repeat plus percent agreement | open |
| 2.5 | Reports overwrite each other; numbers are stale or partial; no provenance | `runner.ts: writeReports` | per-stack report files with provenance | open |
| 2.6 | Mann-Whitney on pooled non-independent executions; runs not interleaved | `runner.ts`, `stats.ts` | per-test aggregation, interleave | open |
| 2.7 | Manual baselines are 5 tests, author-written, scope-mismatched | `tests/manual/*` | scope-matched baseline with a timing log; disclose authorship | open |
| 2.8 | The 300 s per case assumption is unmeasured; ignores config and triage effort | `metrics/reliability.ts` | measured authoring times, include tool cost | open |
| 2.9 | Reproducibility claims exceed the repository (reports ignored, seed and repeat differ between configs, `Date.now()` data) | `.gitignore`, example config | tracked paper config, `make paper-eval`, tag | open |

## Threats-to-validity checklist for the article

Instrument asymmetry (resolved by 2.1 to 2.3), page objects, author-written and scope-mismatched baselines,
Chromium-only public runs versus three browsers (headed WebKit under Xvfb), PCOV timing overhead, single host,
reset and UI-login overhead per test, kappa prevalence paradox, run-order confounding, live-site
non-determinism (SauceDemo), hand-tuned configuration (ablation), circular model coverage.

## Strengths to state

Pure, unit-tested statistics; metrics computed in a pure module; independent pinned public suites;
route-audit tests; harness excluded from coverage; baseline fault detection reported under the same catalogue.
