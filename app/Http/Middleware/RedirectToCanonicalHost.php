<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RedirectToCanonicalHost
{
    /**
     * Redirect requests on non-canonical hosts (e.g. www) to APP_URL's host.
     *
     * WorkOS AuthKit always returns to WORKOS_REDIRECT_URL on the apex host. If login
     * starts on www, the OAuth state cookie is host-only and the callback aborts 403.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $canonicalHost = parse_url((string) config('app.url'), PHP_URL_HOST);

        if (! is_string($canonicalHost) || $canonicalHost === '') {
            return $next($request);
        }

        $requestHost = $request->getHost();

        if (strcasecmp($requestHost, $canonicalHost) === 0) {
            return $next($request);
        }

        // Only rewrite the www host. Other hosts (localhost, previews, etc.) must pass
        // through so local/CI requests are not forced onto APP_URL.
        if (strcasecmp($requestHost, 'www.'.$canonicalHost) !== 0) {
            return $next($request);
        }

        $canonicalUrl = rtrim((string) config('app.url'), '/').$request->getRequestUri();

        return redirect()->away($canonicalUrl, 301);
    }
}
