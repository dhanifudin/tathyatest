<?php

namespace App\Support;

use Illuminate\Support\Facades\Route;

/**
 * Lightweight server-side code-coverage collector for the system under test. When COVERAGE=1 and
 * the PCOV extension is loaded, the CoverageMiddleware brackets each request with start()/capture();
 * executed application lines accumulate on disk together with the executable lines PCOV reports for
 * every compiled file (the line denominator is PCOV's own, not a token count). report() adds a
 * token-based count of functions and a control-flow "branch proxy" plus route coverage keyed by HTTP
 * method and URI. Evaluation-harness code (this collector, the fault registry, fault-toggle blocks, the
 * service provider's PCOV plumbing) is excluded. Used by TathyaTest's `tt eval` (SUT code coverage).
 */
class CoverageCollector
{
    public static function enabled(): bool
    {
        return filter_var(env('COVERAGE', false), FILTER_VALIDATE_BOOLEAN) && extension_loaded('pcov');
    }

    public static function start(): void
    {
        if (extension_loaded('pcov')) {
            \pcov\start();
        }
    }

    public static function capture(?string $routeUri = null, ?string $method = null): void
    {
        if (! extension_loaded('pcov')) {
            return;
        }

        \pcov\stop();
        // \pcov\inclusive collects ONLY the files in its filter argument — with no filter it
        // always returns nothing. Collect everything; mergeExecuted() filters to app_path().
        $collected = \pcov\collect(\pcov\all);
        \pcov\clear();
        self::mergeExecuted($collected);

        if ($routeUri !== null) {
            self::recordRoute(strtoupper($method ?? 'GET').' '.$routeUri);
        }
    }

    public static function reset(): void
    {
        @unlink(self::dataFile());
        @unlink(self::routesFile());
        @unlink(self::executableFile());
    }

    public static function report(): array
    {
        $executed = self::readJson(self::dataFile());
        $hitRoutes = self::readJson(self::routesFile());

        $totalLines = 0;
        $coveredLines = 0;
        $totalBranch = 0;
        $coveredBranch = 0;
        $totalFns = 0;
        $coveredFns = 0;

        $executable = self::readJson(self::executableFile());
        $learned = false;
        foreach (self::phpFiles(app_path()) as $file) {
            $rel = substr($file, strlen(base_path()) + 1);
            if (self::isInstrumentation($rel)) {
                continue;
            }
            $covered = $executed[$rel] ?? [];
            $analysis = self::analyze($file);
            $excluded = self::faultLines($file);

            // PCOV's executable lines when the file was compiled under PCOV; compile it now otherwise; the
            // token heuristic only as a last resort (a file PCOV cannot tell us about).
            $lines = $executable[$rel] ?? null;
            if ($lines === null) {
                $lines = self::compileExecutable($file);
                if ($lines !== []) {
                    $executable[$rel] = array_fill_keys(array_map('strval', $lines), 1);
                    $learned = true;
                }
            } else {
                $lines = array_map('intval', array_keys($lines));
            }
            if ($lines === null || $lines === []) {
                $lines = $analysis['lines'];
            }

            foreach ($lines as $line) {
                if (isset($excluded[$line])) {
                    continue;
                }
                $totalLines++;
                if (isset($covered[(string) $line])) {
                    $coveredLines++;
                }
            }
            foreach ($analysis['branchLines'] as $line) {
                if (isset($excluded[$line])) {
                    continue;
                }
                $totalBranch++;
                if (isset($covered[(string) $line])) {
                    $coveredBranch++;
                }
            }
            foreach ($analysis['functions'] as $fn) {
                if (isset($excluded[$fn['start']])) {
                    continue; // fault-toggle plumbing, not application behavior
                }
                $totalFns++;
                for ($line = $fn['start']; $line <= $fn['end']; $line++) {
                    if (isset($covered[(string) $line])) {
                        $coveredFns++;
                        break;
                    }
                }
            }
        }
        if ($learned) {
            self::writeJson(self::executableFile(), $executable);
        }

        [$routesCovered, $routesTotal] = self::routeCoverage($hitRoutes);

        return [
            'lines' => ['covered' => $coveredLines, 'total' => $totalLines],
            'branches' => ['covered' => $coveredBranch, 'total' => $totalBranch],
            'functions' => ['covered' => $coveredFns, 'total' => $totalFns],
            'routes' => ['covered' => $routesCovered, 'total' => $routesTotal],
        ];
    }

