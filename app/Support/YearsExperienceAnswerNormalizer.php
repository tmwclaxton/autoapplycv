<?php

namespace App\Support;

class YearsExperienceAnswerNormalizer
{
    public static function isYearsExperienceQuestion(string $label): bool
    {
        $text = trim(preg_replace('/\s+/u', ' ', $label) ?? '');

        if ($text === '') {
            return false;
        }

        if (preg_match('/\bwhole number between 0 and 99\b/i', $text) === 1) {
            return true;
        }

        if (preg_match('/\bhow many years\b/i', $text) === 1) {
            return true;
        }

        return preg_match('/\byears? of (?:work )?experience\b/i', $text) === 1
            && preg_match('/\b(how many|with|in|using|have|do you)\b/i', $text) === 1;
    }

    public static function normalize(string $answer, ?string $profileYears = null): string
    {
        $raw = trim($answer);
        $profileYears = $profileYears !== null ? trim($profileYears) : '';

        if ($raw === '') {
            if (preg_match('/^\d+$/', $profileYears) === 1) {
                return self::clampYearsInteger($profileYears) ?? $profileYears;
            }

            return '';
        }

        if (preg_match('/^\d+$/', $raw) === 1) {
            return self::clampYearsInteger($raw) ?? $raw;
        }

        if (preg_match('/^(\d+)\s*\+?\s*(?:years?|yrs?)\b/i', $raw, $leadingMatch) === 1) {
            return self::clampYearsInteger($leadingMatch[1]) ?? $leadingMatch[1];
        }

        if (preg_match('/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i', $raw, $embeddedMatch) === 1) {
            return self::clampYearsInteger($embeddedMatch[1]) ?? $embeddedMatch[1];
        }

        if (preg_match('/^\d+$/', $profileYears) === 1) {
            return self::clampYearsInteger($profileYears) ?? $profileYears;
        }

        return $raw;
    }

    private static function clampYearsInteger(string $value): ?string
    {
        if (! ctype_digit($value)) {
            return null;
        }

        $parsed = (int) $value;

        return (string) min(99, max(0, $parsed));
    }
}
