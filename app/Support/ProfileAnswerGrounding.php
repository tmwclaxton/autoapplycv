<?php

namespace App\Support;

use App\Models\CvProfile;

class ProfileAnswerGrounding
{
    /**
     * @param  array{label: string, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}  $question
     */
    public static function questionNeedsGrounding(array $question): bool
    {
        $label = trim($question['label'] ?? '');

        if ($label !== '' && YearsExperienceAnswerNormalizer::isYearsExperienceQuestion($label)) {
            return false;
        }

        $options = $question['options'] ?? null;

        if (is_array($options) && $options !== []) {
            return false;
        }

        $fieldType = $question['field_type'] ?? 'text';

        if (in_array($fieldType, ['radio', 'select', 'checkbox'], true)) {
            return false;
        }

        if ($fieldType === 'textarea') {
            return true;
        }

        $label = mb_strtolower(trim($question['label'] ?? ''));

        foreach (self::compactLabelPatterns() as $pattern) {
            if (str_contains($label, $pattern)) {
                return false;
            }
        }

        foreach (self::proseLabelPatterns() as $pattern) {
            if (str_contains($label, $pattern)) {
                return true;
            }
        }

        $maxChars = (int) ($question['max_chars'] ?? 0);

        return $fieldType === 'text' && ($maxChars === 0 || $maxChars >= 80);
    }

    /**
     * @return array<int, string>
     */
    public static function profileEntities(CvProfile $profile): array
    {
        $entities = [];

        foreach ((array) ($profile->skills ?? []) as $skill) {
            if (is_string($skill)) {
                self::pushEntity($entities, $skill);
            }
        }

        foreach ((array) ($profile->experience ?? []) as $role) {
            if (! is_array($role)) {
                continue;
            }

            self::pushEntity($entities, $role['company'] ?? null);
            self::pushEntity($entities, $role['title'] ?? null);

            foreach ((array) ($role['technologies'] ?? []) as $technology) {
                if (is_string($technology)) {
                    self::pushEntity($entities, $technology);
                }
            }

            foreach ((array) ($role['highlights'] ?? []) as $highlight) {
                if (is_string($highlight)) {
                    self::pushEntity($entities, $highlight, minimumLength: 12);
                }
            }
        }

        foreach ((array) data_get($profile->structured_data, 'projects', []) as $project) {
            if (! is_array($project)) {
                continue;
            }

            self::pushEntity($entities, $project['name'] ?? null);
            self::pushEntity($entities, $project['title'] ?? null);
        }

        foreach ((array) data_get($profile->structured_data, 'certifications', []) as $certification) {
            if (! is_array($certification)) {
                continue;
            }

            self::pushEntity($entities, $certification['name'] ?? null);
        }

        foreach (ApplicationAnswers::normalize($profile->application_answers) as $entry) {
            self::pushEntity($entities, $entry['answer'], minimumLength: 12);
        }

        return array_values(array_unique($entities));
    }

    /**
     * @param  array<int, array{label: string, ref?: string|null, answer: string|null}>  $answers
     * @param  array<int, array{label: string, ref?: string|null, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}>  $questions
     * @return array<int, array{label: string, ref?: string|null, answer: string|null}>
     */
    public static function enforceGroundedAnswers(CvProfile $profile, array $questions, array $answers): array
    {
        $entities = self::profileEntities($profile);
        $profileHaystack = self::normalizeForMatch(implode(' ', $entities));

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

            if ($question !== null && is_string($answer['answer'] ?? null) && trim((string) $answer['answer']) !== '') {
                $toolVerdict = self::enforceToolCompetenceAnswer($question, trim((string) $answer['answer']), $profileHaystack);

                if ($toolVerdict !== null) {
                    $enforced[] = [
                        'label' => $answer['label'],
                        'answer' => $toolVerdict,
                        'ref' => $answer['ref'] ?? null,
                    ];

                    continue;
                }
            }

            if ($entities === []
                || $question === null
                || ! self::questionNeedsGrounding($question)
                || ! is_string($answer['answer'] ?? null)
                || trim((string) $answer['answer']) === '') {
                $enforced[] = $answer;

                continue;
            }

            if (self::answerOverlapsProfile(trim((string) $answer['answer']), $entities)) {
                $enforced[] = $answer;

                continue;
            }

            $enforced[] = [
                'label' => $answer['label'],
                'answer' => null,
                'ref' => $answer['ref'] ?? null,
            ];
        }

