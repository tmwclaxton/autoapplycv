<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AssistApplicationQuestionsRequest;
use App\Http\Requests\AssistChatRequest;
use App\Http\Requests\DraftAllApplicationRequest;
use App\Http\Requests\DraftFieldRequest;
use App\Http\Requests\GenerateCoverLetterRequest;
use App\Http\Requests\GenerateTailoredResumeRequest;
use App\Http\Requests\ScoreAtsRequest;
use App\Services\AiTokenService;
use App\Services\ApplicationAssistantService;
use App\Services\ApplicationDraftOrchestratorService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ApplicationAssistantController extends Controller
{
    public function __construct(
        private readonly ApplicationAssistantService $assistant,
        private readonly ApplicationDraftOrchestratorService $draftOrchestrator,
        private readonly AiTokenService $usage,
    ) {}

    public function answerQuestions(AssistApplicationQuestionsRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'Upload your CV on autocvapply.com first.'], 404);
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

    public function chat(AssistChatRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'Upload your CV on autocvapply.com first.'], 404);
        }

        $cost = (int) config('cv.ai_assist.chat_cost', 2);

        if (! $this->usage->canAutofill($user, $cost)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough autofills remaining for AI chat.',
                'subscription' => $this->usage->summary($user),
            ], 402);
        }

        $validated = $request->validated();
        $result = $this->assistant->chat(
            $profile,
            $validated['messages'],
            [
                'job' => $this->normalizeJob($validated['job'] ?? []),
                'focused_field' => $validated['focused_field'] ?? null,
            ],
        );

        if ($result === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not respond right now. Try again shortly.',
            ], 502);
        }

        $this->usage->recordAutofill($user, $cost);

        return response()->json([
            'success' => true,
            'message' => $result['message'],
            'profile_updates' => $result['profile_updates'],
            'draft_answer' => $result['draft_answer'],
            'autofill_cost' => $cost,
            'subscription' => $this->usage->summary($user),
        ]);
    }

    public function draftField(DraftFieldRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'Upload your CV on autocvapply.com first.'], 404);
        }

        $cost = (int) config('cv.ai_assist.draft_field_cost', 1);

        if (! $this->usage->canAutofill($user, $cost)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough autofills remaining for Quick Answer.',
                'subscription' => $this->usage->summary($user),
            ], 402);
        }

        $validated = $request->validated();
        $field = $validated['field'];

        $answers = $this->assistant->answerQuestions(
            $profile,
            $validated['job'],
            [[
                'label' => $field['label'],
                'field_type' => $field['field_type'] ?? 'text',
                'max_chars' => $field['max_chars'] ?? null,
                'options' => $field['options'] ?? null,
            ]],
            $validated['settings'] ?? [],
        );

        if ($answers === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not generate an answer right now. Try again shortly.',
            ], 502);
        }

        $this->usage->recordAutofill($user, $cost);

        return response()->json([
            'success' => true,
            'answer' => $answers[0]['answer'] ?? null,
            'label' => $field['label'],
            'autofill_cost' => $cost,
            'subscription' => $this->usage->summary($user),
        ]);
    }

    public function draftAll(DraftAllApplicationRequest $request): StreamedResponse|JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'Upload your CV on autocvapply.com first.'], 404);
        }

        $validated = $request->validated();
        $fields = $validated['fields'];
        $requiredCost = $this->draftOrchestrator->requiredAutofillCost(count($fields));

        if (! $this->usage->canAutofill($user, min($requiredCost, $this->draftOrchestrator->batchCost()))) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough autofills remaining for draft-all.',
                'subscription' => $this->usage->summary($user),
            ], 402);
        }

        return response()->stream(function () use ($user, $profile, $validated, $fields): void {
            $emit = static function (array $payload): void {
                echo json_encode($payload, JSON_THROW_ON_ERROR)."\n";

                if (ob_get_level() > 0) {
                    ob_flush();
                }

                flush();
            };

            try {
                $summary = $this->draftOrchestrator->runBatchedDraftStream(
                    $user,
                    $profile,
                    $validated['job'],
                    $fields,
                    $validated['settings'] ?? [],
                    static function (int $batchIndex, array $answers) use ($emit): void {
                        $emit([
                            'type' => 'batch',
                            'batch_index' => $batchIndex,
                            'answers' => $answers,
                        ]);
                    },
                    static function (int $batchIndex, string $message) use ($emit): void {
                        $emit([
                            'type' => 'batch_error',
                            'batch_index' => $batchIndex,
                            'message' => $message,
                        ]);
                    },
                );

                $emit([
                    'type' => 'complete',
                    'batches_ok' => $summary['batches_ok'],
                    'batches_failed' => $summary['batches_failed'],
                    'subscription' => $this->usage->summary($user->fresh()),
                ]);
            } catch (\Throwable $exception) {
                report($exception);

                $emit([
                    'type' => 'error',
                    'message' => 'Draft-all failed unexpectedly. Please try again.',
                ]);
            }
        }, 200, [
            'Content-Type' => 'application/x-ndjson',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    public function coverLetter(GenerateCoverLetterRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'Upload your CV on autocvapply.com first.'], 404);
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
            $this->normalizeJob($validated['job']),
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

    public function tailoredResume(GenerateTailoredResumeRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'Upload your CV on autocvapply.com first.'], 404);
        }

        $cost = (int) config('cv.ai_assist.tailored_resume_cost', 10);

        if (! $this->usage->canAutofill($user, $cost)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough autofills remaining for a tailored resume.',
                'subscription' => $this->usage->summary($user),
            ], 402);
        }

        $validated = $request->validated();
        $template = $validated['template'] ?? 'modern';
        $resume = $this->assistant->generateTailoredResume(
            $profile,
            $this->normalizeJob($validated['job']),
            $template,
        );

        if ($resume === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not generate a tailored resume right now. Try again shortly.',
            ], 502);
        }

        $this->usage->recordAutofill($user, $cost);

        return response()->json([
            'success' => true,
            'resume' => $resume,
            'template' => $template,
            'autofill_cost' => $cost,
            'subscription' => $this->usage->summary($user),
        ]);
    }

    public function atsScore(ScoreAtsRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'Upload your CV on autocvapply.com first.'], 404);
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

    /**
     * @param  array<string, mixed>  $job
     * @return array<string, mixed>
     */
    private function normalizeJob(array $job): array
    {
        return [
            'title' => filled($job['title'] ?? null) ? $job['title'] : 'This role',
            'company' => filled($job['company'] ?? null) ? $job['company'] : 'The employer',
            'description' => $job['description'] ?? null,
            'link' => $job['link'] ?? null,
        ];
    }
}
