<?php

namespace App\Http\Controllers;

use App\Services\AiTokenService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class OnboardingController extends Controller
{
    public function __construct(
        private readonly AiTokenService $aiTokens,
    ) {}

    public function index(Request $request): Response|RedirectResponse
    {
        $user = $request->user();
        $cvProfile = $user->cvProfile;

        if ($cvProfile && $cvProfile->parsing_complete) {
            return redirect()->route('dashboard');
        }

        return Inertia::render('Onboarding', [
            'cvProfile' => $cvProfile,
            'hasUploadedCv' => $user->cvUploads()->exists(),
        ]);
    }

    public function dashboard(Request $request): Response|RedirectResponse
    {
        $user = $request->user();
        $cvProfile = $user->cvProfile;

        if (! $cvProfile || ! $cvProfile->parsing_complete) {
            return redirect()->route('onboarding');
        }

        return Inertia::render('Dashboard', [
            'cvProfile' => $cvProfile,
            'subscription' => $this->aiTokens->summary($user),
        ]);
    }
}
