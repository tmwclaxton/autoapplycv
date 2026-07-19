<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AssistApplicationQuestionsRequest;
use App\Http\Requests\AssistChatRequest;
use App\Http\Requests\DraftAllApplicationRequest;
use App\Http\Requests\DraftFieldRequest;
use App\Http\Requests\ExtractJobContextRequest;
use App\Http\Requests\GenerateCoverLetterRequest;
use App\Http\Requests\GenerateTailoredResumeRequest;
use App\Http\Requests\InventoryApplicationRequest;
use App\Http\Requests\ScoreAtsRequest;
use App\Services\AiTokenService;
use App\Services\ApplicationAssistantService;
use App\Services\ApplicationDraftOrchestratorService;
use App\Services\ApplicationFieldInventoryService;
use App\Services\ApplicationJobContextService;
use App\Services\AutofillAnalyticsService;
use App\Services\CoverLetterDocumentService;
use App\Services\ExtensionNanoGptUsageService;
use App\Support\AiAssistCosts;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ApplicationAssistantController extends Controller
{
    public function __construct(
        private readonly ApplicationAssistantService $assistant,
        private readonly ApplicationDraftOrchestratorService $draftOrchestrator,
        private readonly ApplicationFieldInventoryService $inventory,
        private readonly ApplicationJobContextService $jobContext,
        private readonly AiTokenService $usage,
        private readonly AutofillAnalyticsService $analytics,
        private readonly CoverLetterDocumentService $coverLetters,
        private readonly ExtensionNanoGptUsageService $nanoGptUsage,
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
        $cost = count($questions) * AiAssistCosts::questionCost();

        if (! $this->usage->canSpendCredits($user, $cost)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough credits remaining for AI assist.',
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
            ], 503);
        }

        $this->usage->recordCredit($user, $cost);
        $this->analytics->recordExtensionQuestions($cost);
        $this->nanoGptUsage->record($user, 'assist.questions', $answers['usage'], $cost);

        return response()->json([
            'success' => true,
            'answers' => $answers['answers'],
            'credit_cost' => $cost,
            'subscription' => $this->usage->summary($user),
        ]);
    }

    public function inventory(InventoryApplicationRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'Upload your CV on autocvapply.com first.'], 404);
        }

        $validated = $request->validated();
        $result = $this->inventory->resolveFields(
            $profile,
            $validated['job'],
            $validated['snapshot'],
            $validated['settings'] ?? [],
        );

        if ($result === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not inventory form fields right now. Try again shortly.',
            ], 503);
        }

        if (($result['source'] ?? 'llm') === 'llm') {
            $this->nanoGptUsage->record($user, 'assist.inventory', $result['usage'] ?? null, 0);
        }

        return response()->json([
            'success' => true,
            'fields' => $result['fields'],
            'complete' => $result['complete'],
            'next_actions' => $result['next_actions'],
            'source' => $result['source'] ?? 'llm',
            'usage' => $result['usage'] ?? null,
            'credit_cost' => 0,
            'subscription' => $this->usage->summary($user),
        ]);
    }

    public function jobContext(ExtractJobContextRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'Upload your CV on autocvapply.com first.'], 404);
        }

        $validated = $request->validated();
        $extracted = $this->jobContext->extractFromPage(
            (string) ($validated['page_title'] ?? ''),
            (string) ($validated['page_url'] ?? ''),
            (string) ($validated['page_text'] ?? ''),
        );

        if ($extracted === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not extract job context from this page. Try again shortly.',
            ], 503);
        }

        $this->nanoGptUsage->record($user, 'assist.job-context', $extracted['usage'], 0);

        $pageUrl = filled($validated['page_url'] ?? null) ? (string) $validated['page_url'] : null;

        return response()->json([
            'success' => true,
            'job' => [
                'title' => $extracted['title'] ?? 'Job application',
                'company' => $extracted['company'] ?? 'Unknown company',
                'link' => $pageUrl,
                'location' => $extracted['location'],
                'job_description' => $extracted['job_description'],
                'source' => $extracted['source'],
            ],
            'credit_cost' => 0,
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

        $cost = AiAssistCosts::chatCost();

        if (! $this->usage->canSpendCredits($user, $cost)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough credits remaining for AI chat.',
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
            ], 503);
        }

        $this->usage->recordCredit($user, $cost);
        $this->analytics->recordExtensionQuestions();
        $this->nanoGptUsage->record($user, 'assist.chat', $result['usage'] ?? null, $cost);

        return response()->json([
            'success' => true,
            'message' => $result['message'],
            'profile_updates' => $result['profile_updates'],
            'actions' => $result['actions'],
            'draft_answer' => $result['draft_answer'],
            'credit_cost' => $cost,
            'subscription' => $this->usage->summary($user),
        ]);
    }

    public function chatStream(AssistChatRequest $request): StreamedResponse|JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'Upload your CV on autocvapply.com first.'], 404);
        }

        $cost = AiAssistCosts::chatCost();

        if (! $this->usage->canSpendCredits($user, $cost)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough credits remaining for AI chat.',
                'subscription' => $this->usage->summary($user),
            ], 402);
        }

        $validated = $request->validated();

        return response()->stream(function () use ($user, $profile, $validated, $cost): void {
            $emit = static function (array $payload): void {
                echo json_encode($payload, JSON_THROW_ON_ERROR)."\n";

                if (ob_get_level() > 0) {
                    ob_flush();
                }

                flush();
            };

            try {
                $streamUsage = null;
                $ok = $this->assistant->streamChat(
                    $profile,
                    $validated['messages'],
                    [
                        'job' => $this->normalizeJob($validated['job'] ?? []),
                        'focused_field' => $validated['focused_field'] ?? null,
                    ],
                    $emit,
                    $streamUsage,
                );

                if (! $ok) {
                    $emit([
                        'type' => 'error',
                        'message' => 'Could not respond right now. Try again shortly.',
                    ]);

                    return;
                }

                $this->usage->recordCredit($user, $cost);
                $this->analytics->recordExtensionQuestions();
                $this->nanoGptUsage->record($user, 'assist.chat.stream', $streamUsage, $cost);

                $emit([
                    'type' => 'usage',
                    'credit_cost' => $cost,
                    'subscription' => $this->usage->summary($user->fresh()),
                ]);
            } catch (\Throwable $exception) {
                report($exception);

                $emit([
                    'type' => 'error',
                    'message' => 'Could not respond right now. Try again shortly.',
                ]);
            }
        }, 200, [
            'Content-Type' => 'application/x-ndjson',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    public function draftField(DraftFieldRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'Upload your CV on autocvapply.com first.'], 404);
        }

        $cost = AiAssistCosts::questionCost();

        if (! $this->usage->canSpendCredits($user, $cost)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough credits remaining for Quick Answer.',
                'subscription' => $this->usage->summary($user),
            ], 402);
        }

        $validated = $request->validated();
        $field = $validated['field'];
        $clarifyingAnswer = isset($validated['clarifying_answer']) && is_string($validated['clarifying_answer'])
            ? trim($validated['clarifying_answer'])
            : '';

        $question = [
            'label' => $field['label'],
            'field_type' => $field['field_type'] ?? 'text',
            'max_chars' => $field['max_chars'] ?? null,
            'options' => $field['options'] ?? null,
        ];

        if ($clarifyingAnswer !== '') {
            $question['clarifying_answer'] = $clarifyingAnswer;
        }

        $settings = $validated['settings'] ?? [];

        $answers = $this->assistant->answerQuestions(
            $profile,
            $validated['job'],
            [$question],
            $settings,
        );

        if ($answers === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not generate an answer right now. Try again shortly.',
            ], 503);
        }

        $this->usage->recordCredit($user, $cost);
        $this->analytics->recordExtensionQuestions();
        $this->nanoGptUsage->record($user, 'assist.draft-field', $answers['usage'], $cost);

        return response()->json([
            'success' => true,
            'answer' => $answers['answers'][0]['answer'] ?? null,
            'label' => $field['label'],
            'credit_cost' => $cost,
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

        if (! $this->usage->canSpendCredits($user, min($requiredCost, $this->draftOrchestrator->answerCost()))) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough credits remaining for draft-all.',
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
                    static function (int $batchIndex, array $answers, array $usage) use ($emit): void {
                        $emit([
                            'type' => 'usage',
                            'phase' => 'draft',
                            'batch_index' => $batchIndex,
                            'usage' => $usage,
                        ]);
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

        $cost = AiAssistCosts::coverLetterCost();

        if (! $this->usage->canSpendCredits($user, $cost)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough credits remaining for a cover letter.',
                'subscription' => $this->usage->summary($user),
            ], 402);
        }

        $validated = $request->validated();
        $coverLetterResult = $this->assistant->generateCoverLetter(
            $profile,
            $this->normalizeJob($validated['job']),
            $validated['tone'] ?? 'professional',
        );

        if ($coverLetterResult === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not generate a cover letter right now. Try again shortly.',
            ], 503);
        }

        $this->usage->recordCredit($user, $cost);
        $this->nanoGptUsage->record($user, 'assist.cover-letter', $coverLetterResult['usage'], $cost);

        $savedCoverLetter = $this->coverLetters->saveFromText(
            $user,
            $this->normalizeJob($validated['job']),
            $coverLetterResult['content'],
            $profile,
        );

        return response()->json([
            'success' => true,
            'cover_letter' => $coverLetterResult['content'],
            'credit_cost' => $cost,
            'subscription' => $this->usage->summary($user),
            'saved_document' => $savedCoverLetter['document']?->toFrontendArray('api.profile.documents.download'),
            'document_saved' => $savedCoverLetter['saved'],
            'document_duplicate' => $savedCoverLetter['duplicate'],
        ]);
    }

    public function tailoredResume(GenerateTailoredResumeRequest $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->cvProfile;

        if (! $profile) {
            return response()->json(['error' => 'Upload your CV on autocvapply.com first.'], 404);
        }

        $validated = $request->validated();
        $template = $validated['template'] ?? 'modern';
        $resumeResult = $this->assistant->generateTailoredResume(
            $profile,
            $this->normalizeJob($validated['job']),
            $template,
        );

        if ($resumeResult === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not generate a tailored resume right now. Try again shortly.',
            ], 503);
        }

        $this->nanoGptUsage->record($user, 'assist.tailored-resume', $resumeResult['usage'], 0);

        return response()->json([
            'success' => true,
            'resume' => $resumeResult['content'],
            'template' => $template,
            'credit_cost' => 0,
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

        $cost = AiAssistCosts::atsScoreCost();

        if (! $this->usage->canSpendCredits($user, $cost)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have enough credits remaining for ATS scoring.',
                'subscription' => $this->usage->summary($user),
            ], 402);
        }

        $validated = $request->validated();
        $result = $this->assistant->scoreAts(
            $profile,
            $validated['job_description'],
            $validated['role_preferences'] ?? null,
        );

        if ($result === null) {
            return response()->json([
                'success' => false,
                'error' => 'Could not score this job description. Add more CV text and try again.',
            ], 422);
        }

        $this->usage->recordCredit($user, $cost);
        $this->nanoGptUsage->record($user, 'assist.ats-score', $result['usage'], $cost);

        unset($result['usage']);

        return response()->json([
            'success' => true,
            'result' => $result,
            'credit_cost' => $cost,
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