        return $enforced;
    }

    /**
     * Named-tool Yes/No: revise invented Yes to No when the tool is absent from the profile.
     *
     * @param  array{label: string, field_type?: string, options?: array<int, string>|null}  $question
     * @return string|null Null when this gate does not apply; otherwise the revised answer string.
     */
    private static function enforceToolCompetenceAnswer(array $question, string $answer, string $profileHaystack): ?string
    {
        $label = (string) ($question['label'] ?? '');

        if (! self::isNamedToolCompetenceQuestion($label)) {
            return null;
        }

        $tools = self::namedToolsInLabel($label);

        if ($tools === []) {
            return null;
        }

        if (! self::answerIsAffirmativeYes($answer)) {
            return null;
        }

        foreach ($tools as $tool) {
            if (str_contains($profileHaystack, self::normalizeForMatch($tool))) {
                return null;
            }
        }

        $options = $question['options'] ?? null;

        if (is_array($options) && $options !== []) {
            foreach ($options as $option) {
                if (! is_string($option)) {
                    continue;
                }

                if (preg_match('/^\s*no\b/i', $option) === 1) {
                    return $option;
                }
            }
        }

        return 'No';
    }

    public static function isNamedToolCompetenceQuestion(string $label): bool
    {
        if (self::namedToolsInLabel($label) === []) {
            return false;
        }

        return preg_match('/\b(?:experience|experienced|familiar|proficient|knowledge|worked\s+with|hands[-\s]?on|used|using|support|administer|confident)\b/i', $label) === 1
            || preg_match('/\b(?:do\s+you|have\s+you|are\s+you|can\s+you)\b/i', $label) === 1;
    }

    /**
     * @return array<int, string>
     */
    public static function namedToolsInLabel(string $label): array
    {
        $pattern = '/\b(okta|mdm|jamf|intune|helpline|iam|active\s*directory|servicenow|salesforce|workday|jira|confluence|splunk|crowdstrike|sentinelone|kubernetes|terraform|ansible|docker|aws|azure|gcp|google\s*cloud|microsoft\s*365|office\s*365|auth0|keycloak|cyberark)\b/iu';

        if (preg_match_all($pattern, $label, $matches) !== false && $matches[1] !== []) {
            return array_values(array_unique(array_map(
                static fn (string $tool): string => mb_strtolower(trim($tool)),
                $matches[1],
            )));
        }

        return [];
    }

    public static function answerIsAffirmativeYes(string $answer): bool
    {
        return preg_match('/^\s*y(es)?\b/i', trim($answer)) === 1;
    }

    /**
     * @param  array<int, string>  $entities
     */
    public static function answerOverlapsProfile(string $answer, array $entities): bool
    {
        $normalizedAnswer = self::normalizeForMatch($answer);

        foreach ($entities as $entity) {
            $normalizedEntity = self::normalizeForMatch($entity);

            if ($normalizedEntity === '' || mb_strlen($normalizedEntity) < 3) {
                continue;
            }

            if (str_contains($normalizedAnswer, $normalizedEntity)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<int, string>
     */
    private static function compactLabelPatterns(): array
    {
        return [
            'linkedin',
            'website',
            'portfolio url',
            'github url',
            'gitlab url',
            'url',
            'email',
            'phone',
            'postcode',
            'zip code',
            'zip',
            'salary',
            'compensation',
            'currency',
            'start date',
            'when can you start',
            'available from',
            'first name',
            'last name',
            'full name',
            'country code',
            'location (city)',
            'current location',
            'where are you based',
            'working location',
        ];
    }

    /**
     * @return array<int, string>
     */
    private static function proseLabelPatterns(): array
    {
        return [
            'cover letter',
            'covering letter',
            'motivation',
            'why do you want',
            'why this role',
            'why are you interested',
            'tell us about yourself',
            'describe your experience',
            'describe your',
            'additional information',
            'personal statement',
            'portfolio',
            'github',
            'gitlab',
            'bitbucket',
            'work sample',
            'code sample',
            'security',
            'secops',
            'devops',
            'experience with',
            'background in',
            'previous role',
            'past role',
            'work history',
            'project',
            'explain how',
            'tell us about',
            'share an example',
            'give an example',
            'how do you',
            'what is your experience',
        ];
    }

    /**
     * @param  array<int, string>  $entities
     */
    private static function pushEntity(array &$entities, mixed $value, int $minimumLength = 3): void
    {
        if (! is_string($value)) {
            return;
        }

        $trimmed = trim($value);

        if ($trimmed === '' || mb_strlen($trimmed) < $minimumLength) {
            return;
        }

        $entities[] = $trimmed;
    }

    private static function normalizeForMatch(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = (string) preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $value);
        $value = (string) preg_replace('/\s+/u', ' ', $value);

        return trim($value);
    }
}
