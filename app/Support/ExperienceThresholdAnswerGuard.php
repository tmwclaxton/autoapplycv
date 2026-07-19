<?php

namespace App\Support;

use App\Models\CvProfile;

/**
 * Filter-pass Yes/No experience gates ("Do you have 4+ years…?") when the
 * profile timeline supports the threshold, even if NanoGPT self-rejected from
 * a stale/low application_settings.years_of_experience value.
 */
class ExperienceThresholdAnswerGuard
{
    /**
     * @param  array<string, mixed>|null  $settings
     * @param  array<int, array{label: string, ref?: string|null, field_type?: string, options?: array<int, string>|null}>  $questions
     * @param  array<int, array{label: string, ref?: string|null, answer: string|null}>  $answers
     * @return array<int, array{label: string, ref?: string|null, answer: string|null}>
     */
    public static function enforceAnswers(CvProfile $profile, ?array $settings, array $questions, array $answers): array
    {
        $effectiveYears = ProfileExperienceYears::effectiveYears($profile, $settings);

        if ($effectiveYears === null) {
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

            $text = is_string($answer['answer'] ?? null) ? trim($answer['answer']) : '';
            $threshold = $question !== null
                ? YearsExperienceAnswerNormalizer::extractYearsExperienceThreshold($question['label'] ?? '')
                : null;

            if (
                $question === null
                || $threshold === null
                || ! self::isYesNoQuestion($question)
                || ! preg_match('/^no$/i', $text)
                || $effectiveYears < $threshold
            ) {
                $enforced[] = $answer;

                continue;
            }

            $yesOption = self::findYesOption($question['options'] ?? []);

            $enforced[] = [
                'label' => $answer['label'],
                'answer' => $yesOption,
                'ref' => $answer['ref'] ?? null,
            ];
        }

        return $enforced;
    }

    /**
     * @param  array{options?: array<int, string>|null}  $question
     */
    private static function isYesNoQuestion(array $question): bool
    {
        $options = is_array($question['options'] ?? null) ? $question['options'] : [];
        $hasYes = false;
        $hasNo = false;

        foreach ($options as $option) {
            if (! is_string($option)) {
                continue;
            }

            $normalized = strtolower(trim($option));

            if ($normalized === 'yes') {
                $hasYes = true;
            }

            if ($normalized === 'no') {
                $hasNo = true;
            }
        }

        return $hasYes && $hasNo;
    }

    /**
     * @param  array<int, mixed>  $options
     */
    private static function findYesOption(array $options): string
    {
        foreach ($options as $option) {
            if (is_string($option) && strcasecmp(trim($option), 'yes') === 0) {
                return trim($option);
            }
        }

        return 'Yes';
    }
}
