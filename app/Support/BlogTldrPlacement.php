<?php

namespace App\Support;

/**
 * Keeps ## TL;DR near the bottom of blog markdown (before FAQ / Get started).
 */
class BlogTldrPlacement
{
    /**
     * Move a top-level ## TL;DR block to just before ## FAQ when present,
     * otherwise before ## Get started, otherwise append after other H2 sections.
     */
    public static function moveNearBottom(string $markdown): string
    {
        $normalized = str_replace(["\r\n", "\r"], "\n", $markdown);
        $trimmed = trim($normalized);

        if ($trimmed === '' || ! preg_match('/^##\s+TL;DR\b/mi', $trimmed)) {
            return $markdown;
        }

        [$preamble, $sections] = self::splitH2Sections($trimmed);

        $tldrIndex = null;
        foreach ($sections as $index => $section) {
            if (self::isTldrHeading($section['heading'])) {
                $tldrIndex = $index;
                break;
            }
        }

        if ($tldrIndex === null) {
            return $markdown;
        }

        $insertBefore = null;
        foreach ($sections as $index => $section) {
            if (self::isFaqHeading($section['heading']) || self::isGetStartedHeading($section['heading'])) {
                $insertBefore = $index;
                break;
            }
        }

        $targetIndex = $insertBefore ?? count($sections);
        if ($tldrIndex === $targetIndex - 1) {
            return $markdown;
        }

        $tldr = $sections[$tldrIndex];
        array_splice($sections, $tldrIndex, 1);

        if ($insertBefore !== null && $tldrIndex < $insertBefore) {
            $insertBefore--;
        }

        $targetIndex = $insertBefore ?? count($sections);
        array_splice($sections, $targetIndex, 0, [$tldr]);

        return self::joinH2Sections($preamble, $sections);
    }

    /**
     * True when TL;DR already sits immediately before FAQ / Get started (or at end).
     */
    public static function isNearBottom(string $markdown): bool
    {
        $normalized = trim(str_replace(["\r\n", "\r"], "\n", $markdown));
        if ($normalized === '' || ! preg_match('/^##\s+TL;DR\b/mi', $normalized)) {
            return true;
        }

        return trim(self::moveNearBottom($normalized)) === $normalized;
    }

    /**
     * @return array{0: string, 1: list<array{heading: string, body: string}>}
     */
    private static function splitH2Sections(string $markdown): array
    {
        $parts = preg_split('/(?=^## )/m', $markdown) ?: [];
        $preamble = '';
        $sections = [];

        foreach ($parts as $part) {
            $part = rtrim($part, "\n");
            if ($part === '') {
                continue;
            }

            if (! str_starts_with($part, '## ')) {
                $preamble = trim($part);

                continue;
            }

            $lines = preg_split("/\n/", $part) ?: [];
            $headingLine = array_shift($lines) ?? '';
            $heading = trim(preg_replace('/^##\s+/', '', $headingLine) ?? $headingLine);
            $body = trim(implode("\n", $lines));

            $sections[] = [
                'heading' => $heading,
                'body' => $body,
            ];
        }

        return [$preamble, $sections];
    }

    /**
     * @param  list<array{heading: string, body: string}>  $sections
     */
    private static function joinH2Sections(string $preamble, array $sections): string
    {
        $chunks = [];
        if (trim($preamble) !== '') {
            $chunks[] = trim($preamble);
        }

        foreach ($sections as $section) {
            $chunk = '## '.$section['heading'];
            if ($section['body'] !== '') {
                $chunk .= "\n\n".$section['body'];
            }
            $chunks[] = $chunk;
        }

        return implode("\n\n", $chunks)."\n";
    }

    private static function isTldrHeading(string $heading): bool
    {
        return strcasecmp(trim($heading), 'TL;DR') === 0;
    }

    private static function isFaqHeading(string $heading): bool
    {
        return strcasecmp(trim($heading), 'FAQ') === 0;
    }

    private static function isGetStartedHeading(string $heading): bool
    {
        return strcasecmp(trim($heading), 'Get started') === 0;
    }
}
