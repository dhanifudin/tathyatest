<?php

namespace App\Support;

use Illuminate\Support\Facades\Route;

/**
 * Lightweight server-side code-coverage collector for the system under test. When COVERAGE=1 and
 * the PCOV extension is loaded, the CoverageMiddleware brackets each request with start()/capture();
 * executed application lines accumulate on disk. report() pairs them with a token-based static
 * analysis (total executable lines, functions, and a control-flow "branch proxy") plus exact route
 * coverage. Used by TathyaTest's `tt eval` (Family B / RQ2).
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

    public static function capture(?string $routeUri = null): void
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
            self::recordRoute($routeUri);
        }
    }

    public static function reset(): void
    {
        @unlink(self::dataFile());
        @unlink(self::routesFile());
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

        foreach (self::phpFiles(app_path()) as $file) {
            $rel = substr($file, strlen(base_path()) + 1);
            $covered = $executed[$rel] ?? [];
            $analysis = self::analyze($file);

            foreach ($analysis['lines'] as $line) {
                $totalLines++;
                if (isset($covered[(string) $line])) {
                    $coveredLines++;
                }
            }
            foreach ($analysis['branchLines'] as $line) {
                $totalBranch++;
                if (isset($covered[(string) $line])) {
                    $coveredBranch++;
                }
            }
            foreach ($analysis['functions'] as $fn) {
                $totalFns++;
                for ($line = $fn['start']; $line <= $fn['end']; $line++) {
                    if (isset($covered[(string) $line])) {
                        $coveredFns++;
                        break;
                    }
                }
            }
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

        foreach ($tokens as $index => $token) {
            if (! is_array($token)) {
                if ($token === '?') {
                    // Ternary — approximate the line from the previous array token.
                    $prev = self::previousLine($tokens, $index);
                    if ($prev !== null) {
                        $branchLines[$prev] = true;
                    }
                }
                continue;
            }

            [$id, , $line] = $token;
            if (in_array($id, $ignoreTokens, true)) {
                continue;
            }
            $codeLines[$line] = true;
            if (in_array($id, $branchTokens, true)) {
                $branchLines[$line] = true;
            }
            if ($id === T_FUNCTION) {
                $range = self::functionRange($tokens, $index, $line);
                if ($range !== null) {
                    $functions[] = $range;
                }
            }
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
            $appRoutes[$route->uri()] = true;
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
        $appPath = app_path();

        foreach ($collected as $file => $lines) {
            if (! str_starts_with($file, $appPath)) {
                continue;
            }
            $rel = substr($file, strlen(base_path()) + 1);
            $set = $existing[$rel] ?? [];
            foreach ($lines as $line => $count) {
                if ($count > 0) {
                    $set[(string) $line] = 1;
                }
            }
            $existing[$rel] = $set;
        }

        self::writeJson(self::dataFile(), $existing);
    }

    private static function recordRoute(string $uri): void
    {
        @mkdir(self::dir(), 0777, true);
        $routes = self::readJson(self::routesFile());
        $routes[$uri] = 1;
        self::writeJson(self::routesFile(), $routes);
    }

    /** @return string[] */
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
