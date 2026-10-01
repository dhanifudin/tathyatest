// =====================================================================
// TathyaTest evaluation numbers (English / JUTI article)
// Values come from metrics/report.json (Blade, Inertia) and
// metrics-saucedemo/report.json (SauceDemo), all produced by `tt eval`.
// `evalTBD` marks a number awaiting the next evaluation run.
// This file is auto-generated:
//   node generator/scripts/report-to-typst.mjs > docs/juti/eval-numbers.typ
// Sibling of docs/eval-numbers.tex (Indonesian/LaTeX) — keep both in sync.
// =====================================================================

#let evalTBD = [*---*]

// ---------- EQ1: model coverage (stacks[].coverage) ----------
#let evBladeElemCov = [100.0% (44/44)] // stacks[blade].coverage.element
#let evBladeRouteCov = [100.0% (6/6)] // stacks[blade].coverage.routes
#let evBladeFormCov = [100.0% (3/3)] // stacks[blade].coverage.forms
#let evBladeFieldCov = [100.0% (16/16)] // stacks[blade].coverage.fields
#let evBladeNavCov = [100.0% (19/19)] // stacks[blade].coverage.nav
#let evBladeRbacCov = [100.0% (12/12)] // stacks[blade].coverage.rbacMatrix
#let evBladeConstraintCov = [100.0%] // stacks[blade].coverage.constraintKinds.ratio
#let evBladeTiers = [46/23/34 (103)] // stacks[blade].coverage.tiers
#let evBladeTestCount = [103] // stacks[blade].quality.testCount

#let evInertiaElemCov = [100.0% (46/46)] // stacks[inertia].coverage.element
#let evInertiaRouteCov = [100.0% (6/6)] // stacks[inertia].coverage.routes
#let evInertiaFormCov = [100.0% (3/3)] // stacks[inertia].coverage.forms
#let evInertiaFieldCov = [100.0% (16/16)] // stacks[inertia].coverage.fields
#let evInertiaNavCov = [100.0% (21/21)] // stacks[inertia].coverage.nav
#let evInertiaRbacCov = [100.0% (12/12)] // stacks[inertia].coverage.rbacMatrix
#let evInertiaConstraintCov = [100.0%] // stacks[inertia].coverage.constraintKinds.ratio
#let evInertiaTiers = [46/23/34 (103)] // stacks[inertia].coverage.tiers
#let evInertiaTestCount = [103] // stacks[inertia].quality.testCount

#let evSauceElemCov = [100.0% (20/20)] // stacks[saucedemo].coverage.element
#let evSauceRouteCov = [100.0% (4/4)] // stacks[saucedemo].coverage.routes
#let evSauceFormCov = [100.0% (1/1)] // stacks[saucedemo].coverage.forms
#let evSauceFieldCov = [100.0% (3/3)] // stacks[saucedemo].coverage.fields
#let evSauceNavCov = [100.0% (12/12)] // stacks[saucedemo].coverage.nav
#let evSauceRbacCov = [100.0% (4/4)] // stacks[saucedemo].coverage.rbacMatrix
#let evSauceConstraintCov = [100.0%] // stacks[saucedemo].coverage.constraintKinds.ratio
#let evSauceTiers = [18/4/9 (31)] // stacks[saucedemo].coverage.tiers
#let evSauceTestCount = [31] // stacks[saucedemo].quality.testCount

// ---------- EQ2: SUT code coverage (stacks[].sutCoverage; PCOV, Laravel only) ----------
#let evBladeLineCov = [21.6% (92/426)] // stacks[blade].sutCoverage.lines
#let evBladeBranchCov = [27.3% (21/77)] // stacks[blade].sutCoverage.branches (proxy)
#let evBladeFuncCov = [69.6% (39/56)] // stacks[blade].sutCoverage.functions
#let evBladeRouteExecCov = [87.5% (7/8)] // stacks[blade].sutCoverage.routes

#let evInertiaLineCov = [23.3% (104/446)] // stacks[inertia].sutCoverage.lines
#let evInertiaBranchCov = [27.8% (22/79)] // stacks[inertia].sutCoverage.branches (proxy)
#let evInertiaFuncCov = [68.4% (39/57)] // stacks[inertia].sutCoverage.functions
#let evInertiaRouteExecCov = [87.5% (7/8)] // stacks[inertia].sutCoverage.routes

