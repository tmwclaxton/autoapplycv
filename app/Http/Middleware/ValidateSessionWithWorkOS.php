<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Laravel\WorkOS\WorkOS;
use Symfony\Component\HttpFoundation\RedirectResponse;
use WorkOS\Exception\WorkOSException;

/**
 * WorkOS session gate with soft-fail for transient egress / DNS blips.
 *
 * Upstream laravel/workos always report()s WorkOSException (ERROR) then logs
 * the user out. Brief api.workos.com resolve/connect timeouts should not page
 * as production.ERROR; warn and logout instead.
 */
class ValidateSessionWithWorkOS
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next)
    {
        if (app()->runningUnitTests()) {
            return $next($request);
        }

        WorkOS::configure();

        if (! $request->session()->get('workos_access_token') ||
            ! $request->session()->get('workos_refresh_token')) {
            return $this->logout($request);
        }

        try {
            [$accessToken, $refreshToken] = WorkOS::ensureAccessTokenIsValid(
                $request->session()->get('workos_access_token'),
                $request->session()->get('workos_refresh_token'),
            );

            $request->session()->put('workos_access_token', $accessToken);
            $request->session()->put('workos_refresh_token', $refreshToken);
        } catch (WorkOSException $e) {
            if ($this->isTransientNetworkFailure($e)) {
                Log::warning('WorkOS session validation failed due to transient network error', [
                    'message' => $e->getMessage(),
                ]);
            } else {
                report($e);
            }

            return $this->logout($request);
        }

        return $next($request);
    }

    /**
     * Detect DNS / connect / timeout failures from the WorkOS HTTP client.
     */
    public static function isTransientNetworkFailure(WorkOSException $e): bool
    {
        $message = strtolower($e->getMessage());

        return str_contains($message, 'timed out')
            || str_contains($message, 'timeout')
            || str_contains($message, 'could not resolve')
            || str_contains($message, 'failed to connect')
            || str_contains($message, 'resolving timed out')
            || str_contains($message, 'connection reset')
            || str_contains($message, 'network is unreachable');
    }

    /**
     * Log the user out of the application.
     */
    protected function logout(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}
