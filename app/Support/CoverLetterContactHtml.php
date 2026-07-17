<?php

namespace App\Support;

class CoverLetterContactHtml
{
    public static function hrefFor(string $value): ?string
    {
        $trimmed = trim($value);

        if ($trimmed === '') {
            return null;
        }

        if (filter_var($trimmed, FILTER_VALIDATE_EMAIL)) {
            return 'mailto:'.$trimmed;
        }

        if (self::looksLikePhone($trimmed)) {
            return 'tel:'.self::normalizePhone($trimmed);
        }

        return self::hrefForUrl($trimmed);
    }

    public static function hrefForUrl(string $value): ?string
    {
        $trimmed = trim($value);

        if ($trimmed === '') {
            return null;
        }

        if (preg_match('#^https?://#i', $trimmed) === 1) {
            return $trimmed;
        }

        if (preg_match('#^www\.#i', $trimmed) === 1) {
            return 'https://'.$trimmed;
        }

        if (preg_match('#^(linkedin\.com/|github\.com/)#i', $trimmed) === 1) {
            return 'https://'.$trimmed;
        }

        if (preg_match('#^[a-z0-9][-a-z0-9.]*\.[a-z]{2,}(/.*)?$#i', $trimmed) === 1) {
            return 'https://'.$trimmed;
        }

        return null;
    }

    public static function anchor(string $value): string
    {
        $trimmed = trim($value);
        $escaped = e($trimmed);
        $href = self::hrefFor($trimmed);

        if ($href === null) {
            return $escaped;
        }

        return '<a href="'.e($href).'">'.$escaped.'</a>';
    }

    /**
     * @return list<array{label: string, value: string, href: string|null}>
     */
    public static function contactParts(?array $profile): array
    {
        if ($profile === null) {
            return [];
        }

        $candidates = [
            ['Email', trim((string) ($profile['email'] ?? ''))],
            ['Phone', trim((string) ($profile['phone'] ?? ''))],
            ['Location', trim((string) ($profile['location'] ?? $profile['city'] ?? ''))],
            ['LinkedIn', trim((string) ($profile['linkedin_url'] ?? ''))],
            ['Web', trim((string) ($profile['website_url'] ?? ''))],
        ];

        $parts = [];

        foreach ($candidates as [$label, $value]) {
            if ($value === '') {
                continue;
            }

            $parts[] = [
                'label' => $label,
                'value' => $value,
                'href' => $label === 'Location' ? null : self::hrefFor($value),
            ];
        }

        return $parts;
    }

    public static function contactListHtml(?array $profile): string
    {
        $items = [];

        foreach (self::contactParts($profile) as $part) {
            $items[] = '<li><span class="label">'.e($part['label']).'</span><span>'.self::anchor($part['value']).'</span></li>';
        }

        return '<ul class="contact-list">'.implode('', $items).'</ul>';
    }

    public static function linkifyPlainText(string $text): string
    {
        $matches = self::findLinkMatches($text);

        if ($matches === []) {
            return e($text);
        }

        $html = '';
        $cursor = 0;

        foreach ($matches as $match) {
            if ($match['start'] > $cursor) {
                $html .= e(substr($text, $cursor, $match['start'] - $cursor));
            }

            $label = substr($text, $match['start'], $match['end'] - $match['start']);
            $html .= '<a href="'.e($match['href']).'">'.e($label).'</a>';
            $cursor = $match['end'];
        }

        if ($cursor < strlen($text)) {
            $html .= e(substr($text, $cursor));
        }

        return $html;
    }

    /**
     * @return list<array{start: int, end: int, href: string}>
     */
    public static function findLinkMatches(string $text): array
    {
        $candidates = [];

        if (preg_match_all('/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i', $text, $emailMatches, PREG_OFFSET_CAPTURE) > 0) {
            foreach ($emailMatches[0] as [$match, $offset]) {
                $candidates[] = [
                    'start' => (int) $offset,
                    'end' => (int) $offset + strlen($match),
                    'href' => 'mailto:'.$match,
                ];
            }
        }

        if (preg_match_all('#\bhttps?://[^\s<>()]+|\bwww\.[^\s<>()]+|\b(?:linkedin|github)\.com/[^\s<>()]+#i', $text, $urlMatches, PREG_OFFSET_CAPTURE) > 0) {
            foreach ($urlMatches[0] as [$match, $offset]) {
                $href = self::hrefForUrl(rtrim($match, '.,);'));
                $end = (int) $offset + strlen($match);

                while ($end > (int) $offset && str_contains('.,);', $text[$end - 1] ?? '')) {
                    $end--;
                }

                if ($href !== null) {
                    $candidates[] = [
                        'start' => (int) $offset,
                        'end' => $end,
                        'href' => $href,
                    ];
                }
            }
        }

        if (preg_match_all('/(?<![\w@])(?:\+?\d[\d\s().-]{6,}\d)/', $text, $phoneMatches, PREG_OFFSET_CAPTURE) > 0) {
            foreach ($phoneMatches[0] as [$match, $offset]) {
                $trimmed = trim($match);

                if (! self::looksLikePhone($trimmed)) {
                    continue;
                }

                $candidates[] = [
                    'start' => (int) $offset,
                    'end' => (int) $offset + strlen($match),
                    'href' => 'tel:'.self::normalizePhone($trimmed),
                ];
            }
        }

        usort($candidates, fn (array $left, array $right): int => $left['start'] <=> $right['start']);

        $matches = [];
        $lastEnd = -1;

        foreach ($candidates as $candidate) {
            if ($candidate['start'] < $lastEnd) {
                continue;
            }

            $matches[] = $candidate;
            $lastEnd = $candidate['end'];
        }

        return $matches;
    }

    private static function looksLikePhone(string $value): bool
    {
        $digits = preg_replace('/\D+/', '', $value) ?? '';

        return strlen($digits) >= 7
            && strlen($digits) <= 15
            && preg_match('/^[\d\s\-+().]+$/', $value) === 1;
    }

    private static function normalizePhone(string $value): string
    {
        $trimmed = trim($value);

        if (str_contains($trimmed, '+')) {
            return '+'.(preg_replace('/\D+/', '', $trimmed) ?? '');
        }

        return preg_replace('/\D+/', '', $trimmed) ?? '';
    }
}
