<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    protected $seeder = DatabaseSeeder::class;

    public function test_seeded_admin_can_authenticate_and_access_admin_users(): void
    {
        $response = $this->post('/login', [
            'email' => 'admin@example.com',
            'password' => 'password',
        ]);

        $response->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs(User::whereEmail('admin@example.com')->firstOrFail());

        $this->actingAs(User::whereEmail('admin@example.com')->firstOrFail())
            ->get('/admin/users')
            ->assertOk();
    }

    public function test_seeded_user_can_authenticate_but_cannot_access_admin_users(): void
    {
        $response = $this->post('/login', [
            'email' => 'user@example.com',
            'password' => 'password',
        ]);

        $response->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs(User::whereEmail('user@example.com')->firstOrFail());

        $this->actingAs(User::whereEmail('user@example.com')->firstOrFail())
            ->get('/admin/users')
            ->assertForbidden();
    }
}