// ---------- EQ3: fault detection (stacks[].faults; Laravel only) ----------
#let evBladeMutScore = [100.0% (9/9)] // stacks[blade].faults.mutationScore (killed/total)
#let evBladeMutValidation = [100.0% (5/5)] // stacks[blade].faults.byClass.validation
#let evBladeMutAuthz = [100.0% (1/1)] // stacks[blade].faults.byClass.authz
#let evBladeMutCrud = [100.0% (1/1)] // stacks[blade].faults.byClass.crud
#let evBladeMutPagination = [100.0% (1/1)] // stacks[blade].faults.byClass.pagination
#let evBladeMutAuth = [100.0% (1/1)] // stacks[blade].faults.byClass.auth
#let evBladeFaultLoc = [100.0%] // stacks[blade].faults.localizationAccuracy

#let evInertiaMutScore = [100.0% (9/9)] // stacks[inertia].faults.mutationScore (killed/total)
#let evInertiaMutValidation = [100.0% (5/5)] // stacks[inertia].faults.byClass.validation
#let evInertiaMutAuthz = [100.0% (1/1)] // stacks[inertia].faults.byClass.authz
#let evInertiaMutCrud = [100.0% (1/1)] // stacks[inertia].faults.byClass.crud
#let evInertiaMutPagination = [100.0% (1/1)] // stacks[inertia].faults.byClass.pagination
#let evInertiaMutAuth = [100.0% (1/1)] // stacks[inertia].faults.byClass.auth
#let evInertiaFaultLoc = [100.0%] // stacks[inertia].faults.localizationAccuracy

// ---------- EQ4: suite quality (stacks[].quality + baseline.quality.baseline) ----------
#let evBladeAssertDensity = [1.06] // stacks[blade].quality.assertionDensity
#let evBladeBrittle = [4.7%] // stacks[blade].quality.brittleLocatorRatio
#let evBladeRobustness = [72.6%] // stacks[blade].quality.locatorRobustness
#let evBladeLocMix = [label: 59, role: 23, css: 4] // stacks[blade].quality.locatorDistribution (top-3)
#let evBladeBaseTestCount = [5] // stacks[blade].baseline.quality.baseline.testCount
#let evBladeBaseAssertDensity = [1.00] // stacks[blade].baseline.quality.baseline.assertionDensity
#let evBladeBaseBrittle = [0.0%] // stacks[blade].baseline.quality.baseline.brittleLocatorRatio
#let evBladeBaseLocMix = [name: 10] // stacks[blade].baseline.quality.baseline.locatorDistribution (top-3)

#let evInertiaAssertDensity = [1.04] // stacks[inertia].quality.assertionDensity
#let evInertiaBrittle = [2.3%] // stacks[inertia].quality.brittleLocatorRatio
#let evInertiaRobustness = [74.3%] // stacks[inertia].quality.locatorRobustness
#let evInertiaLocMix = [label: 59, role: 25, css: 2] // stacks[inertia].quality.locatorDistribution (top-3)
#let evInertiaBaseTestCount = [5] // stacks[inertia].baseline.quality.baseline.testCount
#let evInertiaBaseAssertDensity = [1.00] // stacks[inertia].baseline.quality.baseline.assertionDensity
#let evInertiaBaseBrittle = [0.0%] // stacks[inertia].baseline.quality.baseline.brittleLocatorRatio
#let evInertiaBaseLocMix = [name: 10, role: 4] // stacks[inertia].baseline.quality.baseline.locatorDistribution (top-3)

