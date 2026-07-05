<?php

namespace App\Support;

use Carbon\Carbon;

class NoticePeriodParser
{
    /**
     * @var array<int, string>
     */
    private const IMMEDIATE_PATTERNS = [
        'immediate',
        'immediately',
        'now',
        'asap',
        'straight away',
        'right away',
        'none',
        'no notice',
        '0 days',
        '0 day',
        '0 weeks',
        '0 week',
    ];

    public static function computeEarliestStart(?string $noticePeriod, ?Carbon $from = null): ?string
    {
        $normalized = strtolower(trim((string) $noticePeriod));

        if ($normalized === '') {
            return null;
        }

        $from ??= Carbon::today();

        if (self::isImmediate($normalized)) {
            return 'Immediately';
        }

        if (preg_match('/(\d+)\s*(day|days|d)\b/', $normalized, $matches) === 1) {
            return $from->copy()->addDays((int) $matches[1])->format('j F Y');
        }

        if (preg_match('/(\d+)\s*(week|weeks|wk|wks|w)\b/', $normalized, $matches) === 1) {
            return $from->copy()->addWeeks((int) $matches[1])->format('j F Y');
        }

        if (preg_match('/(\d+)\s*(month|months|mo|mos)\b/', $normalized, $matches) === 1) {
            return $from->copy()->addMonths((int) $matches[1])->format('j F Y');
        }

        return null;
    }

    private static function isImmediate(string $normalized): bool
    {
        foreach (self::IMMEDIATE_PATTERNS as $pattern) {
            if ($normalized === $pattern || str_starts_with($normalized, $pattern.' ')) {
                return true;
            }
        }

        return false;
    }
}
