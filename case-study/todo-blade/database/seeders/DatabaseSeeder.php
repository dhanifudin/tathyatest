<?php

namespace Database\Seeders;

use App\Models\Todo;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::updateOrCreate(
            ['email' => 'admin@example.com'],
            ['name' => 'Admin', 'password' => Hash::make('password'), 'role' => 'admin']
        );
        $user = User::updateOrCreate(
            ['email' => 'user@example.com'],
            ['name' => 'User', 'password' => Hash::make('password'), 'role' => 'user']
        );

        Todo::updateOrCreate(['user_id' => $admin->id, 'title' => 'Review reports'], ['contact_email' => 'admin.todo@example.com', 'status' => 'doing', 'body' => 'Admin seed item', 'due_date' => now()->addDay(), 'done' => false]);
        Todo::updateOrCreate(['user_id' => $user->id, 'title' => 'Buy groceries'], ['contact_email' => 'user.todo@example.com', 'status' => 'open', 'body' => 'Milk, eggs, bread', 'due_date' => now()->addDays(2), 'done' => false]);
        Todo::updateOrCreate(['user_id' => $user->id, 'title' => 'Pay bills'], ['contact_email' => 'pay.bills@example.com', 'status' => 'done', 'body' => null, 'due_date' => null, 'done' => true]);
    }
}
