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

        $adminTodos = [
            ['Review reports', 'doing', 'Admin seed item', false],
            ['Audit user access', 'open', 'Check role assignments', false],
            ['Prepare release notes', 'doing', 'Summarize current sprint', false],
            ['Archive old exports', 'done', 'Move completed exports', true],
            ['Review failed jobs', 'open', 'Inspect queue dashboard', false],
            ['Approve budget request', 'doing', 'Validate purchase request', false],
            ['Clean demo data', 'done', 'Remove temporary rows', true],
            ['Verify backups', 'open', 'Confirm latest restore point', false],
            ['Update admin handbook', 'doing', 'Document routine checks', false],
            ['Schedule maintenance', 'open', 'Pick a low traffic window', false],
            ['Check audit logs', 'done', 'Review weekly access logs', true],
            ['Refresh metrics board', 'open', 'Update dashboard widgets', false],
        ];

        $userTodos = [
            ['Buy groceries', 'open', 'Milk, eggs, bread', false],
            ['Pay bills', 'done', null, true],
            ['Book dentist appointment', 'open', 'Call the clinic', false],
            ['Plan weekend trip', 'doing', 'Compare train schedules', false],
            ['Water house plants', 'done', 'Kitchen and balcony plants', true],
            ['Read Laravel docs', 'open', 'Pagination and validation sections', false],
            ['Organize desk', 'doing', 'Sort receipts and notes', false],
            ['Renew library books', 'open', 'Due next week', false],
            ['Prepare lunch menu', 'done', 'Choose meals for three days', true],
            ['Clean inbox', 'open', 'Archive completed threads', false],
            ['Practice typing', 'doing', 'Ten minute daily drill', false],
            ['Backup photos', 'open', 'Copy recent album', false],
        ];

        foreach ($adminTodos as $index => [$title, $status, $body, $done]) {
            Todo::updateOrCreate(
                ['user_id' => $admin->id, 'title' => $title],
                ['contact_email' => sprintf('admin.todo.%02d@example.com', $index + 1), 'status' => $status, 'body' => $body, 'due_date' => now()->addDays($index + 1), 'done' => $done]
            );
        }

        foreach ($userTodos as $index => [$title, $status, $body, $done]) {
            Todo::updateOrCreate(
                ['user_id' => $user->id, 'title' => $title],
                ['contact_email' => sprintf('user.todo.%02d@example.com', $index + 1), 'status' => $status, 'body' => $body, 'due_date' => now()->addDays($index + 1), 'done' => $done]
            );
        }
    }
}
