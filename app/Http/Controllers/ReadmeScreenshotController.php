<?php

namespace App\Http\Controllers;

use App\Enums\ProfileDocumentCategory;
use App\Models\ProfileDocument;
use App\Models\User;
use App\Services\AiTokenService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

class ReadmeScreenshotController extends Controller
{
    public const DEMO_EMAIL = 'jane.doe@example.com';

    public function __construct(
        private readonly AiTokenService $aiTokens,
    ) {}

    public function login(): RedirectResponse
    {
        abort_unless(app()->environment('local'), HttpResponse::HTTP_NOT_FOUND);

        $user = User::query()->where('email', self::DEMO_EMAIL)->firstOrFail();

        Auth::login($user);

        return redirect()->route('readme.dashboard', ['tab' => 'profile']);
    }

    public function dashboard(Request $request): Response|RedirectResponse
    {
        abort_unless(app()->environment('local'), HttpResponse::HTTP_NOT_FOUND);

        $user = $request->user();
        $cvProfile = $user->cvProfile;

        if (! $cvProfile || ! $cvProfile->parsing_complete) {
            abort(HttpResponse::HTTP_NOT_FOUND, 'Run php artisan readme:seed-demo first.');
        }

        return Inertia::render('Dashboard', [
            'cvProfile' => $cvProfile,
            'subscription' => $this->aiTokens->summary($user),
            'extensionUsage' => $this->aiTokens->extensionUsageSummary($user),
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
