<?php

namespace App\Support;

use App\Models\CvProfile;

/**
 * Reject open-ended Draft All answers that name the wrong employer as the
 * application target (e.g. "eager to join Optro" on a Figma form).
 *
 * Past employers from profile.experience remain allowed; only apply-target
 * phrasing toward a non-job company is nulled.
 */
class JobCompanyAnswerGuard
{
    /**
     * @param  array<string, mixed>  $job
     * @param  array<int, array{label: string, ref?: string|null, field_type?: string, max_chars?: int|null, options?: array<int, string>|null}>  $questions
     * @param  array<int, array{label: string, ref?: string|null, answer: string|null}>  $answers
     * @return array<int, array{label: string, ref?: string|null, answer: string|null}>
     */
    public static function enforceAnswers(array $job, CvProfile $profile, array $questions, array $answers): array
    {
        $jobCompany = self::normalizeCompany(is_string($job['company'] ?? null) ? $job['company'] : '');

        if ($jobCompany === '') {
            return $answers;
        }

        $pastEmployers = self::pastEmployers($profile);
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

            $text = is_string($answer['answer'] ?? null) ? trim($answer['answer']) : '';

            if ($question === null || $text === '' || ! self::questionNeedsGuard($question)) {
                $enforced[] = $answer;

                continue;
            }

            if (self::shouldRejectWrongTargetEmployer($text, $jobCompany, $pastEmployers)) {
                $enforced[] = [
                    'label' => $answer['label'],
                    'answer' => null,
                    'ref' => $answer['ref'] ?? null,
                ];

                continue;
            }

            $enforced[] = $answer;
        }

        return $enforced;
    }

    /**
     * @param  array{label: string, field_type?: string, options?: array<int, string>|null}  $question
     */
    public static function questionNeedsGuard(array $question): bool
    {
        $options = $question['options'] ?? null;

        if (is_array($options) && $options !== []) {
            return false;
        }

        $fieldType = mb_strtolower(trim((string) ($question['field_type'] ?? 'text')));

        if (in_array($fieldType, ['radio', 'select', 'checkbox'], true)) {
            return false;
        }

        $label = mb_strtolower(trim($question['label'] ?? ''));

        if ($label === '') {
            return false;
        }

        if ($fieldType === 'textarea') {
            return true;
        }

        return (bool) preg_match(
            '/\b(?:why|cover letter|additional information|anything else|motivation|interested|tell us about|describe)\b/u',
            $label,
        );
    }

    /**
     * @param  array<int, string>  $pastEmployers
     */
    public static function shouldRejectWrongTargetEmployer(string $answer, string $jobCompany, array $pastEmployers): bool
    {
        $jobCompany = self::normalizeCompany($jobCompany);

        if ($jobCompany === '') {
            return false;
        }

        $normalizedAnswer = self::normalizeCompany($answer);

        if (str_contains($normalizedAnswer, $jobCompany)) {
            return false;
        }

        foreach (self::extractTargetEmployerMentions($answer) as $mentioned) {
            $normalizedMention = self::normalizeCompany($mentioned);

            if ($normalizedMention === '' || mb_strlen($normalizedMention) < 2) {
                continue;
            }

            if (self::companiesMatch($normalizedMention, $jobCompany)) {
                continue;
            }

            if (self::isPastEmployer($normalizedMention, $pastEmployers)) {
                continue;
            }

            return true;
        }

        return false;
    }

    /**
     * @return array<int, string>
     */
    public static function extractTargetEmployerMentions(string $answer): array
    {
        $mentions = [];
        $patterns = [
            '/\b(?:join(?:ing)?|work(?:ing)?\s+(?:at|for)|eager to (?:join|apply)|challenges at|role at|position at|opportunities at|team at|infrastructure (?:engineering )?challenges at)\s+([A-Z][\w&\'\-]*(?:\s+[A-Z][\w&\'\-]*){0,3})/u',
            '/\b(?:apply(?:ing)?\s+(?:to|at|for)|contribute at)\s+([A-Z][\w&\'\-]*(?:\s+[A-Z][\w&\'\-]*){0,3})/u',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match_all($pattern, $answer, $matches) === false) {
                continue;
            }

            foreach ($matches[1] as $match) {
                $company = trim((string) $match, " \t\n\r\0\x0B.,;:!?)");

                if ($company !== '') {
                    $mentions[] = $company;
                }
            }
        }

        return array_values(array_unique($mentions));
    }

    /**
     * @return array<int, string>
     */
    private static function pastEmployers(CvProfile $profile): array
    {
        $employers = [];

        foreach ((array) ($profile->experience ?? []) as $role) {
            if (! is_array($role)) {
                continue;
            }

            $company = self::normalizeCompany(is_string($role['company'] ?? null) ? $role['company'] : '');

            if ($company !== '') {
                $employers[] = $company;
            }
        }

        return array_values(array_unique($employers));
    }

    /**
     * @param  array<int, string>  $pastEmployers
     */
    private static function isPastEmployer(string $mention, array $pastEmployers): bool
    {
        foreach ($pastEmployers as $employer) {
            if (self::companiesMatch($mention, $employer)) {
                return true;
            }
        }

        return false;
    }

    private static function companiesMatch(string $left, string $right): bool
    {
        if ($left === '' || $right === '') {
            return false;
        }

        return $left === $right
            || str_contains($left, $right)
            || str_contains($right, $left);
    }

    private static function normalizeCompany(string $value): string
    {
        $normalized = mb_strtolower(trim($value));
        $normalized = preg_replace('/[^\p{L}\p{N}\s&.\-]/u', ' ', $normalized) ?? $normalized;
        $normalized = preg_replace('/\s+/u', ' ', $normalized) ?? $normalized;

        return trim($normalized);
    }
}
