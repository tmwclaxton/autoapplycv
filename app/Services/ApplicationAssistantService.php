<?php

namespace App\Services;

use App\Enums\ApplicationArtifactType;
use App\Models\ApplicationArtifact;
use App\Models\CvProfile;
use App\Models\JobApplication;
use Illuminate\Support\Facades\Log;

class ApplicationAssistantService
{
    public function __construct(
        private readonly NanoGptService $nanoGpt,
    ) {}

    /**
     * @param  array<int, array{label: string, field_type?: string, max_chars?: int, options?: array<int, string>}>  $questions
     * @param  array<string, mixed>  $job
     * @param  array<string, mixed>  $settings
     * @return array<int, array{label: string, answer: string|null}>|null
     */
    public function answerQuestions(CvProfile $profile, array $job, array $questions, array $settings = []): ?array
    {
        if ($questions === []) {
            return [];
        }

        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => $this->systemPrompt($profile, $settings),
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'job' => $job,
                    'questions' => $questions,
                    'instructions' => 'Return JSON: {"answers":[{"label":"exact label from input","answer":"string or null"}]}. Use null when unsure. Never invent employers, degrees, or dates. For yes/no radio questions return exactly "yes" or "no". Keep within max_chars when provided.',
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.4,
        ]);

        if ($payload === null || ! isset($payload['answers']) || ! is_array($payload['answers'])) {
            return null;
        }

        $answers = [];

        foreach ($payload['answers'] as $row) {
            if (! is_array($row) || ! isset($row['label'])) {
                continue;
            }

            $answers[] = [
                'label' => (string) $row['label'],
                'answer' => isset($row['answer']) && is_string($row['answer']) && trim($row['answer']) !== ''
                    ? trim($row['answer'])
                    : null,
            ];
        }

        return $answers;
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $messages
     * @param  array<string, mixed>  $context
     * @return array{
     *     message: string,
     *     profile_updates: array<int, array{field: string, label: string, value: string, reason: string}>,
     *     draft_answer: string|null,
     * }|null
     */
    public function chat(CvProfile $profile, array $messages, array $context = []): ?array
    {
        $conversation = $this->normalizeConversationMessages($messages);

        if ($conversation === []) {
            return null;
        }

        $systemPrompt = $this->chatSystemPrompt($profile)
            ."\n\n"
            .$this->chatResponseInstructions();

        if ($context !== []) {
            $systemPrompt .= "\n\nUse this request context when relevant:\n".json_encode(
                $context,
                JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE,
            );
        }

        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => $systemPrompt,
            ],
            ...$conversation,
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.5,
        ]);

        $messageText = $this->extractChatMessage($payload);

        if ($messageText === null) {
            Log::warning('ApplicationAssistantService chat could not parse AI response', [
                'payload_keys' => is_array($payload) ? array_keys($payload) : [],
            ]);

            return null;
        }

        $profileUpdates = [];

        foreach ($payload['profile_updates'] ?? [] as $update) {
            if (! is_array($update) || ! isset($update['field'], $update['value'])) {
                continue;
            }

            $field = (string) $update['field'];

            if (! in_array($field, [
                'headline',
                'phone',
                'location',
                'city',
                'postcode',
                'country',
                'linkedin_url',
                'website_url',
                'summary',
                'extra_context',
            ], true)) {
                continue;
            }

            $value = trim((string) $update['value']);

            if ($value === '') {
                continue;
            }

            $profileUpdates[] = [
                'field' => $field,
                'label' => (string) ($update['label'] ?? ucfirst(str_replace('_', ' ', $field))),
                'value' => $value,
                'reason' => (string) ($update['reason'] ?? ''),
            ];
        }

        $draftAnswer = isset($payload['draft_answer']) && is_string($payload['draft_answer'])
            ? trim($payload['draft_answer'])
            : null;

        return [
            'message' => $messageText,
            'profile_updates' => $profileUpdates,
            'draft_answer' => $draftAnswer !== '' ? $draftAnswer : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $job
     */
    public function generateCoverLetter(CvProfile $profile, array $job, string $tone = 'professional'): ?string
    {
        $result = $this->nanoGpt->chat([
            [
                'role' => 'system',
                'content' => $this->systemPrompt($profile)."\n\nWrite concise, truthful cover letters. Do not invent experience.",
            ],
            [
                'role' => 'user',
                'content' => "Write a {$tone} cover letter for this job. 180-280 words. Plain text only.\n\n"
                    .json_encode($job, JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.5,
        ]);

        return $result !== null && trim($result) !== '' ? trim($result) : null;
    }

    /**
     * @param  array<string, mixed>  $job
     */
    public function generateTailoredResume(CvProfile $profile, array $job, string $template = 'modern'): ?string
    {
        $templateGuide = match ($template) {
            'consulting' => 'Use a concise consulting-style layout: strong action bullets, quantified impact, leadership verbs, one-line role summaries.',
            'harvard' => 'Use a classic Harvard-style CV: reverse chronological roles, education block, skills line, restrained tone, no graphics.',
            default => 'Use a modern professional layout: headline, summary, skills, experience bullets tailored to the job.',
        };

        $result = $this->nanoGpt->chat([
            [
                'role' => 'system',
                'content' => $this->systemPrompt($profile)."\n\nTailor the CV truthfully to the job. Do not invent employers, dates, or qualifications. {$templateGuide} Output plain text only.",
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'job' => $job,
                    'template' => $template,
                    'instructions' => 'Return a complete tailored CV in plain text, 500-900 words, with sections: Name, Headline, Summary, Skills, Experience, Education. Emphasise keywords from the job description using only real profile facts.',
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.45,
        ]);

        return $result !== null && trim($result) !== '' ? trim($result) : null;
    }

    /**
     * @return array{
     *     score: int,
     *     matched_keywords: array<int, string>,
     *     missing_keywords: array<int, string>,
     *     suggestions: array<int, string>
     * }|null
     */
    public function scoreAts(CvProfile $profile, ?string $jobDescription): ?array
    {
        $cvText = trim((string) ($profile->formatted_cv_text ?: $profile->summary));

        if ($cvText === '' || $jobDescription === null || trim($jobDescription) === '') {
            return null;
        }

        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => 'You score CV keyword fit against a job description for ATS-style screening. Be realistic, not flattering.',
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'cv_text' => mb_substr($cvText, 0, 12000),
                    'job_description' => mb_substr(trim($jobDescription), 0, 12000),
                    'response_schema' => [
                        'score' => 'integer 0-100',
                        'matched_keywords' => 'string[]',
                        'missing_keywords' => 'string[]',
                        'suggestions' => 'string[]',
                    ],
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.2,
        ]);

        if ($payload === null) {
            return null;
        }

        return [
            'score' => max(0, min(100, (int) ($payload['score'] ?? 0))),
            'matched_keywords' => array_values(array_filter($payload['matched_keywords'] ?? [], 'is_string')),
            'missing_keywords' => array_values(array_filter($payload['missing_keywords'] ?? [], 'is_string')),
            'suggestions' => array_values(array_filter($payload['suggestions'] ?? [], 'is_string')),
        ];
    }

    public function storeArtifact(
        JobApplication $application,
        ApplicationArtifactType $type,
        string $title,
        string $content,
        ?array $metadata = null,
    ): ApplicationArtifact {
        return $application->artifacts()->create([
            'type' => $type,
            'title' => $title,
            'content' => $content,
            'metadata' => $metadata,
        ]);
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    private function systemPrompt(CvProfile $profile, array $settings = []): string
    {
        $structured = json_encode([
            'full_name' => $profile->full_name,
            'headline' => $profile->headline,
            'summary' => $profile->summary,
            'skills' => $profile->skills,
            'experience' => $profile->experience,
            'education' => $profile->education,
            'structured_data' => $profile->structured_data,
            'extra_context' => $profile->extra_context,
            'application_settings' => $settings,
        ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);

        return "You help a job seeker answer employer application questions using ONLY this profile:\n{$structured}";
    }

    private function chatSystemPrompt(CvProfile $profile): string
    {
        return $this->systemPrompt($profile)."\n\nYou are AutoCVApply's sidebar assistant. Help the user draft application answers, explain their profile, and suggest profile improvements they can approve. Be concise, practical, and truthful. When suggesting profile changes, only propose fields you can support with existing profile facts or explicit user input in the chat.";
    }

    private function chatResponseInstructions(): string
    {
        return 'Respond with JSON only: {"message":"your reply to the user","profile_updates":[{"field":"summary|headline|phone|location|city|postcode|country|linkedin_url|website_url|extra_context","label":"human label","value":"proposed value","reason":"why you suggest this"}],"draft_answer":"optional text to paste into a form field or null"}. Only include profile_updates when you have a concrete, truthful suggestion drawn from the conversation. Never invent employers, dates, or qualifications.';
    }

    /**
     * @param  array<int, array{role?: string, content?: string}>  $messages
     * @return array<int, array{role: string, content: string}>
     */
    private function normalizeConversationMessages(array $messages): array
    {
        $normalized = [];

        foreach ($messages as $message) {
            if (! in_array($message['role'] ?? '', ['user', 'assistant'], true)) {
                continue;
            }

            $content = trim((string) ($message['content'] ?? ''));

            if ($content === '') {
                continue;
            }

            $normalized[] = [
                'role' => $message['role'],
                'content' => $content,
            ];
        }

        return $normalized;
    }

    /**
     * @param  array<string, mixed>|null  $payload
     */
    private function extractChatMessage(?array $payload): ?string
    {
        if ($payload === null) {
            return null;
        }

        foreach (['message', 'reply', 'response', 'answer'] as $key) {
            if (! isset($payload[$key]) || ! is_string($payload[$key])) {
                continue;
            }

            $value = trim($payload[$key]);

            if ($value !== '') {
                return $value;
            }
        }

        return null;
    }
}
