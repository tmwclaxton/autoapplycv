<?php

namespace App\Support;

use App\Models\CvProfile;

class ProfileIdentityFieldResolver
{
    /**
     * Profile paths filled deterministically from the user's profile - never invented by the LLM.
     *
     * @var array<int, string>
     */
    public const IDENTITY_PATHS = [
        'full_name',
        'full_name.first',
        'full_name.last',
        'email',
        'phone',
        'city',
    ];

    /**
     * @var array<int, array{path: string, keywords: array<int, string>, exact_labels?: array<int, string>}>
     */
    private const LABEL_MAPPINGS = [
        ['path' => 'full_name', 'keywords' => ['full name', 'applicant name', 'your name', 'candidate name'], 'exact_labels' => ['name']],
        ['path' => 'full_name.first', 'keywords' => ['first name', 'given name', 'forename', 'fornamn', 'förnamn']],
        ['path' => 'full_name.last', 'keywords' => ['last name', 'surname', 'family name', 'efternamn']],
        ['path' => 'email', 'keywords' => ['email', 'e-mail', 'personal email', 'e post', 'epost']],
        ['path' => 'phone', 'keywords' => ['phone', 'mobile', 'telephone', 'contact number', 'cell', 'telefon']],
        ['path' => 'city', 'keywords' => ['city', 'current city', 'town', 'stad', 'ort']],
    ];

    /**
     * @var array<int, array{path: string, patterns: array<int, string>}>
     */
    private const DOM_HINT_MAPPINGS = [
        ['path' => 'full_name.first', 'patterns' => ['first_name', 'firstname', 'given_name', 'given-name']],
        ['path' => 'full_name.last', 'patterns' => ['last_name', 'lastname', 'surname', 'family_name', 'family-name']],
        ['path' => 'email', 'patterns' => ['email', 'e_mail', 'e-mail']],
        ['path' => 'phone', 'patterns' => ['phone', 'mobile', 'telephone', 'tel']],
    ];

    private const THIRD_PARTY_CONTACT_PATTERNS = [
        '/\breferences?\b/iu',
        '/\breferees?\b/iu',
        '/\breferrer\b/iu',
        '/\bemergency\s+contact\b/iu',
        '/\bnext\s+of\s+kin\b/iu',
        '/\bprofessional\s+references?\b/iu',
        '/\bcharacter\s+references?\b/iu',
        '/\bplease\s+list\s+(?:three|3|two|2)\s+references?\b/iu',
        '/\bsupervisor\b/iu',
        '/\bprevious\s+employ/iu',
        '/\bemployment\s+history\b/iu',
        '/\bwork\s+history\b/iu',
    ];

    public static function isIdentityPath(string $path): bool
    {
        return in_array($path, self::IDENTITY_PATHS, true);
    }

