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

        // "Do you have 4+ years…?" is a Yes/No gate, not a numeric years field.
        if (self::extractYearsExperienceThreshold($text) !== null) {
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

    public static function extractYearsExperienceThreshold(string $label): ?int
    {
        $text = trim(preg_replace('/\s+/u', ' ', $label) ?? '');

        if ($text === '' || preg_match('/\byears?\b/i', $text) !== 1) {
            return null;
        }

        if (preg_match(
            '/(?:at\s+least|minimum(?:\s+of)?|more\s+than|over|above)\s+(\d{1,2})\s*\+?\s*years?|(\d{1,2})\s*\+\s*years?|(\d{1,2})\s+or\s+more\s+years?/i',
            $text,
            $match,
        ) !== 1) {
            return null;
        }

        $rawThreshold = $match[1] ?: ($match[2] ?: ($match[3] ?? null));

        if ($rawThreshold === null || $rawThreshold === '') {
            return null;
        }

        $threshold = (int) $rawThreshold;

        return $threshold > 0 ? $threshold : null;
    }

    public static function isSkillSpecificYearsExperienceQuestion(string $label): bool
    {
        return self::isYearsExperienceQuestion($label)
            && ! self::isGenericTotalExperienceQuestion($label);
    }

    public static function isGenericTotalExperienceQuestion(string $label): bool
    {
        $normalized = mb_strtolower(trim(preg_replace('/\s+/u', ' ', $label) ?? ''));

        if ($normalized === '') {
            return false;
        }

        if (self::extractYearsExperienceThreshold($label) !== null) {
            return false;
        }

        foreach (['years of experience', 'experience years', 'total years of experience', 'overall years of experience'] as $keyword) {
            if (str_contains($normalized, $keyword)) {
                return true;
            }
        }

        return preg_match('/\bhow many years of (?:overall |total )?experience\b/i', $label) === 1
            && ! preg_match('/\bwith\b/i', $label);
    }

    public static function normalize(string $answer, ?string $profileYears = null, ?string $questionLabel = null): string
    {
        $raw = trim($answer);
        $profileYears = $profileYears !== null ? trim($profileYears) : '';
        $allowProfileFallback = $questionLabel === null
            || ! self::isSkillSpecificYearsExperienceQuestion($questionLabel);

        if ($raw === '') {
            if ($allowProfileFallback && preg_match('/^\d+$/', $profileYears) === 1) {
                return self::clampYearsInteger($profileYears) ?? $profileYears;
            }

            return '';
        }

        // Preserve Yes/No gate answers - never rewrite them to profile YOE digits.
        if (preg_match('/^(yes|no)$/i', $raw) === 1) {
            return $raw;
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

        if ($allowProfileFallback && preg_match('/^\d+$/', $profileYears) === 1) {
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
