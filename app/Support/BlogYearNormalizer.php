<?php

namespace App\Support;

final class BlogYearNormalizer
{
    /**
     * Replace whole-word 20xx year tokens that are not the target year.
     */
    public static function normalizeTitle(string $title, int $toYear): string
    {
        if ($toYear < 2000 || $toYear > 2099) {
            throw new \InvalidArgumentException('Target year must be between 2000 and 2099.');
        }

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
}
