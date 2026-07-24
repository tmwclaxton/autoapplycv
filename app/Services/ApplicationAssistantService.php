<?php

namespace App\Services;

use App\Enums\ApplicationArtifactType;
use App\Models\ApplicationArtifact;
use App\Models\CvProfile;
use App\Models\JobApplication;
use App\Support\AiPhraseDenylist;
use App\Support\ApplicationAnswers;
use App\Support\CoverLetterBodyText;
use App\Support\ProfileAnswerGrounding;
use App\Support\ProfileFieldRegistry;
use App\Support\ProfileIdentityFieldResolver;
use App\Support\ProfileUpdateValueSanitizer;
use App\Support\YearsExperienceAnswerNormalizer;
use Illuminate\Support\Facades\Log;

class ApplicationAssistantService
{
    public function __construct(
        private readonly NanoGptService $nanoGpt,
        private readonly ProfileLocationUpdateResolver $locationUpdates,
        private readonly ProfileWrittenValuePolisher $writtenValuePolisher,
        private readonly ProfileDirectUpdateParser $directUpdateParser,
    ) {}

    /**
     * @param  array<int, array{label: string, ref?: string, field_type?: string, max_chars?: int, options?: array<int, string>}>  $questions
     * @param  array<string, mixed>  $job
     * @param  array<string, mixed>  $settings
     * @return array{
     *     answers: array<int, array{label: string, ref?: string, answer: string|null}>,
     *     usage: array{prompt_tokens: int, completion_tokens: int, total_tokens: int, model: string},
     * }|null
     */
    public function answerQuestions(CvProfile $profile, array $job, array $questions, array $settings = []): ?array
    {
        if ($questions === []) {
            return [
                'answers' => [],
                'usage' => [
                    'prompt_tokens' => 0,
                    'completion_tokens' => 0,
                    'total_tokens' => 0,
                    'model' => (string) config('cv.extraction_model'),
                ],
            ];
        }

        $model = (string) config('cv.extraction_model');
        $partition = ProfileIdentityFieldResolver::partitionQuestions($profile, $questions, $settings);
        $llmQuestions = $partition['llm_questions'];

        if ($llmQuestions === []) {
            return [
                'answers' => $partition['identity_answers'],
                'usage' => [
                    'prompt_tokens' => 0,
                    'completion_tokens' => 0,
                    'total_tokens' => 0,
                    'model' => $model,
                ],
            ];
        }

        $needsFullJobContext = $this->batchNeedsFullProfile($llmQuestions);
        $clarifyingInstructions = $this->clarifyingAnswerInstructions($llmQuestions);
        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => $this->systemPrompt($profile, $settings),
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'job' => $this->compactJobForQuestions($job, $needsFullJobContext),
                    'questions' => $llmQuestions,
                    'instructions' => 'Return JSON: {"answers":[{"label":"exact label from input","ref":"exact ref when provided in input","answer":"string or null"}]}. '
                        .'When a question includes ref, you MUST echo that exact ref on the matching answer row. '
                        .'Read each question label carefully, including any helper text embedded in it, and answer that specific question - do not paste a generic CV summary unless the question explicitly asks for a full background overview. '
                        .'Use job.title, job.company, and job.job_description to tailor answers to this employer and role. '
                        .$clarifyingInstructions
                        .'For field_type radio, select, or checkbox with an options array, you MUST return one exact option string copied verbatim from options. Pick the best fit using application_settings when relevant (visa, relocation, salary, start date, office preference, employment type). Never write a sentence when an option is required. '
                        .'FORMAT DISCIPLINE: Match answer length to the field. '
                        .'For field_type url, email, or tel: return ONLY the URL, email, or phone value - no surrounding sentence. Prefer profile.linkedin_url, profile.website_url, profile.email, profile.phone, or application_answers links. '
                        .'For field_type number: return digits only. '
                        .'For salary / compensation / currency questions: return a number (optionally with £ or k), never an essay. Use application_settings.expected_salary_yearly when present. '
                        .'For notice period questions: return a short phrase only (e.g. "1 month", "2 weeks") from application_settings.notice_period when present. '
                        .'For percentage questions: return a number optionally with %. '
                        .'For open textarea questions about motivation, interest, fit, experience narrative, or skills (not URL/email/phone/number/select/radio): write 2-4 sentences in first person. '
                        .'Do NOT write 2-4 sentences for URL, email, phone, number, salary, notice, percent, radio, or select fields - even if the label mentions GitHub, portfolio, LinkedIn, or experience. '
                        .'Every open-ended textarea answer MUST name at least one real employer AND job title from profile.experience (for example "At Riverbank Systems as Senior Engineer I..."). '
                        .'You MUST cite specific employers, job titles, dates, projects, or highlight bullets from profile.experience, profile.skills, profile.structured_data.projects, or profile.application_answers. '
                        .'Never use vague placeholders like "enterprise software projects", "various startups", or "eager to deepen my expertise" without tying them to a named employer or role from the profile. '
                        .'If code or portfolio work is private, name the real employer and role from the profile and say honestly that it is not public - do not invent a generic fintech or startup scenario. '
                        .'For domain questions (security, SecOps, DevOps), connect only from skills and past roles in the profile - never claim tools or expertise not listed there. '
                        .'Never paste raw profile fields (location strings, summary, headline) into these answers unless the question asks for a full background overview. '
                        .'For location or city autocomplete fields, return only the city name (for example "Belfast") unless the question explicitly asks for full address. Do not repeat the same place name or concatenate city, region, and country redundantly. '
                        .ProfileIdentityFieldResolver::identityPromptRules().' '
                        .'Use null only when the profile truly lacks enough facts. Never invent employers, degrees, dates, skills, or tools not listed in the profile. '
                        .'Match the question language when writing prose, but keep the candidate\'s real name, email, and CV facts unchanged. '
                        .'For logistics or preference yes/no questions (relocate, commute, hybrid, sponsorship, right to work, start date readiness) return only "Yes" or "No" (or the exact option text) using application_settings when present - never a paragraph. '
                        .'For named-tool or platform competence yes/no (Okta, MDM, Jamf, Intune, Helpline, IAM, Active Directory, ServiceNow, Salesforce, AWS, Azure, etc.): answer Yes only when that tool appears in profile.skills or profile.experience technologies/highlights; otherwise return No (or the exact No option). Never invent tool experience. '
                        .'For skill ratings out of 5 or 10, only give a mid/high score when the tool is evidenced on the CV; otherwise return a low score or null. '
                        .'For checkbox groups that allow multiple selections, return comma-separated option texts. '
                        .'For "how many years" experience questions (including skill-specific years on LinkedIn), return only a whole number between 0 and 99 (for example "5"), never a sentence or phrase like "5 years". If the skill or tool is not evidenced on the profile, return 0 or null - never reuse total years_of_experience for a named tool. '
                        .'Keep within max_chars when provided. Plain text only - no markdown.',
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => $model,
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

            $question = $this->matchQuestion($row, $llmQuestions);

            if ($question === null) {
                continue;
            }

            $rawAnswer = isset($row['answer']) && is_string($row['answer']) ? trim($row['answer']) : '';
            $answer = $rawAnswer !== '' ? $this->normalizeAnswerForQuestion($question, $this->sanitizeAssistantText($rawAnswer)) : null;

            if ($answer !== null && YearsExperienceAnswerNormalizer::isYearsExperienceQuestion($question['label'])) {
                $profileYears = data_get($settings, 'yearsOfExperience') ?? data_get($settings, 'years_of_experience');
                $answer = YearsExperienceAnswerNormalizer::normalize(
                    $answer,
                    is_string($profileYears) || is_numeric($profileYears) ? (string) $profileYears : null,
                    $question['label'],
                );
            }

            if ($answer !== null && in_array(strtolower($answer), ['yes', 'no'], true)) {
                $matchedOption = $this->matchAnswerToOption($answer, is_array($question['options'] ?? null) ? $question['options'] : []);

                $answer = $matchedOption ?? strtolower($answer);
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

        $answers = ProfileAnswerGrounding::enforceGroundedAnswers(
            $profile,
            $llmQuestions,
            ProfileIdentityFieldResolver::enforceIdentityAnswers($profile, $llmQuestions, $answers, $settings),
        );

        $answers = array_merge($partition['identity_answers'], $answers);

        $usage = is_array($payload['_usage'] ?? null) ? $payload['_usage'] : [
            'prompt_tokens' => 0,
            'completion_tokens' => 0,
            'total_tokens' => 0,
            'model' => $model,
        ];

        return [
            'answers' => $answers,
            'usage' => $usage,
        ];
    }

    /**
     * @param  array<int, array{label: string, ref?: string, field_type?: string, max_chars?: int, options?: array<int, string>|null, clarifying_answer?: string}>  $questions
     */
    private function clarifyingAnswerInstructions(array $questions): string
    {
        foreach ($questions as $question) {
            if (! is_array($question)) {
                continue;
            }

            $clarifyingAnswer = $question['clarifying_answer'] ?? null;

            if (! is_string($clarifyingAnswer) || trim($clarifyingAnswer) === '') {
                continue;
            }

            return 'When a question includes clarifying_answer, the candidate already answered in their own words in the sidebar. '
                .'Map clarifying_answer to exactly one allowed option from that question\'s options array (copy verbatim). '
                .'Use the profile, job context, and question label to choose the best option. '
                .'For select, radio, or checkbox fields with options, never return the clarifying_answer prose - return only an exact option string. ';
        }

        return '';
    }

    /**
     * @param  array<int, array{label: string, ref?: string, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}>  $questions
     */
    private function batchNeedsFullProfile(array $questions): bool
    {
        foreach ($questions as $question) {
            if ($this->questionNeedsFullProfile($question)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array{label: string, field_type?: string, max_chars?: int|null}  $question
     */
    private function questionNeedsFullProfile(array $question): bool
    {
        return ProfileAnswerGrounding::questionNeedsGrounding($question);
    }

    /**
     * @param  array<string, mixed>  $job
     * @return array<string, mixed>
     */
    private function compactJobForQuestions(array $job, bool $needsFullProfile): array
    {
        if ($needsFullProfile) {
            return $job;
        }

        return [
            'title' => $job['title'] ?? null,
            'company' => $job['company'] ?? null,
            'location' => $job['location'] ?? null,
        ];
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
            return $this->extractBooleanAnswer($answer) ?? $answer;
        }

        if ($this->isYesNoOptions($options)) {
            $booleanToken = $this->extractBooleanAnswer($answer)
                ?? $this->extractAgeThresholdBoolean($question['label'] ?? '', $answer);

            if ($booleanToken !== null) {
                $matched = $this->matchAnswerToOption($booleanToken, $options);

                if ($matched !== null) {
                    return $matched;
                }
            }
        }

        $matchedOption = $this->matchAnswerToOption($answer, $options);

        return $matchedOption ?? $answer;
    }

    /**
     * @param  array<int, string>  $options
     * @return array<int, string>
     */
    private function meaningfulChoiceOptions(array $options): array
    {
        $filtered = [];

        foreach ($options as $option) {
            if (! is_string($option)) {
                continue;
            }

            $trimmed = trim($option);

            if ($trimmed === '' || $this->isPlaceholderChoiceOption($trimmed)) {
                continue;
            }

            $filtered[] = $trimmed;
        }

        return $filtered;
    }

    private function isPlaceholderChoiceOption(string $option): bool
    {
        $normalized = $this->normalizeQuestionLabel($option);

        if ($normalized === '') {
            return true;
        }

        return preg_match('/^(select an option|choose an option|choose one|please select|please choose|select(\s*\.\.\.?)?|--)$/u', $normalized) === 1;
    }

    /**
     * @param  array<int, string>  $options
     */
    private function isYesNoOptions(array $options): bool
    {
        $meaningful = $this->meaningfulChoiceOptions($options);

        if (count($meaningful) !== 2) {
            return false;
        }

        $normalized = array_map(
            fn (string $option): string => $this->normalizeQuestionLabel($option),
            $meaningful,
        );

        sort($normalized);

        return $normalized === ['no', 'yes'];
    }

    private function extractBooleanAnswer(string $answer): ?string
    {
        $normalized = $this->normalizeQuestionLabel($answer);

        if ($normalized === '') {
            return null;
        }

        if (preg_match('/^(yes|y|true)\b/u', $normalized) === 1) {
            return 'yes';
        }

        if (preg_match('/^(no|n|false)\b/u', $normalized) === 1) {
            return 'no';
        }

        if (preg_match('/\b(yes|yeah|yep|true)\b/u', $normalized, $yesMatch) === 1
            && preg_match('/\b(no|nope|false)\b/u', $normalized) !== 1) {
            return 'yes';
        }

        if (preg_match('/\b(no|nope|false)\b/u', $normalized, $noMatch) === 1
            && preg_match('/\b(yes|yeah|yep|true)\b/u', $normalized) !== 1) {
            return 'no';
        }

        return null;
    }

    private function extractAgeThresholdBoolean(string $label, string $answer): ?string
    {
        if (preg_match('/\b(?:over|above|at least|older than)\s+(?:the\s+)?age\s+of\s+(\d{1,3})\b/ui', $label, $thresholdMatch) !== 1
            && preg_match('/\b(\d{1,3})\s*\+\s*(?:years?\s+old)?\b/ui', $label, $thresholdMatch) !== 1) {
            return null;
        }

        $threshold = (int) $thresholdMatch[1];
        $age = null;

        if (preg_match('/(?:^(?:i am|i\'m)\s*(\d{1,3})\b|\b(\d{1,3})\s*(?:years?|yrs?)\s*old\b)/ui', $answer, $ageMatch) === 1) {
            $age = (int) ($ageMatch[1] !== '' ? $ageMatch[1] : $ageMatch[2]);
        } elseif (preg_match('/^\d{1,3}$/u', trim($answer)) === 1) {
            $age = (int) trim($answer);
        }

        if ($age === null) {
            return null;
        }

        return $age >= $threshold ? 'yes' : 'no';
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
     *     profile_updates: array<int, array{field: string, label: string, value: string, reason: string, dashboard_tab: string, dashboard_anchor: string}>,
     *     draft_answer: string|null,
     *     actions: array<int, array<string, mixed>>,
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
        $normalized = $this->normalizeProfileUpdates($payload['profile_updates'] ?? []);
        $profileUpdates = $this->writtenValuePolisher->polishUpdates($this->mergeProfileUpdates(
            $normalized,
            $this->resolveSupplementalLocationUpdates($profile, $conversation, $messageText, $normalized),
        ));
        $draftAnswer = isset($payload['draft_answer']) && is_string($payload['draft_answer'])
            ? $this->sanitizeAssistantText(trim($payload['draft_answer']))
            : null;

        return [
            'message' => $messageText,
            'profile_updates' => $profileUpdates,
            'draft_answer' => $draftAnswer !== '' ? $draftAnswer : null,
            'actions' => $this->buildChatActions($profileUpdates, $draftAnswer !== '' ? $draftAnswer : null),
            'usage' => is_array($payload['_usage'] ?? null) ? $payload['_usage'] : [
                'prompt_tokens' => 0,
                'completion_tokens' => 0,
                'total_tokens' => 0,
                'model' => (string) config('cv.extraction_model'),
            ],
        ];
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $messages
     * @param  array<string, mixed>  $context
     * @param  callable(array<string, mixed>): void  $emit
     */
    public function streamChat(CvProfile $profile, array $messages, array $context, callable $emit, ?array &$usage = null): bool
    {
        $conversation = $this->normalizeConversationMessages($messages);

        if ($conversation === []) {
            return false;
        }

        $payloadMessages = $this->buildChatPayloadMessages($profile, $conversation, $context, stream: true);
        $streamApiUsage = null;

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
            $streamApiUsage,
        );

        if ($content === null) {
            return false;
        }

        $emit([
            'type' => 'processing',
            'phase' => 'actions',
        ]);

        $messageText = $this->sanitizeAssistantText($content);
        $focusedField = is_array($context['focused_field'] ?? null) ? $context['focused_field'] : null;
        $extracted = $this->extractChatActions($profile, $conversation, $messageText, $context);
        $profileUpdates = $this->writtenValuePolisher->formatOnly($this->mergeProfileUpdates(
            $extracted['profile_updates'],
            $this->resolveSupplementalLocationUpdates($profile, $conversation, $messageText, $extracted['profile_updates']),
        ));
        $draftAnswer = $focusedField !== null
            ? $messageText
            : $extracted['draft_answer'];
        $actions = $this->buildChatActions($profileUpdates, $draftAnswer);

        if ($actions !== []) {
            $emit([
                'type' => 'tools',
                'actions' => $actions,
            ]);
        }

        $emit([
            'type' => 'complete',
            'message' => $messageText,
            'profile_updates' => $profileUpdates,
            'draft_answer' => $draftAnswer,
            'actions' => $actions,
        ]);

        if (is_array($streamApiUsage) && ($streamApiUsage['total_tokens'] ?? 0) > 0) {
            $usage = $streamApiUsage;
        } else {
            $promptEstimate = max(1, (int) ceil(mb_strlen(json_encode($payloadMessages, JSON_THROW_ON_ERROR)) / 4));
            $completionEstimate = max(1, (int) ceil(mb_strlen($content) / 4));

            $usage = [
                'prompt_tokens' => $promptEstimate,
                'completion_tokens' => $completionEstimate,
                'total_tokens' => $promptEstimate + $completionEstimate,
                'model' => (string) config('cv.extraction_model'),
            ];
        }

        return true;
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     * @param  array<string, mixed>  $context
     * @return array{
     *     profile_updates: array<int, array{field: string, label: string, value: string, reason: string, dashboard_tab: string, dashboard_anchor: string}>,
     *     draft_answer: string|null,
     * }
     */
    private function extractChatActions(CvProfile $profile, array $conversation, string $assistantMessage, array $context): array
    {
        unset($profile);

        $lastUserMessage = $this->lastUserMessage($conversation);
        $isConfirmation = $lastUserMessage !== null && $this->isProfileUpdateConfirmation($lastUserMessage);

        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => 'Extract structured sidebar actions from an AutoCVApply assist conversation. '
                    .'Return JSON only: {"profile_updates":[{"field":"'.ProfileFieldRegistry::promptFieldIds().'","label":"human label","value":"proposed value, JSON array/object for list fields, or empty string to clear","reason":"why"}],"draft_answer":"optional paste-ready form answer or null"}. '
                    .'You are the only source of Apply actions - infer every profile field the user asked to change from the conversation and assistant reply. '
                    .'Return profile_updates when the user asked to update, set, change, clear, move, or correct a profile field and the assistant agreed, confirmed, or proposed a value - including future tense, brief confirmations, bare-name follow-ups, and "no I meant X not Y" corrections. '
                    .'When the user lists comma-separated field commands such as "email alex@example.com, phone +44..., headline Senior Developer" (with or without "to" after each field name), return one profile_updates entry per field using the values from the user message. '
                    .'When the assistant reply lists concrete changes (bullets or dashes such as "Address line 1 cleared", "Town/city set to X", "location will show as Y"), return one profile_updates entry per field with the final proposed value. '
                    .'When the user asks to move or relocate, include location, city, and state/region when the assistant names them. '
                    .'When the user asks to update all location fields or says "location field too/though", return every related location field (location, city, state/region, postcode, address lines) using values from the conversation. '
                    .'Never treat UI questions ("where is the apply button"), greetings, or meta phrases ("field though") as field values. '
                    .($isConfirmation
                        ? 'The latest user message confirms pending changes - return ALL agreed profile updates from the conversation using the final values stated by the user or assistant. '
                        : '')
                    .'Use empty string value when the user asked to clear or blank a field. '
                    .'Only set draft_answer when the user is drafting a form response and the assistant reply is paste-ready.',
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'conversation' => $conversation,
                    'last_user_message' => $lastUserMessage,
                    'assistant_reply' => $assistantMessage,
                    'context' => $context,
                ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.2,
        ]);

        $profileUpdates = $payload !== null
            ? $this->normalizeProfileUpdates($payload['profile_updates'] ?? [])
            : [];

        if ($profileUpdates === []) {
            $preferAssistantProposal = $this->assistantReplyProposesProfileUpdates($assistantMessage);

            if ($preferAssistantProposal) {
                $profileUpdates = $this->inferProfileUpdatesFromAssistantProposal($conversation, $assistantMessage);
            }

            if ($profileUpdates === []) {
                $profileUpdates = $this->inferProfileUpdatesFromDirectUserRequest($conversation, $assistantMessage);
            }

            if ($profileUpdates === [] && ! $preferAssistantProposal) {
                $profileUpdates = $this->inferProfileUpdatesFromAssistantProposal($conversation, $assistantMessage);
            }

            if ($profileUpdates === [] && $lastUserMessage !== null && str_contains($lastUserMessage, ',')) {
                $profileUpdates = $this->normalizeProfileUpdates(
                    $this->directUpdateParser->parse($lastUserMessage),
                );
            }
        }

        $draftAnswer = $payload !== null && isset($payload['draft_answer']) && is_string($payload['draft_answer'])
            ? $this->sanitizeAssistantText(trim($payload['draft_answer']))
            : null;

        return [
            'profile_updates' => $profileUpdates,
            'draft_answer' => $draftAnswer !== '' ? $draftAnswer : null,
        ];
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     * @return array<int, array{field: string, label: string, value: string, reason: string, dashboard_tab: string, dashboard_anchor: string}>
     */
    private function inferProfileUpdatesFromDirectUserRequest(array $conversation, string $assistantMessage): array
    {
        $lastUserMessage = $this->lastUserMessage($conversation);

        if ($lastUserMessage === null) {
            return [];
        }

        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => 'Parse explicit profile update commands from a user message. '
                    .'Return JSON only: {"profile_updates":[{"field":"'.ProfileFieldRegistry::promptFieldIds().'","label":"human label","value":"proposed value","reason":""}]}. '
                    .'If the user asked to update/set/change a profile field to a specific value, return that update. '
                    .'Parse comma-separated lists with or without "to" (for example "email alex@example.com, phone +44..., headline Senior Developer"). '
                    .'When the user says "location field though" or "too", they mean update location as well using values already discussed - not the words "field though". '
                    .'Use the assistant reply to confirm the value when it names one (including future tense). '
                    .'Return {"profile_updates":[]} when there is no explicit profile field update request.',
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'user_message' => $lastUserMessage,
                    'assistant_reply' => $assistantMessage,
                ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.1,
        ]);

        if ($payload === null) {
            return [];
        }

        return $this->normalizeProfileUpdates($payload['profile_updates'] ?? []);
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     * @return array<int, array{field: string, label: string, value: string, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}>
     */
    private function inferProfileUpdatesFromAssistantProposal(array $conversation, string $assistantMessage): array
    {
        if (trim($assistantMessage) === '') {
            return [];
        }

        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => 'Extract profile field updates the assistant proposed in its reply. '
                    .'Return JSON only: {"profile_updates":[{"field":"'.ProfileFieldRegistry::promptFieldIds().'","label":"human label","value":"proposed value or empty string to clear","reason":""}]}. '
                    .'When the assistant lists changes with bullets or dashes (cleared, set to, updated to, will update, will show as), return one entry per field. '
                    .'Map town/city to city, state/region or county to structured_data.state_region, address line 1 to structured_data.address_line_1. '
                    .'When the assistant gives a combined location such as "Harborford, Buckinghamshire", set location, city, and structured_data.state_region. '
                    .'Use empty string when the assistant said cleared, blank, or removed. '
                    .'Return {"profile_updates":[]} when the assistant did not propose concrete profile field values.',
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'conversation' => array_slice($conversation, -6),
                    'assistant_reply' => $assistantMessage,
                ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.1,
        ]);

        if ($payload === null) {
            return [];
        }

        return $this->normalizeProfileUpdates($payload['profile_updates'] ?? []);
    }

