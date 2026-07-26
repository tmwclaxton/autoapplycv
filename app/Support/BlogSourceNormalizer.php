<?php

namespace App\Support;

/**
 * Keep blog Sources & references entries as titled links with short plain-text blurbs.
 * Strips scraped markdown bodies, image syntax, and dumped URLs from descriptions.
 */
final class BlogSourceNormalizer
{
    public const DEFAULT_DESCRIPTION_MAX_LENGTH = 160;

    /**
     * @param  array<int, mixed>  $sources
     * @return array<int, array{title: string, url: string, description: string}>
     */
    public static function normalizeList(array $sources, ?int $maxDescriptionLength = null): array
    {
        $normalized = [];
        $seenUrls = [];

        foreach ($sources as $source) {
            if (! is_array($source)) {
                continue;
            }

            $item = self::normalizeOne($source, $maxDescriptionLength);
            if ($item === null) {
                continue;
            }

            $key = strtolower($item['url']);
            if (isset($seenUrls[$key])) {
                continue;
            }
            $seenUrls[$key] = true;
            $normalized[] = $item;
        }

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $source
     * @return array{title: string, url: string, description: string}|null
     */
    public static function normalizeOne(array $source, ?int $maxDescriptionLength = null): ?array
    {
        $url = trim((string) ($source['url'] ?? ''));
        if ($url === '' || filter_var($url, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        $title = self::cleanTitle((string) ($source['title'] ?? ''));
        if ($title === '') {
            $title = self::fallbackTitleFromUrl($url);
        }

        $description = self::cleanDescription(
            (string) ($source['description'] ?? ''),
            $maxDescriptionLength,
        );

        return [
            'title' => $title,
            'url' => $url,
            'description' => $description,
        ];
    }

    public static function cleanTitle(string $title): string
    {
        $title = self::stripMarkdownNoise($title);
        $title = self::collapseWhitespace($title);

        return mb_substr($title, 0, 200);
    }

    public static function cleanDescription(string $description, ?int $maxLength = null): string
    {
        $maxLength ??= (int) config(
            'blog.sources.description_max_length',
            self::DEFAULT_DESCRIPTION_MAX_LENGTH,
        );
        $maxLength = max(40, $maxLength);

        $description = self::stripMarkdownNoise($description);
        $description = self::collapseWhitespace($description);

        if ($description === '') {
            return '';
        }

        if (mb_strlen($description) <= $maxLength) {
            return $description;
        }

        $truncated = mb_substr($description, 0, $maxLength - 1);
        if (preg_match('/^(.*)\s\S*$/u', $truncated, $matches) === 1 && trim($matches[1]) !== '') {
            $truncated = rtrim($matches[1]);
        }

        return rtrim($truncated, " \t.,;:-").'...';
    }

    /**
     * Prefer meta description / snippet; only fall back to markdown after stripping.
     */
    public static function descriptionFromSearchRow(array $row, ?int $maxLength = null): string
    {
        foreach (['description', 'snippet'] as $key) {
            $value = trim((string) ($row[$key] ?? ''));
            if ($value !== '') {
                return self::cleanDescription($value, $maxLength);
            }
        }

        $markdown = trim((string) ($row['markdown'] ?? ''));
        if ($markdown === '') {
            return '';
        }

        return self::cleanDescription($markdown, $maxLength);
    }

    /**
     * @param  array<int, array{title: string, url: string, description: string}>  $before
     * @param  array<int, array{title: string, url: string, description: string}>  $after
     */
    public static function listsDiffer(array $before, array $after): bool
    {
        return json_encode(array_values($before), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            !== json_encode(array_values($after), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private static function stripMarkdownNoise(string $text): string
    {
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // Image markdown (complete and truncated mid-URL from older 400-char cuts)
        $text = (string) preg_replace('/!\[[^\]]*]\([^)]*\)/', ' ', $text);
        $text = (string) preg_replace('/!\[[^\]]*]\([^)\s]*/', ' ', $text);
        $text = (string) preg_replace('/!\[[^\]]*$/', ' ', $text);

        // [label](url) -> label (complete and truncated)
        $text = (string) preg_replace('/\[([^\]]*)]\([^)]*\)/', ' $1 ', $text);
        $text = (string) preg_replace('/\[([^\]]*)]\([^)\s]*/', ' $1 ', $text);
        $text = (string) preg_replace('/\[[^\]]*$/', ' ', $text);

        // Bare URLs (including long chatgpt/perplexity share links)
        $text = (string) preg_replace('#https?://[^\s<>"\')\]]+#i', ' ', $text);
        $text = (string) preg_replace('#www\.[^\s<>"\')\]]+#i', ' ', $text);

        // ATX headings and leftover # markers
        $text = (string) preg_replace('/^#{1,6}\s*/m', '', $text);
        $text = (string) preg_replace('/#{1,6}/', ' ', $text);

        // Bold / italic / code fences
        $text = (string) preg_replace('/```[\s\S]*?```/', ' ', $text);
        $text = (string) preg_replace('/`([^`]+)`/', '$1', $text);
        $text = (string) preg_replace('/\*{1,3}([^*]+)\*{1,3}/', '$1', $text);
        $text = (string) preg_replace('/_{1,3}([^_]+)_{1,3}/', '$1', $text);

        // Residual emphasis markers, list bullets, and orphaned markdown punctuation
        $text = (string) preg_replace('/[*_~`]+/', ' ', $text);
        $text = (string) preg_replace('/^\s*[-*+]\s+/m', '', $text);
        $text = (string) preg_replace('/^\s*\d+\.\s+/m', '', $text);
        $text = (string) preg_replace('/!?\[|\]|\(\s*$/', ' ', $text);

        // HTML tags that sometimes leak into scrape snippets
        $text = strip_tags($text);

        return $text;
    }

    private static function collapseWhitespace(string $text): string
    {
        $text = str_replace(["\r\n", "\r", "\n", "\t"], ' ', $text);
        $text = (string) preg_replace('/\s{2,}/u', ' ', $text);

        return trim($text);
    }

    private static function fallbackTitleFromUrl(string $url): string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $host = preg_replace('/^www\./', '', $host) ?? $host;

        return $host !== '' ? $host : $url;
    }
}
