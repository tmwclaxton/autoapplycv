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

        if ($entities === []) {
            return $answers;
        }

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

            if ($question === null
                || ! self::questionNeedsGrounding($question)
                || ! is_string($answer['answer'])
                || trim($answer['answer']) === '') {
                $enforced[] = $answer;

                continue;
            }

            if (self::answerOverlapsProfile(trim($answer['answer']), $entities)) {
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