    /**
     * @param  array{label?: string, ref?: string|null, context?: string|null, dom?: array{id?: string|null, name?: string|null, placeholder?: string|null}|null}  $question
     */
    public static function isThirdPartyContactQuestion(array $question): bool
    {
        $parts = [
            $question['label'] ?? null,
            $question['context'] ?? null,
            is_array($question['dom'] ?? null) ? ($question['dom']['id'] ?? null) : null,
            is_array($question['dom'] ?? null) ? ($question['dom']['name'] ?? null) : null,
            is_array($question['dom'] ?? null) ? ($question['dom']['placeholder'] ?? null) : null,
        ];

        $haystack = implode(' ', array_values(array_filter($parts, fn ($value) => is_string($value) && trim($value) !== '')));

        if ($haystack === '') {
            return false;
        }

        foreach (self::THIRD_PARTY_CONTACT_PATTERNS as $pattern) {
            if (preg_match($pattern, $haystack) === 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array{label?: string, ref?: string|null, dom?: array{id?: string|null, name?: string|null}|null}  $question
     * @return array{path: string}|null
     */
    public static function resolveMappingForQuestion(array $question): ?array
    {
        if (self::isThirdPartyContactQuestion($question)) {
            return null;
        }

        $domMapping = self::resolveMappingFromDomHints($question['dom'] ?? null);

        if ($domMapping !== null) {
            return $domMapping;
        }

        $label = $question['label'] ?? '';

        if (! is_string($label) || trim($label) === '') {
            return null;
        }

        return self::resolveMappingForLabel($label);
    }

    /**
     * @return array{path: string}|null
     */
    public static function resolveMappingForLabel(string $label): ?array
    {
        if (self::isContaminatedQuestionLabel($label)) {
            return null;
        }

        if (self::isCityLocationQuestionLabel($label)) {
            return ['path' => 'city'];
        }

        $normalized = self::normalizeLabelForMapping($label);

        if ($normalized === '') {
            return null;
        }

        foreach (self::LABEL_MAPPINGS as $mapping) {
            if (self::mappingMatchesLabel($mapping, $normalized)) {
                return ['path' => $mapping['path']];
            }
        }

        return null;
    }

    /**
     * @param  array{id?: string|null, name?: string|null}|null  $dom
     * @return array{path: string}|null
     */
    public static function resolveMappingFromDomHints(?array $dom): ?array
    {
        if ($dom === null) {
            return null;
        }

        $tokens = [];

        foreach (['id', 'name'] as $key) {
            if (! isset($dom[$key]) || ! is_string($dom[$key]) || trim($dom[$key]) === '') {
                continue;
            }

            $tokens[] = mb_strtolower(trim($dom[$key]));
        }

        if ($tokens === []) {
            return null;
        }

        $haystack = implode(' ', $tokens);

        foreach (self::DOM_HINT_MAPPINGS as $mapping) {
            foreach ($mapping['patterns'] as $pattern) {
                if (str_contains($haystack, $pattern)) {
                    return ['path' => $mapping['path']];
                }
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    public static function resolveValue(CvProfile $profile, string $path, array $settings = []): ?string
    {
        if ($path === 'full_name.first' || $path === 'full_name.last') {
            $user = $profile->user;
            $fullName = trim((string) ($profile->full_name ?? $user?->name ?? ''));
            $split = self::splitFullName($fullName);

            $value = $path === 'full_name.first' ? $split['first'] : $split['last'];

            return self::meaningful($value) ? $value : null;
        }

        if ($path === 'phone') {
            $phone = trim((string) ($profile->phone ?? ''));

            return self::meaningful($phone) ? self::formatPhoneForForm($profile, $settings, $phone) : null;
        }

        if ($path === 'city') {
            $city = trim((string) ($profile->city ?? ''));

            return self::meaningful($city) ? $city : null;
        }

        $user = $profile->user;

        $value = match ($path) {
            'full_name' => trim((string) ($profile->full_name ?? $user?->name ?? '')),
            'email' => trim((string) ($profile->email ?? $user?->email ?? '')),
            default => null,
        };

        return self::meaningful($value) ? $value : null;
    }

    /**
     * @param  array{label: string, ref?: string|null, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}  $question
     * @param  array<string, mixed>  $settings
     * @return array{label: string, ref?: string, answer: string}|null
     */
    public static function resolveAnswerForQuestion(CvProfile $profile, array $question, array $settings = []): ?array
    {
        if (self::isThirdPartyContactQuestion($question)) {
            return null;
        }

        $mapping = self::resolveMappingForQuestion($question);

        if ($mapping === null || ! self::isIdentityPath($mapping['path'])) {
            return null;
        }

        $value = self::resolveValue($profile, $mapping['path'], $settings);

        if ($value === null) {
            return null;
        }

        $answer = [
            'label' => $question['label'],
            'answer' => $value,
        ];

        if (isset($question['ref']) && is_string($question['ref']) && $question['ref'] !== '') {
            $answer['ref'] = $question['ref'];
        }

        return $answer;
    }

    /**
     * @param  array<int, array{label: string, ref?: string|null, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}>  $questions
     * @param  array<string, mixed>  $settings
     * @return array{
     *     identity_answers: array<int, array{label: string, ref?: string, answer: string}>,
     *     llm_questions: array<int, array{label: string, ref?: string|null, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}>,
     * }
     */
    public static function partitionQuestions(CvProfile $profile, array $questions, array $settings = []): array
    {
        $identityAnswers = [];
        $llmQuestions = [];

        foreach ($questions as $question) {
            $identityAnswer = self::resolveAnswerForQuestion($profile, $question, $settings);

            if ($identityAnswer !== null) {
                $identityAnswers[] = $identityAnswer;

                continue;
            }

            $llmQuestions[] = $question;
        }

        return [
            'identity_answers' => $identityAnswers,
            'llm_questions' => $llmQuestions,
        ];
    }

    /**
     * @param  array<int, array{label: string, ref?: string|null, answer: string|null}>  $answers
     * @param  array<int, array{label: string, ref?: string|null, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}>  $questions
     * @param  array<string, mixed>  $settings
     * @return array<int, array{label: string, ref?: string|null, answer: string|null}>
     */
    public static function enforceIdentityAnswers(CvProfile $profile, array $questions, array $answers, array $settings = []): array
    {
        $questionsByRef = [];
        $questionsByLabel = [];

        foreach ($questions as $question) {
            $questionsByLabel[$question['label']] = $question;

            if (isset($question['ref']) && is_string($question['ref']) && $question['ref'] !== '') {
                $questionsByRef[$question['ref']] = $question;
            }
        }

        $enforced = [];

        foreach ($answers as $answer) {
            $question = null;

            if (isset($answer['ref'], $questionsByRef[$answer['ref']])) {
                $question = $questionsByRef[$answer['ref']];
            } elseif (isset($answer['label'], $questionsByLabel[$answer['label']])) {
                $question = $questionsByLabel[$answer['label']];
            }

            if ($question !== null) {
                $identityAnswer = self::resolveAnswerForQuestion($profile, $question, $settings);

                if ($identityAnswer !== null) {
                    $enforced[] = [
                        'label' => $answer['label'],
                        'answer' => $identityAnswer['answer'],
                        'ref' => $answer['ref'] ?? $identityAnswer['ref'] ?? null,
                    ];

                    continue;
                }
            }

            $enforced[] = $answer;
        }

        return $enforced;
    }

    /**
     * @return array{first: string, last: string}
     */
    public static function splitFullName(string $fullName): array
    {
        $trimmed = trim($fullName);

        if ($trimmed === '') {
            return ['first' => '', 'last' => ''];
        }

        $parts = preg_split('/\s+/u', $trimmed) ?: [];

        if (count($parts) === 1) {
            return ['first' => $parts[0], 'last' => $parts[0]];
        }

        return [
            'first' => $parts[0],
            'last' => implode(' ', array_slice($parts, 1)),
        ];
    }

    public static function identityPromptRules(): string
    {
        return 'Identity fields (first name, last name, full name, email, phone, city/location city): '
            .'copy the exact values from profile.full_name, profile.email, profile.phone, and profile.city. '
            .'Never invent a candidate name, email, phone number, or city. '
            .'If profile.city is empty, return null for city/town/locality fields even when postcode or street appear elsewhere in the batch. '
            .'When city is present, sibling postcode and street fields in the same batch are supporting context for locality - keep them consistent, do not invent a different town. '
            .'Do not localize identity to the job country or form language. '
            .'Never put the candidate\'s own name, email, or phone into referee, reference, or emergency-contact fields; '
            .'use profile.structured_data.references when present, otherwise leave those fields unset. '
            .'Prose answers (motivation, experience, skills) must reflect the candidate\'s real CV and profile only - never a generic or fictional persona.';
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    private static function formatPhoneForForm(CvProfile $profile, array $settings, string $phone): string
    {
        $normalized = preg_replace('/\s+/', '', $phone) ?? '';

        if (str_starts_with($normalized, '+')) {
            return $normalized;
        }

        $code = trim((string) ($settings['phone_country_code'] ?? $settings['phoneCountryCode'] ?? ''));
        $code = preg_replace('/\s+/', '', $code) ?? '';

        if ($code === '') {
            return $normalized;
        }

        return $code.ltrim($normalized, '0');
    }

    private static function meaningful(?string $value): bool
    {
        return $value !== null && trim($value) !== '';
    }

    private static function isContaminatedQuestionLabel(string $label): bool
    {
        $normalized = self::normalizeQuestionLabel($label);

        if ($normalized === '') {
            return false;
        }

        $patterns = [
            '/\bfirst name\b.*\blast name\b/u',
            '/\blast name\b.*\bfirst name\b/u',
            '/\blocation\s*\(\s*city\b.*\bfirst name\b/u',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $normalized) === 1) {
                return true;
            }
        }

        return false;
    }

    public static function isCityLocationQuestionLabel(string $label): bool
    {
        $normalized = self::normalizeQuestionLabel($label);

        if ($normalized === '') {
            return false;
        }

        if (preg_match('/\b(?:first name|last name|race|ethnicity|gender|school|degree|discipline)\b/u', $normalized) === 1) {
            return false;
        }

        if (preg_match('/\blocation\s*\(\s*city\b/u', $normalized) === 1) {
            return true;
        }

        if (preg_match('/\b(?:stad|ort)\b/u', $normalized) === 1) {
            return true;
        }

        return preg_match('/\b(?:city|town)\b/u', $normalized) === 1
            && preg_match('/\blocation\b/u', $normalized) === 1;
    }

    /**
     * @param  array{path: string, keywords: array<int, string>, exact_labels?: array<int, string>}  $mapping
     */
    private static function mappingMatchesLabel(array $mapping, string $normalized): bool
    {
        foreach ($mapping['exact_labels'] ?? [] as $exactLabel) {
            if ($normalized === self::normalizeQuestionLabel($exactLabel)) {
                return true;
            }
        }

        foreach ($mapping['keywords'] as $keyword) {
            if (self::keywordMatchesNormalized($keyword, $normalized)) {
                return true;
            }
        }

        return false;
    }

    private static function keywordMatchesNormalized(string $keyword, string $normalized): bool
    {
        $escaped = preg_quote(mb_strtolower(trim($keyword)), '/');

        return preg_match('/(?:^|\s)'.$escaped.'(?:\s|$)/u', ' '.$normalized.' ') === 1;
    }

    public static function normalizeLabelForMapping(string $label): string
    {
        $normalized = self::normalizeQuestionLabel($label);
        $normalized = self::dedupeNormalizedLabel($normalized);
        $normalized = (string) preg_replace('/\s+required(?:\s+required)*$/u', '', $normalized);

        return trim($normalized);
    }

    private static function dedupeNormalizedLabel(string $normalized): string
    {
        $tokens = preg_split('/\s+/u', trim($normalized)) ?: [];

        if (count($tokens) <= 1) {
            return $normalized;
        }

        for ($phraseLen = 1; $phraseLen <= intdiv(count($tokens), 2); $phraseLen++) {
            if (count($tokens) % $phraseLen !== 0) {
                continue;
            }

            $phrase = array_slice($tokens, 0, $phraseLen);
            $repeats = true;

            for ($index = $phraseLen; $index < count($tokens); $index += $phraseLen) {
                if (array_slice($tokens, $index, $phraseLen) !== $phrase) {
                    $repeats = false;

                    break;
                }
            }

            if ($repeats) {
                return implode(' ', $phrase);
            }
        }

        return $normalized;
    }

    private static function normalizeQuestionLabel(string $label): string
    {
        $label = mb_strtolower(trim($label));
        $label = (string) preg_replace('/\*/', '', $label);
        $label = (string) preg_replace('/[^\p{L}\p{N}\s>\/-]/u', ' ', $label);
        $label = (string) preg_replace('/(\p{L})(required|optional)\b/u', '$1 $2', $label);
        $label = (string) preg_replace('/\s+/u', ' ', $label);

        return trim($label);
    }
}
