<?php

namespace App\Providers;

use Illuminate\Foundation\Console\ServeCommand;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // `php artisan serve` only forwards a whitelist of env vars to its `php -S` worker;
        // COVERAGE must reach the worker or CoverageMiddleware never collects (tt eval RQ2).
        ServeCommand::$passthroughVariables[] = 'COVERAGE';
        ServeCommand::$passthroughVariables[] = 'PHP_INI_SCAN_DIR';

        // The worker starts in public/, where pcov's directory auto-detection finds no app/
        // dir and instruments nothing. Point pcov at the project root via an appended ini
        // scan dir (the leading ":" keeps PHP's default scan directory working).
        if ($this->app->runningInConsole() && filter_var(env('COVERAGE', false), FILTER_VALIDATE_BOOLEAN) && extension_loaded('pcov')) {
            $dir = storage_path('framework/pcov-ini');
            @mkdir($dir, 0777, true);
            file_put_contents($dir.'/pcov.ini', "pcov.enabled=1\npcov.directory=".base_path()."\n");
            // Setting the env REPLACES the effective scan dir (on nix the php wrapper injects
            // it via this same env var to load every extension), so keep the current one first.
            $existing = getenv('PHP_INI_SCAN_DIR') ?: PHP_CONFIG_FILE_SCAN_DIR;
            $scan = ($existing !== '' ? $existing.PATH_SEPARATOR : '').$dir;
            $_SERVER['PHP_INI_SCAN_DIR'] = $scan;
            $_ENV['PHP_INI_SCAN_DIR'] = $scan;
        }
    }
}