#let evSauceAssertDensity = [1.00] // stacks[saucedemo].quality.assertionDensity
#let evSauceBrittle = [4.0%] // stacks[saucedemo].quality.brittleLocatorRatio
#let evSauceRobustness = [68.0%] // stacks[saucedemo].quality.locatorRobustness
#let evSauceLocMix = [placeholder: 13, role: 11, css: 1] // stacks[saucedemo].quality.locatorDistribution (top-3)
#let evSauceBaseTestCount = [74] // stacks[saucedemo].baseline.quality.baseline.testCount
#let evSauceBaseAssertDensity = [1.34] // stacks[saucedemo].baseline.quality.baseline.assertionDensity
#let evSauceBaseBrittle = [62.5%] // stacks[saucedemo].baseline.quality.baseline.brittleLocatorRatio
#let evSauceBaseLocMix = [css: 10, testid: 3, role: 3] // stacks[saucedemo].baseline.quality.baseline.locatorDistribution (top-3)

// ---------- EQ5: reliability, efficiency, baseline (stacks[].reliability/efficiency/baseline) ----------
#let evBladeFlake = [0.2%] // stacks[blade].reliability.flakeRate
#let evBladeKappa = [1.00] // stacks[blade].reliability.crossBrowserKappa
#let evBladePassRate = [98.9%] // stacks[blade].reliability.passRate
#let evBladeCrawlSec = [35.7 s] // stacks[blade].efficiency.crawlMs
#let evBladeGenMs = [27 ms] // stacks[blade].efficiency.generateMs
#let evBladeExecSec = [976 s $plus.minus$ 78 s] // stacks[blade].efficiency.executeMs (mean plus/minus CI95)
#let evBladePerTestSec = [9.5 s] // stacks[blade].efficiency.perTestMs
#let evBladeSavings = [30.6$times$ (15.3--45.8)] // stacks[blade].efficiency.timeSavingsRatio (+range)
#let evBladeMannWhitney = [$U$ = 22,448; $p$ < 0.001; $r$ = 0.79] // stacks[blade].baseline.durationMannWhitney (U, p, r)
#let evBladeVerdict = [3:4 (baseline)] // stacks[blade].baseline.verdict (wins gen:base, overall)

#let evInertiaFlake = [0.0%] // stacks[inertia].reliability.flakeRate
#let evInertiaKappa = [1.00] // stacks[inertia].reliability.crossBrowserKappa
#let evInertiaPassRate = [100.0%] // stacks[inertia].reliability.passRate
#let evInertiaCrawlSec = [34.8 s] // stacks[inertia].efficiency.crawlMs
#let evInertiaGenMs = [17 ms] // stacks[inertia].efficiency.generateMs
#let evInertiaExecSec = [1015 s $plus.minus$ 25 s] // stacks[inertia].efficiency.executeMs (mean plus/minus CI95)
#let evInertiaPerTestSec = [9.9 s] // stacks[inertia].efficiency.perTestMs
#let evInertiaSavings = [29.4$times$ (14.7--44.1)] // stacks[inertia].efficiency.timeSavingsRatio (+range)
#let evInertiaMannWhitney = [$U$ = 48,697; $p$ < 0.001; $r$ = 0.57] // stacks[inertia].baseline.durationMannWhitney (U, p, r)
#let evInertiaVerdict = [3:2 (generated)] // stacks[inertia].baseline.verdict (wins gen:base, overall)

#let evSauceFlake = [5.4%] // stacks[saucedemo].reliability.flakeRate
#let evSauceKappa = [-0.01] // stacks[saucedemo].reliability.crossBrowserKappa
#let evSaucePassRate = [98.7%] // stacks[saucedemo].reliability.passRate
#let evSauceCrawlSec = [5.4 s] // stacks[saucedemo].efficiency.crawlMs
#let evSauceGenMs = [7 ms] // stacks[saucedemo].efficiency.generateMs
#let evSauceExecSec = [311 s $plus.minus$ 58 s] // stacks[saucedemo].efficiency.executeMs (mean plus/minus CI95)
#let evSaucePerTestSec = [10.0 s] // stacks[saucedemo].efficiency.perTestMs
#let evSauceSavings = [29.4$times$ (14.7--44.1)] // stacks[saucedemo].efficiency.timeSavingsRatio (+range)
#let evSauceMannWhitney = [$U$ = 15,102; $p$ < 0.001; $r$ = 0.76] // stacks[saucedemo].baseline.durationMannWhitney (U, p, r)
#let evSauceVerdict = [4:2 (generated)] // stacks[saucedemo].baseline.verdict (wins gen:base, overall)
