<?php

use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\TodoController;
use Inertia\Inertia;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => Inertia::render('Welcome'));

// Evaluation control plane (reset hook, fault injection, SUT coverage): local and testing only.
if (app()->environment(['local', 'testing'])) {
    require __DIR__.'/testing.php';
}

Route::middleware(['auth'])->group(function () {
    Route::get('/dashboard', fn () => Inertia::render('Dashboard'))->name('dashboard');
    Route::put('/todos/{todo}/toggle', [TodoController::class, 'toggle'])->name('todos.toggle');
    // No show page in this case study (see the Blade routes for why the generator flagged it).
    Route::resource('todos', TodoController::class)->except(['show']);
    Route::get('/admin/users', AdminUserController::class)->middleware('role:admin')->name('admin.users');
});

require __DIR__.'/auth.php';
