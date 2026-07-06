<?php

namespace App\Services;

use App\Models\User;

class ExtensionPageCaptureRedactionService
{
    private const PLACEHOLDER_EMAIL = 'candidate@example.com';

    private const PLACEHOLDER_NAME = 'Alex Candidate';

    private const PLACEHOLDER_PHONE = '+44 7700 900123';

    /** @var array<int, array{pattern: string, replacement: string}> */
    private const SECRET_PATTERNS = [
        [
            'pattern' => '/AIzaSy[A-Za-z0-9_-]{33}/',
            'replacement' => 'REDACTED_GOOGLE_API_KEY',
        ],
        [
            'pattern' => '/live_widget_key_[A-Za-z0-9_-]+/',
            'replacement' => 'REDACTED_GOCARDLESS_WIDGET_KEY',
        ],
        [
            'pattern' => '/sk-[A-Za-z0-9]{20,}/',
            'replacement' => 'REDACTED_SECRET_KEY',
        ],
    ];

    public function redactForUser(User $user, string $html): string
    {
        $user->loadMissing('cvProfile');

        $output = $html;

        foreach ($this->emailNeedles($user) as $needle) {
            $output = str_replace($needle, self::PLACEHOLDER_EMAIL, $output);
        }

        foreach ($this->phoneNeedles($user) as $needle) {
            $output = str_replace($needle, self::PLACEHOLDER_PHONE, $output);
        }

        foreach ($this->nameNeedles($user) as $needle) {
            if (mb_strlen($needle) < 2) {
                continue;
            }

            $output = str_ireplace($needle, self::PLACEHOLDER_NAME, $output);
        }

        $output = preg_replace(
            '/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/',
            self::PLACEHOLDER_EMAIL,
            $output,
        ) ?? $output;

        foreach (self::SECRET_PATTERNS as $pattern) {
            $output = preg_replace($pattern['pattern'], $pattern['replacement'], $output) ?? $output;
        }

        return $output;
    }

    /**
     * @return list<string>
     */
    private function emailNeedles(User $user): array
    {
        $needles = array_filter([
            $user->email,
            $user->cvProfile?->email,
        ], fn (?string $value): bool => filled($value));

        return array_values(array_unique($needles));
    }

    /**
     * @return list<string>
     */
    private function phoneNeedles(User $user): array
    {
        $phone = trim((string) ($user->cvProfile?->phone ?? ''));

        if ($phone === '') {
            return [];
        }

        $needles = [$phone];

        $digitsOnly = preg_replace('/\D+/', '', $phone) ?? '';

        if ($digitsOnly !== '' && $digitsOnly !== $phone) {
            $needles[] = $digitsOnly;
        }

        return array_values(array_unique(array_filter($needles)));
    }

    /**
     * @return list<string>
     */
    private function nameNeedles(User $user): array
    {
        $needles = [];

        foreach ([$user->name, $user->cvProfile?->full_name] as $name) {
            $name = trim((string) $name);

            if ($name === '') {
                continue;
            }

            $needles[] = $name;

            foreach (preg_split('/\s+/u', $name) ?: [] as $part) {
                $part = trim($part);

                if (mb_strlen($part) >= 2) {
                    $needles[] = $part;
                }
            }
        }

        return array_values(array_unique($needles));
    }
}
