<?php

namespace App\Support;

final class BlogYearNormalizer
{
    /**
     * Marketing / currency years we rewrite in body and excerpt.
     * Older years (e.g. 2019 founded) are left alone.
     */
    private const CONTENT_YEAR_FLOOR = 2024;

    /**
     * Replace whole-word past/current 20xx year tokens with the target year.
     * Future years (e.g. 2027 in "2026-2027 roles") are left alone.
     */
    public static function normalizeTitle(string $title, int $toYear): string
    {
        self::assertValidYear($toYear);

        $target = (string) $toYear;

        return (string) preg_replace_callback(
            '/\b(20\d{2})\b/',
            static function (array $matches) use ($target, $toYear): string {
                $year = (int) $matches[1];

                if ($year < $toYear) {
                    return $target;
                }

                return $matches[1];
            },
            $title,
        );
    }

    public static function titleNeedsNormalization(string $title, int $toYear): bool
    {
        return self::normalizeTitle($title, $toYear) !== $title;
    }

    /**
     * Replace stale marketing years (2024 .. toYear-1) in body/excerpt markdown.
     * Does not rewrite older historical years such as 2019 or 2023.
     */
    public static function normalizeContent(string $text, int $toYear): string
    {
        self::assertValidYear($toYear);

        $target = (string) $toYear;
        $floor = self::CONTENT_YEAR_FLOOR;

        return (string) preg_replace_callback(
            '/\b(20\d{2})\b/',
            static function (array $matches) use ($target, $toYear, $floor): string {
                $year = (int) $matches[1];

                if ($year >= $floor && $year < $toYear) {
                    return $target;
                }

                return $matches[1];
            },
            $text,
        );
    }

    public static function contentNeedsNormalization(string $text, int $toYear): bool
    {
        return self::normalizeContent($text, $toYear) !== $text;
    }

    private static function assertValidYear(int $toYear): void
    {
        if ($toYear < 2000 || $toYear > 2099) {
            throw new \InvalidArgumentException('Target year must be between 2000 and 2099.');
        }
    }
}
