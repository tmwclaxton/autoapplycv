<?php

namespace App\Http\Controllers;

use App\Http\Requests\ScoreAtsCheckerRequest;
use App\Services\AiTokenService;
use App\Services\ApplicationAssistantService;
use App\Services\ExtensionNanoGptUsageService;
use App\Support\AiAssistCosts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AtsScoreCheckerController extends Controller
{
    public function __construct(
        private readonly ApplicationAssistantService $assistant,
        private readonly AiTokenService $usage,
        private readonly ExtensionNanoGptUsageService $nanoGptUsage,
    ) {}

    public function index(Request $request): Response
    {
        $user = $request->user();
        $guestLimit = $this->guestFreeUsesLimit();
        $guestUses = $this->guestUses($request);

        return Inertia::render('Tools/AtsScoreChecker', [
            'atsScoreCost' => AiAssistCosts::atsScoreCost(),
            'guestFreeUsesLimit' => $guestLimit,
            'guestFreeUsesRemaining' => $user
                ? null
                : max(0, $guestLimit - $guestUses),
        ]);
    }

    public function score(ScoreAtsCheckerRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();
        $guestLimit = $this->guestFreeUsesLimit();
        $guestUses = $this->guestUses($request);

        if ($user === null) {
            if ($guestUses >= $guestLimit) {
                return response()->json([
                    'success' => false,
                    'error' => "You've used your {$guestLimit} free ATS scores. Create a free account to continue with credits.",
                    'guest_limit_reached' => true,
                    'guest_free_uses_remaining' => 0,
                    'guest_free_uses_limit' => $guestLimit,
                ], 429);
            }
        } else {
            $cost = AiAssistCosts::atsScoreCost();

            if (! $this->usage->canSpendCredits($user, $cost)) {
                return response()->json([
                    'success' => false,
                    'error' => 'You do not have enough credits remaining for ATS scoring.',
                    'subscription' => $this->usage->summary($user),
                    'credit_cost' => $cost,
                ], 402);
            }
        }

        $result = $this->assistant->scoreAtsFromText(
            $validated['cv_text'],
            $validated['job_description'],
            $validated['role_preferences'] ?? null,
        );

        if ($result === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not score this CV against the job description. Add more detail and try again.',
            ], 422);
        }

        $cost = 0;

        if ($user !== null) {
            $cost = AiAssistCosts::atsScoreCost();
            $this->usage->recordCredit($user, $cost);
            $this->nanoGptUsage->record($user, 'assist.ats-score', $result['usage'], $cost);
        } else {
            $guestUses++;
            $request->session()->put($this->guestSessionKey(), $guestUses);
        }

        unset($result['usage']);

        $payload = [
            'success' => true,
            'result' => $result,
            'credit_cost' => $cost,
        ];

        if ($user !== null) {
            $payload['subscription'] = $this->usage->summary($user);
        } else {
            $payload['guest_free_uses_remaining'] = max(0, $guestLimit - $guestUses);
            $payload['guest_free_uses_limit'] = $guestLimit;
        }

        return response()->json($payload);
    }

    private function guestFreeUsesLimit(): int
    {
        return max(0, (int) config('cv.ats_score_checker.guest_free_uses', 3));
    }

    private function guestSessionKey(): string
    {
        return (string) config('cv.ats_score_checker.session_key', 'ats_score_checker_guest_uses');
    }

    private function guestUses(Request $request): int
    {
        return max(0, (int) $request->session()->get($this->guestSessionKey(), 0));
    }
}
