<?php

namespace App\Support;

class CvFormattedTextBuilder
{
    /**
     * @param  array<string, mixed>  $normalized
     */
    public static function fromExtraction(string $rawText, array $normalized, bool $ocrUsed): string
    {
        if (! $ocrUsed) {
            $cleaned = self::cleanRawText($rawText);

            if ($cleaned !== '') {
                return $cleaned;
            }
        }

        $structured = self::fromStructured($normalized);

        if ($structured !== '') {
            return $structured;
        }

        return self::cleanRawText($rawText);
    }

    public static function cleanRawText(string $rawText): string
    {
        $text = str_replace(["\u{200B}", "\u{FEFF}", "\u{00A0}"], ' ', $rawText);
        $text = preg_replace("/[ \t]+/u", ' ', $text) ?? $text;
        $text = preg_replace("/\n{3,}/u", "\n\n", $text) ?? $text;

        return trim($text);
    }

    /**
     * @param  array<string, mixed>  $normalized
     */
    public static function fromStructured(array $normalized): string
    {
        $lines = [];

        if (filled($normalized['full_name'] ?? null)) {
            $lines[] = (string) $normalized['full_name'];
        }

        if (filled($normalized['headline'] ?? null)) {
            $lines[] = (string) $normalized['headline'];
        }

        $contact = collect([
            $normalized['email'] ?? null,
            $normalized['phone'] ?? null,
            $normalized['location'] ?? null,
            $normalized['linkedin_url'] ?? null,
            $normalized['website_url'] ?? null,
        ])->filter(fn ($value) => is_string($value) && trim($value) !== '')->implode(' | ');

        if ($contact !== '') {
            $lines[] = $contact;
        }

        if (filled($normalized['summary'] ?? null)) {
            $lines[] = '';
            $lines[] = 'Summary';
            $lines[] = (string) $normalized['summary'];
        }

        $skills = is_array($normalized['skills'] ?? null) ? $normalized['skills'] : [];

        if ($skills !== []) {
            $lines[] = '';
            $lines[] = 'Skills';
            $lines[] = implode(', ', $skills);
        }

        $experience = is_array($normalized['experience'] ?? null) ? $normalized['experience'] : [];

        if ($experience !== []) {
            $lines[] = '';
            $lines[] = 'Experience';

            foreach ($experience as $role) {
                if (! is_array($role)) {
                    continue;
                }

                $title = trim((string) ($role['title'] ?? ''));
                $company = trim((string) ($role['company'] ?? ''));

                if ($title === '' && $company === '') {
                    continue;
                }

                $lines[] = '';
                $lines[] = trim($title.($company !== '' ? ' - '.$company : ''));

                foreach (['start_date', 'end_date'] as $dateField) {
                    if (filled($role[$dateField] ?? null)) {
                        $lines[] = (string) $role[$dateField];
                        break;
                    }
                }

                if (filled($role['description'] ?? null)) {
                    $lines[] = (string) $role['description'];
                }

                foreach (is_array($role['highlights'] ?? null) ? $role['highlights'] : [] as $highlight) {
                    if (is_string($highlight) && trim($highlight) !== '') {
                        $lines[] = '- '.$highlight;
                    }
                }
            }
        }

        $education = is_array($normalized['education'] ?? null) ? $normalized['education'] : [];

        if ($education !== []) {
            $lines[] = '';
            $lines[] = 'Education';

            foreach ($education as $entry) {
                if (! is_array($entry)) {
                    continue;
                }

                $degree = trim((string) ($entry['degree'] ?? ''));
                $institution = trim((string) ($entry['institution'] ?? ''));

                if ($degree === '' && $institution === '') {
                    continue;
                }

                $lines[] = trim($degree.($institution !== '' ? ' - '.$institution : ''));
            }
        }

        return trim(implode("\n", $lines));
    }
}
