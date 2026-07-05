<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdminUser
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $allowedEmails = config('admin.allowed_emails', []);

        if (! $user || ! in_array($user->email, $allowedEmails, true)) {
            abort(403, 'Admin access required.');
        }

        return $next($request);
    }
}
