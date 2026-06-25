<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AssistApplicationQuestionsRequest;
use App\Http\Requests\GenerateCoverLetterRequest;
use App\Http\Requests\ScoreAtsRequest;
use App\Services\AiTokenService;
use App\Services\ApplicationAssistantService;
use Illuminate\Http\JsonResponse;

class ApplicationAssistantController extends Controller
{
    public function __construct(
        private readonly ApplicationAssistantService $assistant,
        private readonly AiTokenService $usage,
    ) {}

    public function answerQuestions(AssistApplicationQuestionsRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'No profile found'], 404);
        }

        $validated = $request->validated();
        $questions = $validated['questions'];
        $cost = count($questions);

        if (! $this->usage->canAutofill($user, $cost)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough autofills remaining for AI assist.',
                'subscription' => $this->usage->summary($user),
            ], 402);
        }

        $answers = $this->assistant->answerQuestions(
            $profile,
            $validated['job'],
            $questions,
            $validated['settings'] ?? [],
        );

        if ($answers === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not generate answers right now. Try again shortly.',
            ], 502);
        }

        $this->usage->recordAutofill($user, $cost);

        return response()->json([
            'success' => true,
            'answers' => $answers,
            'autofill_cost' => $cost,
            'subscription' => $this->usage->summary($user),
        ]);
    }

    public function coverLetter(GenerateCoverLetterRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'No profile found'], 404);
        }

        $cost = (int) config('cv.ai_assist.cover_letter_cost', 8);

        if (! $this->usage->canAutofill($user, $cost)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough autofills remaining for a cover letter.',
                'subscription' => $this->usage->summary($user),
            ], 402);
        }

        $validated = $request->validated();
        $coverLetter = $this->assistant->generateCoverLetter(
            $profile,
            $validated['job'],
            $validated['tone'] ?? 'professional',
        );

        if ($coverLetter === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not generate a cover letter right now. Try again shortly.',
            ], 502);
        }

        $this->usage->recordAutofill($user, $cost);

        return response()->json([
            'success' => true,
            'cover_letter' => $coverLetter,
            'autofill_cost' => $cost,
            'subscription' => $this->usage->summary($user),
        ]);
    }

    public function atsScore(ScoreAtsRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'No profile found'], 404);
        }

        $cost = (int) config('cv.ai_assist.ats_score_cost', 5);

        if (! $this->usage->canAutofill($user, $cost)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough autofills remaining for ATS scoring.',
                'subscription' => $this->usage->summary($user),
            ], 402);
        }

        $validated = $request->validated();
        $result = $this->assistant->scoreAts($profile, $validated['job_description']);

        if ($result === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not score this job description. Add more CV text and try again.',
            ], 422);
        }

        $this->usage->recordAutofill($user, $cost);

        return response()->json([
            'success' => true,
            'result' => $result,
            'autofill_cost' => $cost,
            'subscription' => $this->usage->summary($user),
        ]);
    }
}