    /**
     * Token-based static analysis of one PHP file: executable line numbers, control-flow
     * ("branch proxy") line numbers, and function line ranges.
     *
     * Executable lines approximate what PCOV can report: the first line of each statement inside a
     * function or method body. Namespace and use lines, class and property declarations, signatures,
     * brace-only lines, and continuation lines of multi-line statements are NOT executable, and neither
     * are the evaluation harness's own fault-toggle blocks (`if (FaultRegistry::is(...)) { ... }`).
     *
     * @return array{lines: int[], branchLines: int[], functions: array<int, array{start: int, end: int}>}
     */
    public static function analyze(string $file): array
    {
        $tokens = token_get_all((string) file_get_contents($file));
        $codeLines = [];
        $branchLines = [];
        $functions = [];

        $branchTokens = [
            T_IF, T_ELSEIF, T_ELSE, T_FOR, T_FOREACH, T_WHILE, T_DO, T_SWITCH,
            T_CASE, T_CATCH, T_BOOLEAN_AND, T_BOOLEAN_OR, T_COALESCE, T_MATCH,
        ];
        $ignoreTokens = [
            T_WHITESPACE, T_COMMENT, T_DOC_COMMENT, T_OPEN_TAG, T_CLOSE_TAG,
            T_INLINE_HTML, T_OPEN_TAG_WITH_ECHO,
        ];
        // Keywords that start a line but compile to no executable statement of their own.
        $nonExecutableStarts = [T_ELSE, T_CATCH, T_FINALLY];

        // Brace stack: each entry says whether that block is a function body and whether it is a fault toggle.
        $stack = [];
        $pendingFunction = false;
        $pendingFault = false;
        $previous = null;          // previous significant token (string or token id)
        $lastLine = 0;             // last line that already produced its first token
        $statementStart = null;    // token id that opened the current statement
        $faultLines = [];

        foreach ($tokens as $index => $token) {
            if (! is_array($token)) {
                if ($token === '?') {
                    // Ternary — approximate the line from the previous array token.
                    $prev = self::previousLine($tokens, $index);
                    if ($prev !== null) {
                        $branchLines[$prev] = true;
                    }
                }
                if ($token === '{') {
                    $stack[] = ['function' => $pendingFunction, 'fault' => $pendingFault];
                    $pendingFunction = false;
                    $pendingFault = false;
                } elseif ($token === '}') {
                    array_pop($stack);
                }
                $previous = $token;
                if ($token === ';' || $token === '{' || $token === '}') {
                    $statementStart = null;
                }
                continue;
            }

            [$id, $text, $line] = $token;
            if (in_array($id, $ignoreTokens, true)) {
                continue;
            }
            if (in_array($id, $branchTokens, true)) {
                $branchLines[$line] = true;
            }
            if ($id === T_FUNCTION) {
                $pendingFunction = true;
                $range = self::functionRange($tokens, $index, $line);
                if ($range !== null) {
                    $functions[] = $range;
                }
            }

            $inFunction = false;
            $inFault = false;
            foreach ($stack as $frame) {
                $inFunction = $inFunction || $frame['function'];
                $inFault = $inFault || $frame['fault'];
            }

            if ($id === T_STRING && $text === 'FaultRegistry') {
                $faultLines[$line] = true;
                // A fault-toggle block is an `if` whose condition names FaultRegistry: skip its whole body.
                if ($statementStart === T_IF || $statementStart === T_ELSEIF) {
                    $pendingFault = true;
                }
            }

            $startsLine = $line !== $lastLine;
            $afterBoundary = $previous === null || $previous === ';' || $previous === '{' || $previous === '}';
            if ($startsLine && $afterBoundary && $inFunction && ! $inFault && ! in_array($id, $nonExecutableStarts, true)) {
                $codeLines[$line] = true;
            }
            if ($afterBoundary && $statementStart === null) {
                $statementStart = $id;
            }
            if ($startsLine) {
                $lastLine = $line;
            }
            $previous = $id;
        }

        foreach (array_keys($faultLines) as $line) {
            unset($codeLines[$line]);
        }

        return [
            'lines' => array_map('intval', array_keys($codeLines)),
            'branchLines' => array_map('intval', array_keys($branchLines)),
            'functions' => $functions,
        ];
    }

