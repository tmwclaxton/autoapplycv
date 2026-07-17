<?php

namespace App\Support;

/**
 * Normalises cover letter body copy for designed PDFs.
 *
 * Design templates already render name/contact in a header or sidebar, so the
 * body must not repeat that letterhead. Drafts should open with a greeting and
 * close with a proper sign-off plus full name.
 */
class CoverLetterBodyText
{
    /**
     * @param  array<string, mixed>|null  $profile
     * @param  array<string, mixed>|null  $job
     */
    public static function finalize(string $text, ?array $profile = null, ?array $job = null): string
    {
        $normalized = self::normalizeNewlines($text);
        $stripped = self::stripLeadingLetterhead($normalized, $profile);

        return self::ensureGreetingAndSignOff($stripped, $profile, $job);
    }

    /**
     * Remove a leading identity / letterhead stack that duplicates the design header.
     *
     * @param  array<string, mixed>|null  $profile
     */
    public static function stripLeadingLetterhead(string $text, ?array $profile = null): string
    {
        $text = self::normalizeNewlines($text);

        if ($text === '') {
            return '';
        }

        $lines = explode("\n", $text);
        $identityValues = self::identityValues($profile);
        $index = 0;

        while ($index < count($lines)) {
            $line = trim($lines[$index]);

            if ($line === '') {
                $index++;

                continue;
            }

            if (self::looksLikeGreeting($line) || self::looksLikeProseStart($line)) {
                break;
            }

            if (self::looksLikeLetterheadLine($line, $identityValues)) {
                $index++;

                continue;
            }

            break;
        }

        return trim(implode("\n", array_slice($lines, $index)));
    }

    /**
     * @param  array<string, mixed>|null  $profile
     * @param  array<string, mixed>|null  $job
     */
    public static function ensureGreetingAndSignOff(string $text, ?array $profile = null, ?array $job = null): string
    {
        $text = self::normalizeNewlines($text);

        if ($text === '') {
            return '';
        }

        $fullName = trim((string) ($profile['full_name'] ?? ''));
        $hiringManager = trim((string) ($job['hiring_manager'] ?? $job['contact_name'] ?? $job['recruiter_name'] ?? ''));
        $greeting = $hiringManager !== ''
            ? 'Dear '.$hiringManager.','
            : 'Dear Hiring Manager,';
        $signOff = $hiringManager !== ''
            ? 'Yours sincerely,'
            : 'Yours faithfully,';

        if (! self::looksLikeGreeting(explode("\n", $text)[0] ?? '')) {
            $text = $greeting."\n\n".$text;
        }

        if (! self::hasSignOff($text)) {
            $text = rtrim($text)."\n\n{$signOff}";

            if ($fullName !== '') {
                $text .= "\n{$fullName}";
            }
        } elseif ($fullName !== '' && ! self::endsWithFullName($text, $fullName)) {
            $text = rtrim($text)."\n{$fullName}";
        }

        return trim($text);
    }

    private static function normalizeNewlines(string $text): string
    {
        return trim(str_replace(["\r\n", "\r"], "\n", $text));
    }

    /**
     * @param  array<string, mixed>|null  $profile
     * @return list<string>
     */
    private static function identityValues(?array $profile): array
    {
        if ($profile === null) {
            return [];
        }

        $values = [];

        foreach ([
            $profile['full_name'] ?? null,
            $profile['headline'] ?? null,
            $profile['email'] ?? null,
            $profile['phone'] ?? null,
            $profile['location'] ?? null,
            $profile['city'] ?? null,
        ] as $value) {
            $normalized = self::normalizeIdentity((string) $value);

            if ($normalized !== '') {
                $values[] = $normalized;
            }
        }

        return array_values(array_unique($values));
    }

    private static function normalizeIdentity(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = (string) preg_replace('/\s+/u', ' ', $value);

        return $value;
    }

    private static function looksLikeGreeting(string $line): bool
    {
        return (bool) preg_match('/^(dear\b|to whom it may concern\b|hi\b|hello\b)/i', trim($line));
    }

    private static function looksLikeProseStart(string $line): bool
    {
        $line = trim($line);

        if (preg_match('/^(I|I\'m|I\'d|My|As|Having|With|Please|Thank|Following)\b/i', $line)) {
            return true;
        }

        if (mb_strlen($line) > 90) {
            return true;
        }

        return (bool) (preg_match('/[.!?]/', $line) && str_word_count($line) > 8);
    }

    /**
     * @param  list<string>  $identityValues
     */
    private static function looksLikeLetterheadLine(string $line, array $identityValues): bool
    {
        $line = trim($line);
        $normalized = self::normalizeIdentity($line);

        if ($normalized === '') {
            return false;
        }

        foreach ($identityValues as $value) {
            if ($value === $normalized) {
                return true;
            }

            if (self::isLooseLocationMatch($normalized, $value) && str_word_count($line) <= 6 && ! preg_match('/[.!?]/', $line)) {
                return true;
            }
        }

        if (filter_var($line, FILTER_VALIDATE_EMAIL) || preg_match('/^\S+@\S+\.\S+$/', $line) === 1) {
            return true;
        }

        $digits = preg_replace('/\D+/', '', $line) ?? '';

        if (strlen($digits) >= 7 && strlen($digits) <= 15 && preg_match('/^[\d\s\-+().]+$/', $line) === 1) {
            return true;
        }

        if (str_contains($line, '|') && (str_contains($line, '@') || preg_match('/\d{3,}/', $line) === 1)) {
            return true;
        }

        if (preg_match('/^\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i', $line) === 1) {
            return true;
        }

        if (preg_match('/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}$/i', $line) === 1) {
            return true;
        }

        if (preg_match('/^[A-Z0-9][A-Z0-9\s\/&.,\'-]{2,}(?:·|•|\|)[A-Z0-9\s\/&.,\'-]{2,}$/u', $line) === 1) {
            return true;
        }

        return false;
    }

    private static function isLooseLocationMatch(string $line, string $identityValue): bool
    {
        if ($line === '' || $identityValue === '') {
            return false;
        }

        if (str_contains($identityValue, $line) || str_contains($line, $identityValue)) {
            return true;
        }

        $lineTokens = array_values(array_filter(preg_split('/[\s,]+/', $line) ?: []));
        $identityTokens = array_values(array_filter(preg_split('/[\s,]+/', $identityValue) ?: []));

        if ($lineTokens === [] || $identityTokens === []) {
            return false;
        }

        $overlap = array_intersect($lineTokens, $identityTokens);

        return count($overlap) >= 1 && count($lineTokens) <= 4;
    }

    private static function hasSignOff(string $text): bool
    {
        return (bool) preg_match(
            '/^\s*(yours\s+(sincerely|faithfully)|kind\s+regards|best\s+regards|warm\s+regards|regards|sincerely)\s*,?\s*$/im',
            $text,
        );
    }

    private static function endsWithFullName(string $text, string $fullName): bool
    {
        $lines = preg_split('/\n+/', trim($text)) ?: [];
        $last = trim((string) end($lines));

        return self::normalizeIdentity($last) === self::normalizeIdentity($fullName);
    }
}
