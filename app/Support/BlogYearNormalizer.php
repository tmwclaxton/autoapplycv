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
     * Replace whole-word 20xx year tokens that are not the target year.
     */
    public static function normalizeTitle(string $title, int $toYear): string
    {
        self::assertValidYear($toYear);

        $target = (string) $toYear;

        return (string) preg_replace_callback(
            '/\b(20\d{2})\b/',
            static function (array $matches) use ($target): string {
                return $matches[1] === $target ? $matches[1] : $target;
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