    private static function functionRange(array $tokens, int $start, int $startLine): ?array
    {
        $depth = 0;
        $seenBrace = false;
        $count = count($tokens);

        for ($i = $start; $i < $count; $i++) {
            $token = $tokens[$i];
            if ($token === '{') {
                $depth++;
                $seenBrace = true;
            } elseif ($token === '}') {
                $depth--;
                if ($seenBrace && $depth === 0) {
                    $end = is_array($tokens[$i - 1] ?? null) ? $tokens[$i - 1][2] : $startLine;
                    return ['start' => $startLine, 'end' => max($startLine, $end)];
                }
            } elseif ($token === ';' && ! $seenBrace) {
                return null; // abstract/interface method without a body
            }
        }

        return null;
    }

    private static function previousLine(array $tokens, int $index): ?int
    {
        for ($i = $index - 1; $i >= 0; $i--) {
            if (is_array($tokens[$i])) {
                return $tokens[$i][2];
            }
        }

        return null;
    }

    /** @return array{0: int, 1: int} */
    private static function routeCoverage(array $hitRoutes): array
    {
        $appRoutes = [];
        foreach (Route::getRoutes() as $route) {
            $action = $route->getActionName();
            if (! str_contains($action, 'App\\Http\\Controllers')) {
                continue;
            }
            if (str_starts_with($route->uri(), '__testing')) {
                continue;
            }
            foreach ($route->methods() as $method) {
                if ($method !== 'HEAD') {
                    $appRoutes[$method.' '.$route->uri()] = true;
                }
            }
        }

        $total = count($appRoutes);
        $covered = 0;
        foreach (array_keys($appRoutes) as $uri) {
            if (isset($hitRoutes[$uri])) {
                $covered++;
            }
        }

        return [$covered, $total];
    }

    private static function mergeExecuted(array $collected): void
    {
        @mkdir(self::dir(), 0777, true);
        $existing = self::readJson(self::dataFile());
        $executable = self::readJson(self::executableFile());
        $appPath = app_path();

        foreach ($collected as $file => $lines) {
            if (! str_starts_with($file, $appPath)) {
                continue;
            }
            $rel = substr($file, strlen(base_path()) + 1);
            $set = $existing[$rel] ?? [];
            $known = $executable[$rel] ?? [];
            foreach ($lines as $line => $count) {
                // PCOV lists every executable line: 1 when it ran, -1 when it did not.
                $known[(string) $line] = 1;
                if ($count > 0) {
                    $set[(string) $line] = 1;
                }
            }
            $existing[$rel] = $set;
            $executable[$rel] = $known;
        }

        self::writeJson(self::dataFile(), $existing);
        self::writeJson(self::executableFile(), $executable);
    }

    private static function recordRoute(string $uri): void
    {
        @mkdir(self::dir(), 0777, true);
        $routes = self::readJson(self::routesFile());
        $routes[$uri] = 1;
        self::writeJson(self::routesFile(), $routes);
    }

    /** @return string[] */
    /**
     * The evaluation harness (this collector, the fault registry, the coverage middleware, and the service
     * provider that only wires PCOV into `artisan serve`) is not
     * application behavior: counting its lines would inflate the denominator with code no user flow
     * can reach.
     */
    private static function isInstrumentation(string $relativePath): bool
    {
        return str_starts_with($relativePath, 'app/Support/')
            || $relativePath === 'app/Http/Middleware/CoverageMiddleware.php'
            || $relativePath === 'app/Providers/AppServiceProvider.php';
    }

