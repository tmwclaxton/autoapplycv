<?php

namespace App\Http\Controllers;

use App\Enums\ProfileDocumentCategory;
use App\Models\ProfileDocument;
use App\Models\User;
use App\Services\AiTokenService;
use App\Support\AiAssistCosts;
use App\Support\CoverLetterDesignSettings;
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
            return redirect()->route('dashboard', ['tab' => 'extension']);
        }

        return Inertia::render('Onboarding', [
            'cvProfile' => $cvProfile,
            'hasUploadedCv' => $user->cvUploads()->exists(),
            ...$this->documentPageProps($user),
        ]);
    }

    public function dashboard(Request $request): Response|RedirectResponse
    {
        $user = $request->user();
        $cvProfile = $user->cvProfile;

        if (! $cvProfile || ! $cvProfile->parsing_complete) {
            return redirect()->route('onboarding');
        }

        $coverLetterSettings = CoverLetterDesignSettings::normalize(
            $cvProfile->cover_letter_design,
            $cvProfile->cover_letter_font,
        );
        $cvProfile->cover_letter_design = $coverLetterSettings['cover_letter_design'];
        $cvProfile->cover_letter_font = $coverLetterSettings['cover_letter_font'];

        return Inertia::render('Dashboard', [
            'cvProfile' => $cvProfile,
            'subscription' => $this->aiTokens->summary($user),
            'extensionUsage' => $this->aiTokens->extensionUsageSummary($user),
            'aiAssist' => AiAssistCosts::forFrontend(),
            'coverLetterDesignOptions' => CoverLetterDesignSettings::optionsForFrontend(),
            ...$this->documentPageProps($user),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function documentPageProps(User $user): array
    {
        return [
            'documents' => $user->profileDocuments()
                ->latest()
                ->get()
                ->map(fn (ProfileDocument $document): array => $document->toFrontendArray())
                ->values()
                ->all(),
            'documentCategories' => ProfileDocumentCategory::uploadOptions(),
        ];
    }
}
