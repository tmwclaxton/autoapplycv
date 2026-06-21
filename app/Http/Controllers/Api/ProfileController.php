<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AiTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function __construct(
        private readonly AiTokenService $aiTokens,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'No profile found'], 404);
        }

        return response()->json([
            'user' => [
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $user->avatar,
            ],
            'profile' => [
                'full_name' => $profile->full_name ?? $user->name,
                'email' => $profile->email ?? $user->email,
                'phone' => $profile->phone,
                'location' => $profile->location,
                'linkedin_url' => $profile->linkedin_url,
                'website_url' => $profile->website_url,
                'summary' => $profile->summary,
                'skills' => $profile->skills ?? [],
                'experience' => $profile->experience ?? [],
                'education' => $profile->education ?? [],
                'extra_context' => $profile->extra_context,
            ],
            'subscription' => $this->aiTokens->summary($user),
        ]);
    }
}