    private static function phpFiles(string $dir): array
    {
        $files = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                $files[] = $file->getPathname();
            }
        }

        return $files;
    }

    private static function dir(): string
    {
        return storage_path('framework/coverage');
    }

    private static function executableFile(): string
    {
        return self::dir().'/executable.json';
    }

    /**
     * Compile one file under PCOV and return the executable line numbers PCOV reports for it. An empty
     * array when PCOV is unavailable or the file was already loaded in this process (nothing to compile).
     *
     * @return int[]
     */
    private static function compileExecutable(string $file): array
    {
        if (! extension_loaded('pcov')) {
            return [];
        }
        \pcov\start();
        try {
            require_once $file;
        } catch (\Throwable) {
            // A file that cannot be required in this context has no executable lines to report.
        }
        \pcov\stop();
        $collected = \pcov\collect(\pcov\all);
        \pcov\clear();
        $real = realpath($file) ?: $file;
        foreach ($collected as $name => $lines) {
            if ((realpath($name) ?: $name) === $real) {
                return array_map('intval', array_keys($lines));
            }
        }

        return [];
    }

    /**
     * Lines that belong to the evaluation harness inside application code: any line naming FaultRegistry,
     * and every line of an `if` block whose condition does (a fault toggle).
     *
     * @return array<int, true>
     */
    private static function faultLines(string $file): array
    {
        $tokens = token_get_all((string) file_get_contents($file));
        $excluded = [];
        $statementStart = null;
        $pendingIfLine = null;
        $faultBlocks = [];      // brace depth at which a fault block opened => the line the block starts on
        $depth = 0;
        $previous = null;
        $currentLine = 1;       // single-character tokens carry no line number, so count newlines ourselves

        foreach ($tokens as $token) {
            if (! is_array($token)) {
                if ($token === '{') {
                    $depth++;
                    if ($pendingIfLine !== null) {
                        $faultBlocks[$depth] = $pendingIfLine;
                        $pendingIfLine = null;
                    }
                } elseif ($token === '}') {
                    if (isset($faultBlocks[$depth])) {
                        for ($line = $faultBlocks[$depth]; $line <= $currentLine; $line++) {
                            $excluded[$line] = true;
                        }
                        unset($faultBlocks[$depth]);
                    }
                    $depth--;
                }
                if ($token === ';' || $token === '{' || $token === '}') {
                    $statementStart = null;
                }
                $previous = $token;

                continue;
            }

            [$id, $text, $line] = $token;
            $currentLine = $line + substr_count($text, "\n");
            if (in_array($id, [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT, T_OPEN_TAG], true)) {
                continue;
            }
            if ($statementStart === null && ($previous === null || $previous === ';' || $previous === '{' || $previous === '}')) {
                $statementStart = $id;
            }
            if ($id === T_FUNCTION) {
                // `applyFaults` exists only to host fault toggles: the whole method belongs to the harness.
                $name = self::nextString($tokens, $token);
                if ($name === 'applyFaults') {
                    $range = self::functionRange($tokens, array_search($token, $tokens, true) ?: 0, $line);
                    for ($l = $line; $range !== null && $l <= $range['end'] + 1; $l++) {
                        $excluded[$l] = true;
                    }
                }
            }
            if ($id === T_STRING && $text === 'FaultRegistry') {
                $excluded[$line] = true;
                if ($statementStart === T_IF || $statementStart === T_ELSEIF) {
                    $pendingIfLine = $line;
                }
            }
            $previous = $id;
        }

        return $excluded;
    }

    /** Name token that follows a `function` keyword, or null (closures have none). */
    private static function nextString(array $tokens, array $functionToken): ?string
    {
        $found = false;
        foreach ($tokens as $token) {
            if ($token === $functionToken) {
                $found = true;
                continue;
            }
            if (! $found || ! is_array($token) || in_array($token[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }

            return $token[0] === T_STRING ? $token[1] : null;
        }

        return null;
    }

    private static function dataFile(): string
    {
        return self::dir().'/executed.json';
    }

    private static function routesFile(): string
    {
        return self::dir().'/routes.json';
    }

    private static function readJson(string $path): array
    {
        if (! is_file($path)) {
            return [];
        }

        return json_decode((string) file_get_contents($path), true) ?: [];
    }

    private static function writeJson(string $path, array $data): void
    {
        file_put_contents($path, json_encode($data));
    }
}
