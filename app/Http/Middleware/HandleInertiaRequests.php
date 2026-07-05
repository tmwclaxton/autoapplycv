<?php

namespace App\Http\Middleware;

use App\Services\AiTokenService;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function version(Request $request): ?string
    {
        if (app()->environment('testing')) {
            return null;
        }

        return parent::version($request);
    }

    /**
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $user,
                'is_admin' => $user?->isAdmin() ?? false,
            ],
            'subscription' => $user
                ? app(AiTokenService::class)->summary($user)
                : null,
            'extensionId' => $request->session()->get('extension_auth_extension_id'),
        ];
    }
}
