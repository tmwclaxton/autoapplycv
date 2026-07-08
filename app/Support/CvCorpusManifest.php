<?php

namespace App\Support;

class CvCorpusManifest
{
    public static function corpusRoot(): string
    {
        return base_path('tests/fixtures/cv-corpus');
    }

    public static function manifestPath(): string
    {
        return self::corpusRoot().'/manifest.json';
    }

    public static function sourcesPath(): string
    {
        return base_path('scripts/cv-corpus/sources.json');
    }

    /**
     * @return array{
     *     version: int,
     *     generated_at: string|null,
     *     scenarios: list<array<string, mixed>>
     * }
     */
    public static function load(): array
    {
        $path = self::manifestPath();

        if (! is_readable($path)) {
            return [
                'version' => 1,
                'generated_at' => null,
                'scenarios' => [],
            ];
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        if (! is_array($decoded)) {
            return [
                'version' => 1,
                'generated_at' => null,
                'scenarios' => [],
            ];
        }

        return [
            'version' => (int) ($decoded['version'] ?? 1),
            'generated_at' => is_string($decoded['generated_at'] ?? null) ? $decoded['generated_at'] : null,
            'scenarios' => is_array($decoded['scenarios'] ?? null) ? $decoded['scenarios'] : [],
        ];
    }

    /**
     * @param  array{
     *     version: int,
     *     generated_at: string|null,
     *     scenarios: list<array<string, mixed>>
     * }  $manifest
     */
    public static function save(array $manifest): void
    {
        $path = self::manifestPath();
        $directory = dirname($path);

        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        file_put_contents(
            $path,
            json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n",
        );
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function catalog(): array
    {
        $sources = json_decode((string) file_get_contents(self::sourcesPath()), true);

        if (! is_array($sources)) {
            return [];
        }

        $entries = [];

        foreach (['downloads', 'local', 'generated'] as $group) {
            foreach ($sources[$group] ?? [] as $item) {
                if (! is_array($item) || ! is_string($item['id'] ?? null) || ! is_string($item['file'] ?? null)) {
                    continue;
                }

                $entries[] = [
                    'id' => $item['id'],
                    'file' => $item['file'],
                    'format' => (string) ($item['format'] ?? pathinfo($item['file'], PATHINFO_EXTENSION)),
                    'group' => $group,
                    'notes' => is_string($item['notes'] ?? null) ? $item['notes'] : null,
                    'license' => is_string($item['license'] ?? null) ? $item['license'] : null,
                    'generator' => is_string($item['generator'] ?? null) ? $item['generator'] : null,
                ];
            }
        }

        return $entries;
    }

    public static function resolvePath(string $relativePath): string
    {
        return realpath(self::corpusRoot().'/'.ltrim($relativePath, '/')) ?: self::corpusRoot().'/'.ltrim($relativePath, '/');
    }

    /**
     * @param  array<string, mixed>  $parsed
     */
    public static function countSkills(array $parsed): int
    {
        $skills = count(is_array($parsed['skills'] ?? null) ? $parsed['skills'] : []);
        $structured = is_array($parsed['structured_data'] ?? null) ? $parsed['structured_data'] : [];
        $technical = count(is_array($structured['technical_skills'] ?? null) ? $structured['technical_skills'] : []);
        $soft = count(is_array($structured['soft_skills'] ?? null) ? $structured['soft_skills'] : []);

        return max($skills, $technical + $soft);
    }

    /**
     * @return list<string>
     */
    public static function extractEmails(string $text): array
    {
        preg_match_all('/[A-Z0-9._%+\'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', $text, $matches);

        $emails = array_values(array_unique(array_map('strtolower', $matches[0] ?? [])));

        return array_values(array_filter(
            $emails,
            static fn (string $email): bool => ! self::isInstitutionalEmail($email),
        ));
    }

    private static function isInstitutionalEmail(string $email): bool
    {
        return (bool) preg_match(
            '/@(fas\.)?harvard\.edu$|@ocsrecep\.|careerservices\.|noreply\.|support\.|info@|admin@|office@/i',
            $email,
        );
    }

    /**
     * @return list<string>
     */
    public static function extractPhones(string $text): array
    {
        preg_match_all('/(?:\+?\d[\d\s().-]{7,}\d)/', $text, $matches);

        return array_values(array_unique(array_filter(array_map(
            static fn (string $phone): string => preg_replace('/\s+/', ' ', trim($phone)) ?? trim($phone),
            $matches[0] ?? [],
        ))));
    }

    /**
     * @return list<string>
     */
    public static function keywordCandidates(string $text): array
    {
        $keywords = [];

        foreach (preg_split('/\R+/', $text) ?: [] as $line) {
            $line = trim($line);

            if ($line === '' || mb_strlen($line) > 48) {
                continue;
            }

            if (preg_match('/^(skills|experience|education|summary|profile|projects|certifications)$/i', $line)) {
                continue;
            }

            if (preg_match('/^[A-Z][A-Za-z0-9+.#\/ -]{2,}$/', $line) && substr_count($line, ' ') <= 4) {
                $keywords[] = $line;
            }
        }

        return array_values(array_slice(array_unique($keywords), 0, 6));
    }

    /**
     * @return array<string, mixed>
     */
    public static function deriveExpectations(string $rawText, string $format): array
    {
        $trimmed = trim($rawText);
        $emails = self::extractEmails($trimmed);
        $phones = self::extractPhones($trimmed);
        $lower = mb_strtolower($trimmed);

        $minExperience = 0;

        if (str_contains($lower, 'experience') || preg_match('/\b(19|20)\d{2}\s*[-–]\s*(present|(19|20)\d{2})\b/i', $trimmed)) {
            $minExperience = 1;
        }

        if (preg_match_all('/\b(19|20)\d{2}\b/', $trimmed, $years) >= 4) {
            $minExperience = max($minExperience, 2);
        }

        $minEducation = 0;

        if (preg_match('/\b(bsc|msc|mba|ba|ma|phd|bachelor|master|university|college|a-level|gcse|degree)\b/i', $trimmed)) {
            $minEducation = 1;
        }

        $minSkills = 0;

        if (str_contains($lower, 'skills') || preg_match('/\b(python|java|javascript|sql|excel|laravel|react)\b/i', $trimmed)) {
            $minSkills = 3;
        }

        return [
            'min_raw_chars' => max(80, (int) floor(mb_strlen($trimmed) * 0.35)),
            'ocr_expected' => in_array($format, ['png', 'jpg', 'jpeg', 'webp'], true),
            'emails_in_raw' => $emails,
            'phones_in_raw' => array_slice($phones, 0, 2),
            'min_experience' => $minExperience,
            'min_education' => $minEducation,
            'min_skills' => $minSkills,
            'must_appear' => [],
        ];
    }

    /**
     * @param  array<string, mixed>  $expectations
     * @param  array<string, mixed>|null  $parsed
     * @return array{
     *     passed: bool,
     *     checks: list<array{name: string, passed: bool, detail: string}>
     * }
     */
    public static function score(string $rawText, ?array $parsed, array $expectations, bool $ocrUsed): array
    {
        $checks = [];
        $parsed = $parsed ?? [];
        $haystack = mb_strtolower(json_encode($parsed, JSON_UNESCAPED_UNICODE) ?: '');
        $formatted = mb_strtolower((string) ($parsed['formatted_cv_text'] ?? ''));
        $combined = $haystack.' '.$formatted;

        $minRaw = (int) ($expectations['min_raw_chars'] ?? 80);
        $checks[] = self::check(
            'extract_min_chars',
            mb_strlen(trim($rawText)) >= $minRaw,
            sprintf('raw=%d, need>=%d', mb_strlen(trim($rawText)), $minRaw),
        );

        $ocrExpected = (bool) ($expectations['ocr_expected'] ?? false);

        if ($ocrExpected) {
            $checks[] = self::check('ocr_used', $ocrUsed, $ocrUsed ? 'ocr path used' : 'expected OCR but embedded text path used');
        }

        $checks[] = self::check(
            'parse_not_empty',
            $parsed !== [],
            $parsed === [] ? 'NanoGPT returned no structured data' : 'structured data present',
        );

        $checks[] = self::check(
            'full_name_present',
            filled($parsed['full_name'] ?? null),
            (string) ($parsed['full_name'] ?? '(empty)'),
        );

        foreach ($expectations['emails_in_raw'] ?? [] as $email) {
            if (! is_string($email) || $email === '') {
                continue;
            }

            $parsedEmail = strtolower((string) ($parsed['email'] ?? ''));
            $checks[] = self::check(
                'email_'.str_replace(['@', '.'], '_', $email),
                self::emailsMatch(strtolower($email), $parsedEmail, $combined),
                sprintf('parsed=%s expected=%s', $parsedEmail ?: '(empty)', $email),
            );
        }

        $minExperience = (int) ($expectations['min_experience'] ?? 0);

        if ($minExperience > 0) {
            $count = count(is_array($parsed['experience'] ?? null) ? $parsed['experience'] : []);
            $checks[] = self::check(
                'min_experience',
                $count >= $minExperience,
                sprintf('parsed=%d need>=%d', $count, $minExperience),
            );
        }

        $minEducation = (int) ($expectations['min_education'] ?? 0);

        if ($minEducation > 0) {
            $count = count(is_array($parsed['education'] ?? null) ? $parsed['education'] : []);
            $checks[] = self::check(
                'min_education',
                $count >= $minEducation,
                sprintf('parsed=%d need>=%d', $count, $minEducation),
            );
        }

        $minSkills = (int) ($expectations['min_skills'] ?? 0);

        if ($minSkills > 0) {
            $count = self::countSkills($parsed);
            $checks[] = self::check(
                'min_skills',
                $count >= $minSkills,
                sprintf('parsed=%d need>=%d', $count, $minSkills),
            );
        }

        foreach ($expectations['must_appear'] ?? [] as $needle) {
            if (! is_string($needle) || trim($needle) === '') {
                continue;
            }

            $checks[] = self::check(
                'must_appear:'.mb_substr($needle, 0, 24),
                str_contains($combined, mb_strtolower($needle)),
                $needle,
            );
        }

        $passed = collect($checks)->every(static fn (array $check): bool => $check['passed']);

        return [
            'passed' => $passed,
            'checks' => $checks,
        ];
    }

    private static function emailsMatch(string $expected, string $parsed, string $haystack): bool
    {
        if ($expected === '' || $parsed === '') {
            return str_contains($haystack, $expected);
        }

        if ($expected === $parsed) {
            return true;
        }

        if (str_contains($haystack, $expected) || str_contains($haystack, $parsed)) {
            return true;
        }

        [$expectedLocal, $expectedDomain] = explode('@', $expected, 2) + [null, null];
        [$parsedLocal, $parsedDomain] = explode('@', $parsed, 2) + [null, null];

        if ($expectedDomain === null || $parsedDomain === null || $expectedDomain !== $parsedDomain) {
            return false;
        }

        return levenshtein($expectedLocal, $parsedLocal) <= 2;
    }

    /**
     * @return array{name: string, passed: bool, detail: string}
     */
    private static function check(string $name, bool $passed, string $detail): array
    {
        return [
            'name' => $name,
            'passed' => $passed,
            'detail' => $detail,
        ];
    }
}
