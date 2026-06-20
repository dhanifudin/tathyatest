<?php

use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\TodoController;
use App\Support\CoverageCollector;
use App\Support\FaultRegistry;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::view('/', 'welcome');

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

Route::middleware(['auth'])->group(function () {
    Route::view('/dashboard', 'dashboard')->name('dashboard');
    Route::put('/todos/{todo}/toggle', [TodoController::class, 'toggle'])->name('todos.toggle');
    Route::resource('todos', TodoController::class);
    Route::get('/admin/users', AdminUserController::class)->middleware('role:admin')->name('admin.users');
});

require __DIR__.'/auth.php';
