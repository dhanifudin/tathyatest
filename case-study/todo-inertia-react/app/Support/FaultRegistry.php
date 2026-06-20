<?php

namespace App\Support;

/**
 * Eval-only fault switch. The TathyaTest evaluator activates a single seeded fault by id via
 * POST /__testing/fault; conditional toggles across the app consult FaultRegistry::is($id). The
 * active fault is stored in a file so it survives across requests without a cache table.
 */
class FaultRegistry
{
    private static function path(): string
    {
        return storage_path('framework/tt_fault');
    }

    public static function active(): ?string
    {
        $path = self::path();

        if (! is_file($path)) {
            return null;
        }

        $value = trim((string) file_get_contents($path));

        return $value === '' ? null : $value;
    }

    public static function set(?string $id): void
    {
        $path = self::path();

        if ($id === null || $id === '') {
            @unlink($path);

            return;
        }

        @mkdir(dirname($path), 0777, true);
        file_put_contents($path, $id);
    }

    public static function is(string $id): bool
    {
        return self::active() === $id;
    }
}
