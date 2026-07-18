<?php

namespace App\Support;

use App\Models\CvProfile;

/**
 * Server-side post-answer type-coherence gate for Draft All NanoGPT output.
 * Prefer null (pending) over wrong fills such as Yes on city or salary on notice.
 */
class AnswerTypeCoherence
{
    /**
     * @param  array<int, array{label: string, ref?: string|null, field_type?: string, options?: array<int, string>|null}>  $questions
     * @param  array<int, array{label: string, ref?: string|null, answer: string|null}>  $answers
     * @return array<int, array{label: string, ref?: string|null, answer: string|null}>
     */
    public static function enforceCoherentAnswers(CvProfile $profile, array $questions, array $answers): array
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

            $text = is_string($answer['answer'] ?? null) ? trim($answer['answer']) : '';

            if ($question === null || $text === '') {
                $enforced[] = $answer;

                continue;
            }

            if (self::shouldReject($profile, $question, $text)) {
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
    public static function shouldReject(CvProfile $profile, array $question, string $answer): bool
    {
        $label = mb_strtolower(trim($question['label'] ?? ''));
        $fieldType = mb_strtolower(trim((string) ($question['field_type'] ?? 'text')));
        $options = is_array($question['options'] ?? null) ? $question['options'] : [];
        $trimmed = trim($answer);

        if ($trimmed === '') {
            return false;
        }

        if (self::hasYesNoOptions($options)) {
            return false;
        }

        if (in_array($fieldType, ['radio', 'select', 'checkbox'], true)) {
            return false;
        }

        $isBareYesNo = (bool) preg_match('/^(yes|no)$/i', $trimmed);
        $category = self::classifyLabel($label, $fieldType);

        if ($isBareYesNo && in_array($category, ['locality', 'phone', 'email', 'date', 'number', 'salary', 'notice'], true)) {
            return true;
        }

        if ($category === 'salary' && self::looksLikeNoticePeriod($trimmed)) {
            return true;
        }

        if ($category === 'notice' && self::looksLikeSalaryAmount($trimmed)) {
            return true;
        }

        if ($category === 'email' && self::looksLikePhone($trimmed) && ! self::looksLikeEmail($trimmed)) {
            return true;
        }

        if ($category === 'phone' && self::looksLikeEmail($trimmed)) {
            return true;
        }

        if ($category === 'locality' && (
            self::looksLikeEmail($trimmed)
            || self::looksLikePhone($trimmed)
            || self::looksLikeSalaryAmount($trimmed)
            || self::looksLikeUrl($trimmed)
        )) {
            return true;
        }

        if ($category === 'number' && (
            self::looksLikeNoticePeriod($trimmed)
            || self::looksLikeEmail($trimmed)
            || $isBareYesNo
        )) {
            return true;
        }

        if ($category === 'locality' && self::profileCityEmpty($profile)) {
            return true;
        }

        return false;
    }

    /**
     * @param  array<int, mixed>  $options
     */
    private static function hasYesNoOptions(array $options): bool
    {
        $hasYes = false;
        $hasNo = false;

        foreach ($options as $option) {
            $text = trim((string) $option);

            if (preg_match('/^yes$/i', $text) === 1) {
                $hasYes = true;
            }

            if (preg_match('/^no$/i', $text) === 1) {
                $hasNo = true;
            }
        }

        return $hasYes && $hasNo;
    }

    private static function classifyLabel(string $label, string $fieldType): string
    {
        if ($fieldType === 'email' || preg_match('/\bemail\b/', $label) === 1) {
            return 'email';
        }

        if ($fieldType === 'tel' || preg_match('/\b(?:phone|mobile|telephone)\b/', $label) === 1) {
            return 'phone';
        }

        if ($fieldType === 'date' || preg_match('/\b(?:date of birth|dob|start date|end date)\b/', $label) === 1) {
            return 'date';
        }

        if (preg_match('/\bnotice period\b/', $label) === 1
            || (preg_match('/\bavailability\b/', $label) === 1 && preg_match('/\b(?:notice|start|available)\b/', $label) === 1)) {
            return 'notice';
        }

        if (preg_match('/\b(?:expected salary|salary expectation|desired salary|current salary|last salary|compensation|pay rate|base salary|hourly rate|total package|remuneration|ctc)\b/', $label) === 1
            || (preg_match('/\bsalary\b/', $label) === 1 && ! preg_match('/\bnotice\b/', $label))) {
            return 'salary';
        }

        if ($fieldType === 'number' || preg_match('/\b(?:how many|years of experience|number of)\b/', $label) === 1) {
            return 'number';
        }

        // Visa / work-auth questions often mention "location" but are not locality fields.
        if (preg_match('/\b(?:sponsorship|authorized|right to work|work permit|visa)\b/', $label) === 1) {
            return 'other';
        }

        if (preg_match('/\b(?:city|town)\b/', $label) === 1 && preg_match('/\bcounty\b/', $label) === 1) {
            return 'locality';
        }

        if (preg_match('/\b(?:city|town|postcode|postal code|street address|current location)\b/', $label) === 1
            || (preg_match('/\blocation\b/', $label) === 1 && ! preg_match('/\bcountry\b/', $label))) {
            return 'locality';
        }

        return 'other';
    }

    private static function looksLikeNoticePeriod(string $answer): bool
    {
        if (preg_match('/^(immediate|immediately|asap|available now|now)$/i', $answer) === 1) {
            return true;
        }

        if (preg_match('/^(?:one|two|three|four|five|six)\s+(?:weeks?|months?)\b/i', $answer) === 1) {
            return true;
        }

        return preg_match('/^\d{1,3}\s*(?:weeks?|months?|days?|yrs?|years?)\b/i', $answer) === 1;
    }

    private static function looksLikeSalaryAmount(string $answer): bool
    {
        if (self::looksLikeNoticePeriod($answer)) {
            return false;
        }

        if (preg_match('/^[£$€]?\s*[\d,]+(?:\.\d{2})?\s*(?:k|thousand)?(?:\s*(?:gbp|usd|eur|per\s*year|\/\s*year|pa|annum))?$/i', $answer) !== 1) {
            return false;
        }

        $digits = preg_replace('/[^\d.]/', '', $answer) ?? '';
        $amount = (float) $digits;

        if (! is_finite($amount)) {
            return false;
        }

        if (preg_match('/k\b/i', $answer) === 1 && $amount >= 20 && $amount <= 500) {
            return true;
        }

        return $amount >= 500;
    }

    private static function profileCityEmpty(CvProfile $profile): bool
    {
        $city = trim((string) ($profile->city ?? ''));
        $location = trim((string) ($profile->location ?? ''));

        return $city === '' && $location === '';
    }

    private static function looksLikeEmail(string $answer): bool
    {
        return (bool) preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $answer);
    }

    private static function looksLikePhone(string $answer): bool
    {
        $compact = preg_replace('/\s+/', '', $answer) ?? '';

        return (bool) preg_match('/^\+?\d{10,15}$/', $compact);
    }

    private static function looksLikeUrl(string $answer): bool
    {
        if (preg_match('/^(https?:\/\/|www\.)/i', $answer) === 1) {
            return true;
        }

        return preg_match('/(?:linkedin\.com\/in\/|github\.com\/)/i', $answer) === 1;
    }
}