    private function assistantReplyProposesProfileUpdates(string $assistantMessage): bool
    {
        return (bool) preg_match(
            '/(?:\n-\s|^\s*-\s|\*\s+|cleared|left blank|set to|updated to|will update|will show as|will be set|will align)/iu',
            trim($assistantMessage),
        );
    }

    /**
     * @param  array<int, array{field: string, label: string, value: mixed, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}>  $extractedUpdates
     * @return array<int, array{field: string, label: string, value: mixed, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}>
     */
    private function resolveSupplementalLocationUpdates(
        CvProfile $profile,
        array $conversation,
        string $assistantMessage,
        array $extractedUpdates,
    ): array {
        if ($extractedUpdates !== []) {
            return [];
        }

        return $this->locationUpdates->resolve($profile, $conversation, $assistantMessage);
    }

    private function isProfileUpdateConfirmation(string $message): bool
    {
        return (bool) preg_match(
            '/^\s*(?:do it|apply(?: it)?|yes(?: please)?|go ahead|make the changes?|use your tools)\s*[.!?]*\s*$/iu',
            trim($message),
        );
    }

    /**
     * @param  array<int, array{field: string, label: string, value: mixed, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}>  ...$lists
     * @return array<int, array{field: string, label: string, value: mixed, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}>
     */
    private function mergeProfileUpdates(array ...$lists): array
    {
        $merged = [];

        foreach ($lists as $updates) {
            foreach ($updates as $update) {
                $merged[$update['field']] = $update;
            }
        }

        return array_values($merged);
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     */
    private function lastUserMessage(array $conversation): ?string
    {
        for ($index = count($conversation) - 1; $index >= 0; $index--) {
            if (($conversation[$index]['role'] ?? '') !== 'user') {
                continue;
            }

            $content = trim((string) ($conversation[$index]['content'] ?? ''));

            if ($content !== '') {
                return $content;
            }
        }

        return null;
    }

    /**
     * @param  array<int, mixed>  $rawUpdates
     * @return array<int, array{field: string, label: string, value: mixed, reason: string, dashboard_tab: string, dashboard_anchor: string, path: string}>
     */
    private function normalizeProfileUpdates(array $rawUpdates): array
    {
        $profileUpdates = [];

        foreach ($rawUpdates as $update) {
            if (! is_array($update) || ! array_key_exists('field', $update) || ! array_key_exists('value', $update)) {
                continue;
            }

            $field = ProfileFieldRegistry::resolveField((string) $update['field']);
            $metadata = $field !== null ? ProfileFieldRegistry::metadata($field) : null;

            if ($metadata === null) {
                continue;
            }

            $value = $this->normalizeProfileUpdateValue($field, $update['value']);

            if ($value === null && ! in_array($metadata['kind'], ['string', 'settings'], true)) {
                continue;
            }

            if (is_string($value) && ProfileUpdateValueSanitizer::shouldRejectDirectValue($field, $value)) {
                continue;
            }

            $profileUpdates[] = [
                'field' => $field,
                'label' => (string) ($update['label'] ?? $metadata['label']),
                'value' => $value ?? '',
                'reason' => (string) ($update['reason'] ?? ''),
                'dashboard_tab' => $metadata['tab'],
                'dashboard_anchor' => $metadata['anchor'],
                'path' => $metadata['path'],
            ];
        }

        return $profileUpdates;
    }

    private function normalizeProfileUpdateValue(string $field, mixed $rawValue): mixed
    {
        $metadata = ProfileFieldRegistry::metadata($field);

        if ($metadata === null) {
            return null;
        }

        if ($metadata['kind'] === 'array') {
            if (is_array($rawValue)) {
                return $rawValue;
            }

            if (! is_string($rawValue)) {
                return null;
            }

            $trimmed = trim($rawValue);

            if ($trimmed === '') {
                return [];
            }

            $decoded = json_decode($trimmed, true);

            if (is_array($decoded)) {
                return $decoded;
            }

            if (in_array($field, ['skills', 'structured_data.interests', 'structured_data.soft_skills'], true)) {
                return array_values(array_filter(array_map(trim(...), explode(',', $trimmed)), fn (string $item) => $item !== ''));
            }

            return null;
        }

        if (is_array($rawValue)) {
            return json_encode($rawValue, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        }

        return is_string($rawValue) ? trim($rawValue) : (string) $rawValue;
    }

    /**
     * @param  array<int, array{field: string, label: string, value: string, reason: string, dashboard_tab: string, dashboard_anchor: string}>  $profileUpdates
     * @return array<int, array<string, mixed>>
     */
    private function buildChatActions(array $profileUpdates, ?string $draftAnswer): array
    {
        $actions = [];

        foreach ($profileUpdates as $update) {
            $actions[] = [
                'type' => 'profile_update',
                'field' => $update['field'],
                'path' => $update['path'],
                'label' => $update['label'],
                'value' => $update['value'],
                'reason' => $update['reason'],
                'dashboard_tab' => $update['dashboard_tab'],
                'dashboard_anchor' => $update['dashboard_anchor'],
            ];
        }

        if ($draftAnswer !== null && $draftAnswer !== '') {
            $actions[] = [
                'type' => 'copy_draft',
                'label' => 'Draft answer',
                'value' => $draftAnswer,
            ];
        }

        return $actions;
    }

    private function sanitizeAssistantText(string $text): string
    {
        $text = (string) preg_replace('/^Based on your profile,?\s*/iu', '', $text);
        $text = str_replace(["\u{2014}", "\u{2013}"], '-', $text);
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
     * @return array{content: string, usage: array{prompt_tokens: int, completion_tokens: int, total_tokens: int, credits?: float|null, model: string}}|null
     */
    public function generateCoverLetter(CvProfile $profile, array $job, string $tone = 'professional'): ?array
    {
        $result = $this->nanoGpt->chatWithUsage([
            [
                'role' => 'system',
                'content' => $this->systemPrompt($profile)."\n\n".$this->coverLetterWritingGuidelines(),
            ],
            [
                'role' => 'user',
                'content' => "Write a {$tone} cover letter for this job. 180-280 words. Plain text only.\n\n"
                    .$this->coverLetterStructureInstructions()."\n\n"
                    .json_encode([
                        'job' => $job,
                        'candidate_full_name' => $profile->full_name,
                    ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.5,
        ]);

        if ($result === null || trim($result['content']) === '') {
            return null;
        }

        $content = CoverLetterBodyText::finalize(
            $this->sanitizeAssistantText(trim($result['content'])),
            [
                'full_name' => $profile->full_name,
                'headline' => $profile->headline,
                'email' => $profile->email,
                'phone' => $profile->phone,
                'city' => $profile->city,
                'location' => $profile->location,
            ],
            $job,
        );

        return [
            'content' => $content,
            'usage' => [
                'prompt_tokens' => $result['prompt_tokens'],
                'completion_tokens' => $result['completion_tokens'],
                'total_tokens' => $result['total_tokens'],
                'credits' => $result['credits'],
                'model' => $result['model'],
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $job
     * @return array{content: string, usage: array{prompt_tokens: int, completion_tokens: int, total_tokens: int, credits?: float|null, model: string}}|null
     */
    public function generateTailoredResume(CvProfile $profile, array $job, string $template = 'modern'): ?array
    {
        $templateGuide = match ($template) {
            'consulting' => 'Use a concise consulting-style layout: strong action bullets, quantified impact, leadership verbs, one-line role summaries.',
            'harvard' => 'Use a classic Harvard-style CV: reverse chronological roles, education block, skills line, restrained tone, no graphics.',
            default => 'Use a modern professional layout: headline, summary, skills, experience bullets tailored to the job.',
        };

        $result = $this->nanoGpt->chatWithUsage([
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

        if ($result === null || trim($result['content']) === '') {
            return null;
        }

        return [
            'content' => $this->sanitizeAssistantText(trim($result['content'])),
            'usage' => [
                'prompt_tokens' => $result['prompt_tokens'],
                'completion_tokens' => $result['completion_tokens'],
                'total_tokens' => $result['total_tokens'],
                'credits' => $result['credits'],
                'model' => $result['model'],
            ],
        ];
    }

    /**
     * @return array{
     *     score: int,
     *     matched_keywords: array<int, string>,
     *     missing_keywords: array<int, string>,
     *     suggestions: array<int, string>,
     *     usage: array{prompt_tokens: int, completion_tokens: int, total_tokens: int, credits?: float|null, model: string},
     * }|null
     */
    public function scoreAts(CvProfile $profile, ?string $jobDescription, ?string $rolePreferences = null): ?array
    {
        $cvText = trim((string) ($profile->formatted_cv_text ?: $profile->summary));

        if ($cvText === '' || $jobDescription === null || trim($jobDescription) === '') {
            return null;
        }

        $preferences = trim((string) ($rolePreferences ?? ''));

        $systemPrompt = 'You score CV and role-preference fit against a job description for ATS-style screening. '
            .'Weigh keyword overlap between the CV and job description, and whether the job matches the candidate\'s stated role preferences (location, remote/hybrid/on-site, seniority, salary hints). '
            .'Be realistic, not flattering.';

        $payloadInput = [
            'cv_text' => mb_substr($cvText, 0, 12000),
            'job_description' => mb_substr(trim($jobDescription), 0, 12000),
            'response_schema' => [
                'score' => 'integer 0-100',
                'matched_keywords' => 'string[]',
                'missing_keywords' => 'string[]',
                'suggestions' => 'string[]',
            ],
        ];

        if ($preferences !== '') {
            $payloadInput['role_preferences'] = mb_substr($preferences, 0, 500);
        }

        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => $systemPrompt,
            ],
            [
                'role' => 'user',
                'content' => json_encode($payloadInput, JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.2,
        ]);

        if ($payload === null) {
            return null;
        }

        $usage = is_array($payload['_usage'] ?? null) ? $payload['_usage'] : [
            'prompt_tokens' => 0,
            'completion_tokens' => 0,
            'total_tokens' => 0,
            'model' => (string) config('cv.extraction_model'),
        ];

        return [
            'score' => max(0, min(100, (int) ($payload['score'] ?? 0))),
            'matched_keywords' => array_values(array_filter($payload['matched_keywords'] ?? [], 'is_string')),
            'missing_keywords' => array_values(array_filter($payload['missing_keywords'] ?? [], 'is_string')),
            'suggestions' => array_values(array_filter($payload['suggestions'] ?? [], 'is_string')),
            'usage' => $usage,
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
     * Profile slice for assist prompts: all candidate facts except raw/formatted CV text and documents.
     *
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    private function assistProfilePayload(CvProfile $profile, array $settings = []): array
    {
        return [
            'full_name' => $profile->full_name,
            'headline' => $profile->headline,
            'email' => $profile->email,
            'phone' => $profile->phone,
            'location' => $profile->location,
            'city' => $profile->city,
            'postcode' => $profile->postcode,
            'country' => $profile->country,
            'linkedin_url' => $profile->linkedin_url,
            'website_url' => $profile->website_url,
            'summary' => $profile->summary,
            'skills' => $profile->skills,
            'experience' => $profile->experience,
            'education' => $profile->education,
            'structured_data' => $profile->structured_data,
            'extra_context' => $profile->extra_context,
            'application_settings' => array_replace(
                (array) ($profile->application_settings ?? []),
                $settings,
            ),
            'application_answers' => ApplicationAnswers::normalize($profile->application_answers),
        ];
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    private function systemPrompt(CvProfile $profile, array $settings = []): string
    {
        $structured = json_encode(
            $this->assistProfilePayload($profile, $settings),
            JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE,
        );

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
GUIDE
            .AiPhraseDenylist::generationPromptLines().<<<'GUIDE'

Be specific, not generic:
- Ground answers in real details from the profile: company names, job titles, dates, projects, tools, and numbers when available.
- Open-ended answers MUST name at least one real employer AND job title from profile.experience when the profile lists roles.
- Never use vague placeholders ("enterprise software projects", "eager to deepen expertise", "various startups") without anchoring to a named employer or role from the profile.
- Never invent employers, fintech platforms, startup scenarios, metrics, or tech stacks that are not in the profile.
- When job context is available, tie the answer to this employer or role instead of writing something that could fit any company.
- Do not pad with filler or corporate buzzwords. Say what actually happened and why it matters.
- For location answers, keep them concise and non-redundant. Prefer a single city name for autocomplete fields unless the question asks for a full address.
- Never dump concatenated profile location strings or paste summary/headline text into motivation or open-ended questions.
- If portfolio or GitHub work is private, cite the real employer and role from the profile instead of inventing public repos or generic enterprise projects.

Formatting:
- Plain text only. No markdown, bullet lists, headings, or em dashes. Use normal hyphens (-).

Identity (non-negotiable):
- First name, last name, email, phone, and city must match the profile exactly. Never invent or localize identity to the employer's country or language.
- Open-ended answers must reflect this candidate's real experience from the profile - not a generic marketing persona.
GUIDE;
    }

    private function coverLetterWritingGuidelines(): string
    {
        return <<<'GUIDE'
Write concise, truthful cover letters. Do not invent experience, employers, metrics, or tech stacks.

The PDF design template already shows the candidate name, headline, email, phone, and location in a header or sidebar - never repeat those as a letterhead in the body. Do not add date lines, "Re:" subject lines, or job meta lines above the greeting.

Body content must earn the reader's time:
- Name the employer and role early, and give one concrete reason this job fits (drawn from the job description or company context - not generic enthusiasm).
- Ground the middle in one real employer and job title from profile.experience, plus one concrete achievement, responsibility, or skill that maps to this role.
- Close with a short, confident next-step sentence. Do not flatter the company or pad with filler.
- Prefer specific verbs and outcomes over vague claims ("proven track record", "passionate about your mission", "perfect fit", "leverage synergies").
- Sound human: first person, plain words, varied sentence length. Avoid the AI clichés listed in your system guidelines.
GUIDE;
    }

    private function coverLetterStructureInstructions(): string
    {
        return <<<'GUIDE'
Required structure (plain text only):
1. Greeting on its own line: "Dear Hiring Manager," or "Dear {Name}," if hiring_manager, contact_name, or recruiter_name is present in the job payload.
2. Exactly three short body paragraphs (blank line between each):
   - Why this role: state the job title and employer, plus one specific reason you are applying (tie to the job description when available).
   - Relevant experience: name a real employer and title from the profile, and connect one concrete achievement or skill to what this role needs. No invented numbers.
   - Fit close: one or two sentences on what you would bring next, ending with a brief invitation to discuss.
3. Sign-off on its own line ("Yours sincerely," when addressing a named person, otherwise "Yours faithfully,"), then the candidate's full name on the next line.

Do not include contact blocks, addresses, phone numbers, email lines, or a second copy of the candidate name above the greeting.
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
            .'Never open with third-person bios ("James Mitchell is...") or meta prefaces ("Based on your profile", "According to your CV"). '
            .'Match spelling and register to the profile locale (UK profiles: organisation, optimise; US profiles: organization, optimize). '
            .'For yes/no screening questions, lead with Yes or No, then one short reason if helpful. '
            .'For advice questions, give practical guidance to the user - do not write a cover letter. '
            .'Do not describe the user in third person and do not preface with phrases like "Based on your profile". '
            .'Sound human: vary sentence length, use plain words, cite specific profile details, and skip AI clichés (proven track record, passionate, leverage, Furthermore). '
            .'For profile or tooling questions, you may address the user directly, still in plain text. '
            .'When the user asks to update a profile field, confirm what will change in one short sentence only. '
            .'When they move location or ask to update all location fields, briefly confirm the full move (town, region, clearing old street address). '
            .'Apply buttons are generated after your reply from structured profile_updates - wait for that step; never tell them to open the dashboard. '
            .'Do not claim the profile is already saved until they tap Apply.';
    }

    private function chatSystemPrompt(CvProfile $profile): string
    {
        return $this->systemPrompt($profile)."\n\n"
            ."You are AutoCVApply's sidebar assistant. Help the user draft application answers, explain their profile, and suggest profile improvements they can approve. "
            .'Be concise, practical, and truthful. When suggesting profile changes, only propose fields you can support with existing profile facts or explicit user input in the chat. '
            .'When the user asks an employer-style or application-form question - including practice questions about skills, experience, motivation, salary, availability, or fit - write the answer in first person as the candidate. '
            .'Never describe the candidate in third person and never preface with "Based on your profile" or similar meta lines. Give paste-ready application copy. '
            .'Match tone to context: formal UK employer forms use concise professional first person with UK spelling; casual advice can address the user as "you". '
            .'For screening yes/no questions, start with Yes or No. For salary or notice period, use the values from application_settings when present. '
            .'Open-ended form answers must name at least one real employer from profile.experience - never write generic motivation that could fit any candidate.';
    }

    private function chatResponseInstructions(): string
    {
        return 'Respond with JSON only: {"message":"your reply to the user","profile_updates":[{"field":"'.ProfileFieldRegistry::promptFieldIds().'","label":"human label","value":"proposed value, JSON array/object for list fields, or empty string to clear","reason":"why you suggest this"}],"draft_answer":"optional text to paste into a form field or null"}. '
            .'profile_updates is required whenever the user asked to change profile fields - you are the only source of Apply actions. '
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
