<?php

namespace App\Services;

class AnswerFormatValidator
{
    /**
     * @param  array<string, mixed>  $scenario
     * @return array{
     *     passed: bool,
     *     failures: list<string>,
     *     checks: array<string, bool>,
     *     word_count: int,
     *     char_count: int,
     * }
     */
    public function validate(?string $answer, array $scenario): array
    {
        $trimmed = trim((string) $answer);
        $failures = [];
        $checks = [];

        $checks['non_empty'] = $trimmed !== '';
        if (! $checks['non_empty']) {
            $failures[] = 'answer_empty';
        }

        $charCount = mb_strlen($trimmed);
        $wordCount = $this->wordCount($trimmed);

        $checks['shape'] = $trimmed === '' || $this->passesShape($trimmed, $scenario, $failures);
        $checks['max_chars'] = $this->passesMaxChars($trimmed, $scenario, $failures);
        $checks['max_words'] = $this->passesMaxWords($trimmed, $wordCount, $scenario, $failures);
        $checks['min_words'] = $this->passesMinWords($trimmed, $wordCount, $scenario, $failures);
        $checks['must_match'] = $this->passesMustMatch($trimmed, $scenario, $failures);
        $checks['must_mention'] = $this->passesMustMention($trimmed, $scenario, $failures);
        $checks['must_not_mention'] = $this->passesMustNotMention($trimmed, $scenario, $failures);
        $checks['brevity'] = $this->passesBrevity($trimmed, $wordCount, $scenario, $failures);
        $checks['no_essay_fluff'] = $this->passesNoEssayFluff($trimmed, $wordCount, $scenario, $failures);

        $passed = $failures === [];

        return [
            'passed' => $passed,
            'failures' => $failures,
            'checks' => $checks,
            'word_count' => $wordCount,
            'char_count' => $charCount,
        ];
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @param  list<string>  $failures
     */
    private function passesShape(string $answer, array $scenario, array &$failures): bool
    {
        $shape = (string) ($scenario['answer_shape'] ?? '');
        $options = is_array($scenario['options'] ?? null) ? $scenario['options'] : [];

        $ok = match ($shape) {
            'yes_no' => $this->matchesYesNo($answer, $options),
            'digit' => (bool) preg_match('/^\d+$/', $answer),
            'short_number' => (bool) preg_match('/^\d{1,7}(?:\.\d{1,2})?$/', $answer),
            'one_liner' => ! str_contains($answer, "\n") && $this->wordCount($answer) <= 20,
            'short_paragraph' => $this->wordCount($answer) <= 120 && substr_count($answer, "\n") <= 4,
            'long_paragraph' => $this->wordCount($answer) >= 40 && $this->wordCount($answer) <= 350,
            'url' => $this->looksLikeUrl($answer),
            'email' => filter_var($answer, FILTER_VALIDATE_EMAIL) !== false,
            'phone' => (bool) preg_match('/^\+?[\d\s().-]{7,20}$/', $answer) && preg_match_all('/\d/', $answer) >= 7,
            'date' => $this->looksLikeDate($answer),
            'currency' => $this->looksLikeCurrency($answer),
            'select_option' => $this->matchesOption($answer, $options),
            'notice_period' => $this->looksLikeNoticePeriod($answer),
            'percent' => (bool) preg_match('/^\d{1,3}(?:\.\d{1,2})?\s*%?$/', $answer),
            default => false,
        };

        if (! $ok) {
            $failures[] = "shape:{$shape}";
        }

        return $ok;
    }

    /**
     * @param  list<mixed>  $options
     */
    private function matchesYesNo(string $answer, array $options): bool
    {
        if ($options !== []) {
            return $this->matchesOption($answer, $options);
        }

        return (bool) preg_match('/^(yes|no)$/i', $answer);
    }

    /**
     * @param  list<mixed>  $options
     */
    private function matchesOption(string $answer, array $options): bool
    {
        $normalized = mb_strtolower(trim($answer));

        foreach ($options as $option) {
            if (! is_string($option) && ! is_numeric($option)) {
                continue;
            }

            if ($normalized === mb_strtolower(trim((string) $option))) {
                return true;
            }
        }

        return false;
    }

    private function looksLikeUrl(string $answer): bool
    {
        if (filter_var($answer, FILTER_VALIDATE_URL) !== false) {
            return true;
        }

        return (bool) preg_match('#^(https?://)?(www\.)?(linkedin\.com|github\.com)/[\w./%-]+$#i', $answer)
            || (bool) preg_match('#^[a-z0-9.-]+\.[a-z]{2,}(/[\w./%-]*)?$#i', $answer);
    }

    private function looksLikeDate(string $answer): bool
    {
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $answer) === 1) {
            return true;
        }

        if (preg_match('/^\d{4}-\d{2}$/', $answer) === 1) {
            return true;
        }

        if (preg_match('/^\d{4}$/', $answer) === 1) {
            return true;
        }

        if (preg_match('/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/', $answer) === 1) {
            return true;
        }

        if (preg_match('/^(immediate(ly)?|asap|upon offer|available now|after notice|present)$/i', $answer) === 1) {
            return true;
        }

        // Common ATS free-text availability, e.g. "1 month from offer", "after 4 weeks notice".
        if ($this->wordCount($answer) <= 8 && (
            preg_match('/\b(day|days|week|weeks|month|months|notice|offer|start)\b/i', $answer) === 1
            || $this->looksLikeNoticePeriod($answer)
        )) {
            return true;
        }

        $parsed = strtotime($answer);

