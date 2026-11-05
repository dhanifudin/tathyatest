<?php

// Evaluation control plane, used by `tt` (reset hook) and `tt eval` (fault injection and SUT coverage).
// Loaded only in local/testing environments from routes/web.php; every route also re-checks the
// environment, so a misconfigured production build still answers 403.

use App\Support\CoverageCollector;
use App\Support\FaultRegistry;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::post('/__testing/reset', function () {
    abort_unless(app()->environment(['local', 'testing']), 403);

    DB::table('todos')->delete();
    DB::table('users')->delete();
    DB::statement("DELETE FROM sqlite_sequence WHERE name IN ('todos', 'users')");
    app(DatabaseSeeder::class)->run();

    return response()->noContent();
})->withoutMiddleware(ValidateCsrfToken::class);

// Eval-only control plane (used by `tt eval`): fault injection + SUT coverage collection.
Route::withoutMiddleware(ValidateCsrfToken::class)->group(function () {
    Route::post('/__testing/fault', function (Request $request) {
        abort_unless(app()->environment(['local', 'testing']), 403);
        FaultRegistry::set($request->input('id'));

        return response()->noContent();
    });

    Route::post('/__testing/fault/clear', function () {
        abort_unless(app()->environment(['local', 'testing']), 403);
        FaultRegistry::set(null);

        return response()->noContent();
    });

    Route::post('/__testing/coverage/reset', function () {
        abort_unless(app()->environment(['local', 'testing']), 403);
        CoverageCollector::reset();

        return response()->noContent();
    });

    Route::get('/__testing/coverage', function () {
        abort_unless(app()->environment(['local', 'testing']), 403);

        return response()->json(CoverageCollector::report());
    });
});
