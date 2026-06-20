<?php

namespace App\Http\Middleware;

use App\Support\CoverageCollector;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Eval-only middleware. When COVERAGE=1 and PCOV is loaded, it brackets each request so executed
 * application lines accumulate for TathyaTest's system-under-test coverage metric (RQ2). A no-op
 * in normal runs.
 */
class CoverageMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! CoverageCollector::enabled()) {
            return $next($request);
        }

        CoverageCollector::start();
        $response = $next($request);
        CoverageCollector::capture($request->route()?->uri());

        return $response;
    }
}
