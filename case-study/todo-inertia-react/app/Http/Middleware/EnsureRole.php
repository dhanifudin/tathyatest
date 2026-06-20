<?php

namespace App\Http\Middleware;

use App\Support\FaultRegistry;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string $role): Response
    {
        // Eval-only authz fault: when active, skip the role check so RBAC negative tests fail.
        if (! FaultRegistry::is('authz_admin_open')) {
            abort_unless($request->user()?->role === $role, 403);
        }

        return $next($request);
    }
}
