<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;
use Tests\TestCase;

/**
 * Guards the case study against declared-but-unserved routes (a resource route without its
 * controller action answers 500), which would show up as noise in the generated suite's results.
 */
class RoutesResolveTest extends TestCase
{
    use RefreshDatabase;

    protected $seeder = DatabaseSeeder::class;

    /** @return array<int, Route> */
    private function appRoutes(): array
    {
        return array_values(array_filter(
            RouteFacade::getRoutes()->getRoutes(),
            fn (Route $route) => ! str_starts_with($route->uri(), '__testing') && ! str_starts_with($route->uri(), '_')
        ));
    }

    public function test_every_routed_controller_action_exists(): void
    {
        foreach ($this->appRoutes() as $route) {
            $action = $route->getActionName();
            if ($action === 'Closure' || ! str_contains($action, '@')) {
                continue;
            }
            [$class, $method] = explode('@', $action);
            $this->assertTrue(method_exists($class, $method), "{$route->methods()[0]} /{$route->uri()} routes to missing {$class}::{$method}");
        }
    }

    public function test_every_parameterless_get_route_answers_without_a_server_error(): void
    {
        foreach (['admin@example.com', 'user@example.com'] as $email) {
            $this->actingAs(User::whereEmail($email)->firstOrFail());
            foreach ($this->appRoutes() as $route) {
                if (! in_array('GET', $route->methods(), true) || str_contains($route->uri(), '{')) {
                    continue;
                }
                $status = $this->get('/'.ltrim($route->uri(), '/'))->getStatusCode();
                $this->assertLessThan(500, $status, "GET /{$route->uri()} as {$email} answered {$status}");
            }
        }
    }
}