        return $parsed !== false;
    }

    private function looksLikeCurrency(string $answer): bool
    {
        return (bool) preg_match('/^£?\s*\$?\s*\d{2,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:k|K)?$/', $answer)
            || (bool) preg_match('/^\d{4,6}$/', $answer);
    }

    private function looksLikeNoticePeriod(string $answer): bool
    {
        return (bool) preg_match('/^(\d+\s*(day|days|week|weeks|month|months)|immediate(ly)?|none)$/i', $answer)
            && $this->wordCount($answer) <= 4;
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @param  list<string>  $failures
     */
    private function passesMaxChars(string $answer, array $scenario, array &$failures): bool
    {
        if (! isset($scenario['max_chars']) || ! is_int($scenario['max_chars'])) {
            return true;
        }

        $ok = mb_strlen($answer) <= $scenario['max_chars'];
        if (! $ok) {
            $failures[] = 'max_chars';
        }

        return $ok;
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @param  list<string>  $failures
     */
    private function passesMaxWords(string $answer, int $wordCount, array $scenario, array &$failures): bool
    {
        if ($answer === '' || ! isset($scenario['max_words']) || ! is_int($scenario['max_words'])) {
            return true;
        }

        $ok = $wordCount <= $scenario['max_words'];
        if (! $ok) {
            $failures[] = 'max_words';
        }

        return $ok;
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @param  list<string>  $failures
     */
    private function passesMinWords(string $answer, int $wordCount, array $scenario, array &$failures): bool
    {
        if ($answer === '' || ! isset($scenario['min_words']) || ! is_int($scenario['min_words'])) {
            return true;
        }

        $ok = $wordCount >= $scenario['min_words'];
        if (! $ok) {
            $failures[] = 'min_words';
        }

        return $ok;
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @param  list<string>  $failures
     */
    private function passesMustMatch(string $answer, array $scenario, array &$failures): bool
    {
        $pattern = $scenario['must_match'] ?? null;
        if (! is_string($pattern) || $pattern === '') {
            return true;
        }

        $ok = preg_match($pattern, $answer) === 1;
        if (! $ok) {
            $failures[] = 'must_match';
        }

        return $ok;
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @param  list<string>  $failures
     */
    private function passesMustMention(string $answer, array $scenario, array &$failures): bool
    {
        $needles = is_array($scenario['must_mention'] ?? null) ? $scenario['must_mention'] : [];
        if ($needles === []) {
            return true;
        }

        $haystack = mb_strtolower($answer);
        $answerDigits = preg_replace('/\D+/', '', $haystack) ?? '';

        foreach ($needles as $needle) {
            if (! is_string($needle) || $needle === '') {
                continue;
            }

            $normalizedNeedle = mb_strtolower($needle);
            $needleDigits = preg_replace('/\D+/', '', $normalizedNeedle) ?? '';

            if (str_contains($haystack, $normalizedNeedle)) {
                continue;
            }

            // Tolerate currency/number formatting: "65000" matches "£65,000" / "65k" via digits.
            if ($needleDigits !== '' && $answerDigits !== '' && str_contains($answerDigits, $needleDigits)) {
                continue;
            }

            $failures[] = 'must_mention:'.$needle;

            return false;
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @param  list<string>  $failures
     */
    private function passesMustNotMention(string $answer, array $scenario, array &$failures): bool
    {
        $needles = is_array($scenario['must_not_mention'] ?? null) ? $scenario['must_not_mention'] : [];
        if ($needles === []) {
            return true;
        }

        $haystack = mb_strtolower($answer);
        foreach ($needles as $needle) {
            if (! is_string($needle) || $needle === '') {
                continue;
            }

            if (str_contains($haystack, mb_strtolower($needle))) {
                $failures[] = 'must_not_mention:'.$needle;

                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @param  list<string>  $failures
     */
    private function passesBrevity(string $answer, int $wordCount, array $scenario, array &$failures): bool
    {
        if ($answer === '') {
            return true;
        }

        $brevity = (string) ($scenario['brevity'] ?? 'brief');
        $shape = (string) ($scenario['answer_shape'] ?? '');

        $ok = match ($brevity) {
            'minimal' => $wordCount <= (in_array($shape, ['yes_no', 'digit', 'short_number', 'percent', 'currency', 'select_option'], true) ? 4 : 8),
            'brief' => $wordCount <= 40,
            'substance' => $wordCount >= 25,
            default => true,
        };

        if (! $ok) {
            $failures[] = 'brevity:'.$brevity;
        }

        return $ok;
    }

    /**
     * Trap formats: salary/digit/yes_no answers must not become essays.
     *
     * @param  array<string, mixed>  $scenario
     * @param  list<string>  $failures
     */
    private function passesNoEssayFluff(string $answer, int $wordCount, array $scenario, array &$failures): bool
    {
        $shape = (string) ($scenario['answer_shape'] ?? '');
        $trapShapes = ['yes_no', 'digit', 'short_number', 'currency', 'percent', 'select_option', 'phone', 'email', 'url', 'date', 'notice_period'];

        if (! in_array($shape, $trapShapes, true)) {
            return true;
        }

        $ok = $wordCount <= 12 && ! preg_match('/\b(i believe|passionate|proven track record|synerg|delighted to|eager to)\b/i', $answer);
        if (! $ok) {
            $failures[] = 'essay_fluff';
        }

        return $ok;
    }

    private function wordCount(string $text): int
    {
        $trimmed = trim($text);
        if ($trimmed === '') {
            return 0;
        }

        return count(preg_split('/\s+/u', $trimmed, -1, PREG_SPLIT_NO_EMPTY) ?: []);
    }
}
