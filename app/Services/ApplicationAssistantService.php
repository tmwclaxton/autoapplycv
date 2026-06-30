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
     * @param  array<int, array{label: string, ref?: string, field_type?: string, max_chars?: int, options?: array<int, string>}>  $questions
     * @param  array<string, mixed>  $job
     * @param  array<string, mixed>  $settings
     * @return array<int, array{label: string, ref?: string, answer: string|null}>|null
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
                    'instructions' => 'Return JSON: {"answers":[{"label":"exact label from input","ref":"exact ref when provided in input","answer":"string or null"}]}. '
                        .'When a question includes ref, you MUST echo that exact ref on the matching answer row. '
                        .'Read each question label carefully, including any helper text embedded in it, and answer that specific question - do not paste a generic CV summary unless the question explicitly asks for a full background overview. '
                        .'Use job.title, job.company, and job.job_description to tailor answers to this employer and role. '
                        .'For field_type radio, select, or checkbox with an options array, you MUST return one exact option string copied verbatim from options. Pick the best fit using application_settings when relevant (visa, relocation, salary, start date, office preference, employment type). '
                        .'For open text questions about motivation, interest, or fit, write 2-4 sentences in first person explaining why this role/company specifically appeals to you. '
                        .'Use null only when the profile truly lacks enough facts. Never invent employers, degrees, or dates. '
                        .'For simple yes/no questions return "yes" or "no". For checkbox groups that allow multiple selections, return comma-separated option texts. '
                        .'Keep within max_chars when provided. Plain text only - no markdown.',
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

            $question = $this->matchQuestion($row, $questions);

            if ($question === null) {
                continue;
            }

            $rawAnswer = isset($row['answer']) && is_string($row['answer']) ? trim($row['answer']) : '';
            $answer = $rawAnswer !== '' ? $this->normalizeAnswerForQuestion($question, $this->sanitizeAssistantText($rawAnswer)) : null;

            if ($answer !== null && in_array(strtolower($answer), ['yes', 'no'], true)) {
                $answer = strtolower($answer);
            }

            $entry = [
                'label' => $question['label'],
                'answer' => $answer !== '' ? $answer : null,
            ];

            if (isset($question['ref']) && is_string($question['ref']) && $question['ref'] !== '') {
                $entry['ref'] = $question['ref'];
            }

            $answers[] = $entry;
        }

        return $answers;
    }

    /**
     * @param  array<string, mixed>  $row
     * @param  array<int, array{label: string, ref?: string, field_type?: string, max_chars?: int, options?: array<int, string>|null}>  $questions
     * @return array{label: string, ref?: string, field_type?: string, max_chars?: int, options?: array<int, string>|null}|null
     */
    private function matchQuestion(array $row, array $questions): ?array
    {
        if (isset($row['ref']) && is_string($row['ref']) && trim($row['ref']) !== '') {
            $candidateRef = trim($row['ref']);

            foreach ($questions as $question) {
                if (isset($question['ref']) && $question['ref'] === $candidateRef) {
                    return $question;
                }
            }
        }

        if (! isset($row['label'])) {
            return null;
        }

        return $this->matchQuestionByLabel((string) $row['label'], $questions);
    }

    /**
     * @param  array<int, array{label: string, field_type?: string, max_chars?: int, options?: array<int, string>|null}>  $questions
     * @return array{label: string, field_type?: string, max_chars?: int, options?: array<int, string>|null}|null
     */
    private function matchQuestionByLabel(string $candidateLabel, array $questions): ?array
    {
        $normalizedCandidate = $this->normalizeQuestionLabel($candidateLabel);

        foreach ($questions as $question) {
            if ($this->questionLabelsMatch($question['label'], $candidateLabel)) {
                return $question;
            }
        }

        foreach ($questions as $question) {
            $normalizedQuestion = $this->normalizeQuestionLabel($question['label']);

            if (str_starts_with($normalizedQuestion, $normalizedCandidate)
                || str_starts_with($normalizedCandidate, $normalizedQuestion)) {
                return $question;
            }
        }

        return null;
    }

    /**
     * @param  array{label: string, field_type?: string, max_chars?: int, options?: array<int, string>|null}  $question
     */
    private function normalizeAnswerForQuestion(array $question, string $answer): ?string
    {
        $options = $question['options'] ?? null;

        if (! is_array($options) || $options === []) {
            return $answer;
        }

        $matchedOption = $this->matchAnswerToOption($answer, $options);

        return $matchedOption ?? $answer;
    }

    /**
     * @param  array<int, string>  $options
     */
    private function matchAnswerToOption(string $answer, array $options): ?string
    {
        $normalizedAnswer = $this->normalizeQuestionLabel($answer);

        foreach ($options as $option) {
            if ($this->normalizeQuestionLabel($option) === $normalizedAnswer) {
                return $option;
            }
        }

        foreach ($options as $option) {
            $normalizedOption = $this->normalizeQuestionLabel($option);

            if (str_contains($normalizedOption, $normalizedAnswer)
                || str_contains($normalizedAnswer, $normalizedOption)) {
                return $option;
            }
        }

        return null;
    }

    private function questionLabelsMatch(string $left, string $right): bool
    {
        $a = $this->normalizeQuestionLabel($left);
        $b = $this->normalizeQuestionLabel($right);

        if ($a === $b) {
            return true;
        }

        if (strlen($a) >= 12 && strlen($b) >= 12 && (str_contains($a, $b) || str_contains($b, $a))) {
            return true;
        }

        $prefixLength = min(48, strlen($a), strlen($b));

        return $prefixLength >= 12 && substr($a, 0, $prefixLength) === substr($b, 0, $prefixLength);
    }

    private function normalizeQuestionLabel(string $label): string
    {
        $label = mb_strtolower(trim($label));
        $label = (string) preg_replace('/\*/', '', $label);
        $label = (string) preg_replace('/[^\p{L}\p{N}\s>\/-]/u', '', $label);
        $label = (string) preg_replace('/\s+/u', ' ', $label);

        return trim($label);
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

        $systemPrompt = $this->buildChatSystemPrompt($profile, $context, stream: false);

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

        $messageText = $this->sanitizeAssistantText($messageText);

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
            ? $this->sanitizeAssistantText(trim($payload['draft_answer']))
            : null;

        return [
            'message' => $messageText,
            'profile_updates' => $profileUpdates,
            'draft_answer' => $draftAnswer !== '' ? $draftAnswer : null,
        ];
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $messages
     * @param  array<string, mixed>  $context
     * @param  callable(array<string, mixed>): void  $emit
     */
    public function streamChat(CvProfile $profile, array $messages, array $context, callable $emit): bool
    {
        $conversation = $this->normalizeConversationMessages($messages);

        if ($conversation === []) {
            return false;
        }

        $payloadMessages = $this->buildChatPayloadMessages($profile, $conversation, $context, stream: true);

        $content = $this->nanoGpt->chatStream(
            $payloadMessages,
            static function (string $delta) use ($emit): void {
                $emit([
                    'type' => 'token',
                    'delta' => $delta,
                ]);
            },
            [
                'model' => config('cv.extraction_model'),
                'temperature' => 0.5,
            ],
        );

        if ($content === null) {
            return false;
        }

        $messageText = $this->sanitizeAssistantText($content);
        $focusedField = is_array($context['focused_field'] ?? null) ? $context['focused_field'] : null;
        $draftAnswer = $focusedField !== null ? $messageText : null;

        $emit([
            'type' => 'complete',
            'message' => $messageText,
            'profile_updates' => [],
            'draft_answer' => $draftAnswer,
        ]);

        return true;
    }

    private function sanitizeAssistantText(string $text): string
    {
        $text = (string) preg_replace('/^Based on your profile,?\s*/iu', '', $text);
        $text = str_replace(["\u{2014}", "\u{2013}", '—', '–'], '-', $text);
        $text = (string) preg_replace('/\*\*(.+?)\*\*/s', '$1', $text);
        $text = (string) preg_replace('/\*(.+?)\*/s', '$1', $text);
        $text = (string) preg_replace('/__(.+?)__/s', '$1', $text);
        $text = (string) preg_replace('/_([^_\n]+)_/', '$1', $text);
        $text = (string) preg_replace('/`([^`]+)`/', '$1', $text);
        $text = (string) preg_replace('/^#+\s+/m', '', $text);
        $text = (string) preg_replace('/\[([^\]]+)\]\([^)]+\)/', '$1', $text);

        return trim($text);
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
                'content' => "Write a {$tone} cover letter for this job. 180-280 words. Plain text only. Write in first person. Sound human and specific - mention real details from the profile and tie them to this employer. Avoid generic AI phrases like 'I am excited to apply', 'proven track record', 'passionate', or 'leverage'.\n\n"
                    .json_encode($job, JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.5,
        ]);

        return $result !== null && trim($result) !== '' ? $this->sanitizeAssistantText(trim($result)) : null;
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

        return $result !== null && trim($result) !== '' ? $this->sanitizeAssistantText(trim($result)) : null;
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

        return "You help a job seeker answer employer application questions using ONLY this profile:\n{$structured}\n\n"
            .$this->humanWritingGuidelines();
    }

    private function humanWritingGuidelines(): string
    {
        return <<<'GUIDE'
Write like a real person applying for a job, not like a generic AI template.

Voice and tone:
- Use a warm, conversational professional tone. Sound like the candidate speaking naturally.
- Write application answers in first person.
- Mix short, direct sentences with longer ones. Avoid every sentence having the same length or structure.
- Prefer active voice and plain words (use "use" not "utilize", "help" not "facilitate").

Avoid AI-sounding language. Do not use phrases like:
- Based on your profile / As an AI / I am excited to apply
- proven track record, results-driven, dynamic, passionate, leverage, synergy, cutting-edge
- Furthermore, Moreover, Consequently, It is worth noting, In terms of, Thus, Hence

Be specific, not generic:
- Ground answers in real details from the profile: company names, projects, tools, and numbers when available.
- When job context is available, tie the answer to this employer or role instead of writing something that could fit any company.
- Do not pad with filler or corporate buzzwords. Say what actually happened and why it matters.

Formatting:
- Plain text only. No markdown, bullet lists, headings, or em dashes. Use normal hyphens (-).
GUIDE;
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     * @param  array<string, mixed>  $context
     * @return array<int, array{role: string, content: string}>
     */
    private function buildChatPayloadMessages(CvProfile $profile, array $conversation, array $context, bool $stream): array
    {
        return [
            [
                'role' => 'system',
                'content' => $this->buildChatSystemPrompt($profile, $context, $stream),
            ],
            ...$conversation,
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function buildChatSystemPrompt(CvProfile $profile, array $context, bool $stream): string
    {
        $systemPrompt = $this->chatSystemPrompt($profile)
            ."\n\n"
            .($stream ? $this->chatStreamInstructions() : $this->chatResponseInstructions());

        if ($context !== []) {
            $systemPrompt .= "\n\nUse this request context when relevant:\n".json_encode(
                $context,
                JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE,
            );
        }

        return $systemPrompt;
    }

    private function chatStreamInstructions(): string
    {
        return 'Reply in plain text only. No markdown, no bullet syntax, no bold, no headings, and use normal hyphens (-) instead of em dashes. '
            .'For employer-style or application-form questions, write in first person as the candidate and make the answer paste-ready. '
            .'Do not describe the user in third person and do not preface with phrases like "Based on your profile". '
            .'Sound human: vary sentence length, use plain words, cite specific profile details, and skip AI clichés (proven track record, passionate, leverage, Furthermore). '
            .'For profile or tooling questions, you may address the user directly, still in plain text.';
    }

    private function chatSystemPrompt(CvProfile $profile): string
    {
        return $this->systemPrompt($profile)."\n\n"
            ."You are AutoCVApply's sidebar assistant. Help the user draft application answers, explain their profile, and suggest profile improvements they can approve. "
            .'Be concise, practical, and truthful. When suggesting profile changes, only propose fields you can support with existing profile facts or explicit user input in the chat. '
            .'When the user asks an employer-style or application-form question - including practice questions about skills, experience, motivation, salary, availability, or fit - write the answer in first person as the candidate. '
            .'Do not describe the user in third person and do not preface with phrases like "Based on your profile". Give paste-ready application copy.';
    }

    private function chatResponseInstructions(): string
    {
        return 'Respond with JSON only: {"message":"your reply to the user","profile_updates":[{"field":"summary|headline|phone|location|city|postcode|country|linkedin_url|website_url|extra_context","label":"human label","value":"proposed value","reason":"why you suggest this"}],"draft_answer":"optional text to paste into a form field or null"}. '
            .'Use plain text only in message and draft_answer: no markdown, no bullet syntax, no bold, no headings, and use normal hyphens (-) instead of em dashes. '
            .'For application-form questions, message must be written in first person as the candidate and ready to paste into the employer form. '
            .'Put the same paste-ready first-person answer in draft_answer when focused_field is present or when the user is clearly drafting a form response. '
            .'Only include profile_updates when you have a concrete, truthful suggestion drawn from the conversation. Never invent employers, dates, or qualifications.';
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
