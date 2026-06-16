<?php

use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\TodoController;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => Inertia::render('Welcome'));

Route::post('/__testing/reset', function () {
    abort_unless(app()->environment(['local', 'testing']), 403);

    DB::table('todos')->delete();
    DB::table('users')->delete();
    DB::statement("DELETE FROM sqlite_sequence WHERE name IN ('todos', 'users')");
    app(DatabaseSeeder::class)->run();

    return response()->noContent();
})->withoutMiddleware(ValidateCsrfToken::class);

Route::middleware(['auth'])->group(function () {
    Route::get('/dashboard', fn () => Inertia::render('Dashboard'))->name('dashboard');
    Route::resource('todos', TodoController::class);
    Route::get('/admin/users', AdminUserController::class)->middleware('role:admin')->name('admin.users');
});

require __DIR__.'/auth.php';
