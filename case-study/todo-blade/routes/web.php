<?php

use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\TodoController;
use Illuminate\Support\Facades\Route;

Route::view('/', 'welcome');

// Evaluation control plane (reset hook, fault injection, SUT coverage): local and testing only.
if (app()->environment(['local', 'testing'])) {
    require __DIR__.'/testing.php';
}

Route::middleware(['auth'])->group(function () {
    Route::view('/dashboard', 'dashboard')->name('dashboard');
    Route::put('/todos/{todo}/toggle', [TodoController::class, 'toggle'])->name('todos.toggle');
    // No show page in this case study: declaring it would route GET /todos/{todo} to a missing
    // controller action (a 500 the generator's inferred-route check rightly flagged).
    Route::resource('todos', TodoController::class)->except(['show']);
    Route::get('/admin/users', AdminUserController::class)->middleware('role:admin')->name('admin.users');
});

require __DIR__.'/auth.php';
