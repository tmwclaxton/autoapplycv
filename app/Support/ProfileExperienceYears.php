<?php

namespace App\Support;

use App\Models\CvProfile;
use Carbon\Carbon;

/**
 * Derive total career years from profile.experience dates when the
 * application_settings.years_of_experience field is missing or understated.
 */
class ProfileExperienceYears
{
    /**
     * @param  array<string, mixed>|null  $settings
     */
    public static function effectiveYears(CvProfile $profile, ?array $settings = null): ?int
    {
        $fromSettings = self::yearsFromSettings($settings);
        $fromExperience = self::yearsFromExperience($profile);

        if ($fromSettings === null && $fromExperience === null) {
            return null;
        }

        if ($fromSettings === null) {
            return $fromExperience;
        }

        if ($fromExperience === null) {
            return $fromSettings;
        }

        return max($fromSettings, $fromExperience);
    }

    /**
     * @param  array<string, mixed>|null  $settings
     */
    public static function yearsFromSettings(?array $settings): ?int
    {
        if (! is_array($settings)) {
            return null;
        }

        $raw = $settings['yearsOfExperience'] ?? $settings['years_of_experience'] ?? null;

        if (! is_string($raw) && ! is_numeric($raw)) {
            return null;
        }

        $parsed = (int) $raw;

        return $parsed >= 0 ? $parsed : null;
    }

    public static function yearsFromExperience(CvProfile $profile): ?int
    {
        $experience = $profile->experience;

        if (! is_array($experience) || $experience === []) {
            return null;
        }

        $earliest = null;
        $latest = null;
        $hasCurrent = false;

        foreach ($experience as $role) {
            if (! is_array($role)) {
                continue;
            }

            $start = self::parseFlexibleDate(
                is_string($role['start_date'] ?? null) ? $role['start_date'] : (
                    is_string($role['startDate'] ?? null) ? $role['startDate'] : null
                ),
            );
            $endRaw = is_string($role['end_date'] ?? null) ? $role['end_date'] : (
                is_string($role['endDate'] ?? null) ? $role['endDate'] : null
            );
            $isPresent = $endRaw === null
                || $endRaw === ''
                || preg_match('/\b(present|current|now)\b/i', $endRaw) === 1;
            $end = $isPresent ? Carbon::now() : self::parseFlexibleDate($endRaw);

            if ($start !== null && ($earliest === null || $start->lt($earliest))) {
                $earliest = $start;
            }

            if ($end !== null && ($latest === null || $end->gt($latest))) {
                $latest = $end;
            }

            if ($isPresent) {
                $hasCurrent = true;
            }
        }

        if ($earliest === null) {
            return null;
        }

        if ($hasCurrent || $latest === null) {
            $latest = Carbon::now();
        }

        $years = (int) floor($earliest->diffInDays($latest) / 365.25);

        return max(0, min(99, $years));
    }

    private static function parseFlexibleDate(?string $value): ?Carbon
    {
        if ($value === null) {
            return null;
        }

        $text = trim($value);

        if ($text === '' || preg_match('/\b(present|current|now)\b/i', $text) === 1) {
            return null;
        }

        if (preg_match('/^(\d{4})-(\d{2})(?:-(\d{2}))?$/', $text, $match) === 1) {
            $day = isset($match[3]) && $match[3] !== '' ? (int) $match[3] : 1;

            return Carbon::create((int) $match[1], (int) $match[2], $day)->startOfDay();
        }

        if (preg_match('/^(\d{4})$/', $text, $match) === 1) {
            return Carbon::create((int) $match[1], 1, 1)->startOfDay();
        }

        try {
            return Carbon::parse($text)->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }
}
