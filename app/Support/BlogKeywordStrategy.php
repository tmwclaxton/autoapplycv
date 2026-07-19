<?php

namespace App\Support;

/**
 * SEO keyword strategy for weekly AutoCVApply blog generation.
 *
 * Cluster definitions live in config/blog.php under seo.clusters.
 */
class BlogKeywordStrategy
{
    /**
     * @return array<string, mixed>
     */
    public static function config(): array
    {
        return (array) config('blog.seo', []);
    }

    /**
     * @return array<int, array{
     *     id: string,
     *     weight: int,
     *     primary: string,
     *     supporting: array<int, string>,
     *     angle_hints: array<int, string>
     * }>
     */
    public static function clusters(): array
    {
        $clusters = self::config()['clusters'] ?? [];

        return array_values(array_filter(
            $clusters,
            fn (mixed $cluster): bool => is_array($cluster)
                && is_string($cluster['id'] ?? null)
                && is_string($cluster['primary'] ?? null)
                && $cluster['primary'] !== '',
        ));
    }

    /**
     * @return array<int, string>
     */
    public static function brandTerms(): array
    {
        return array_values(array_filter(
            self::config()['brand_terms'] ?? [],
            fn (mixed $term): bool => is_string($term) && trim($term) !== '',
        ));
    }

    /**
     * @return array<int, string>
     */
    public static function topicsToAvoid(): array
    {
        return array_values(array_filter(
            self::config()['topics_to_avoid'] ?? [],
            fn (mixed $topic): bool => is_string($topic) && trim($topic) !== '',
        ));
    }

    /**
     * @return array<int, string>
     */
    public static function thinContentRules(): array
    {
        return array_values(array_filter(
            self::config()['thin_content_rules'] ?? [],
            fn (mixed $rule): bool => is_string($rule) && trim($rule) !== '',
        ));
    }

    /**
     * Pick a cluster for the next post, preferring ones not covered by recent titles/tags.
     *
     * @param  array<int, string>  $recentTitles
     * @param  array<int, string>  $recentTags
     * @return array{
     *     id: string,
     *     weight: int,
     *     primary: string,
     *     supporting: array<int, string>,
     *     angle_hints: array<int, string>,
     *     selected_supporting: array<int, string>
     * }
     */
    public static function selectTarget(array $recentTitles = [], array $recentTags = []): array
    {
        $clusters = self::clusters();

        if ($clusters === []) {
            throw new \RuntimeException('No blog SEO keyword clusters configured in config/blog.php.');
        }

        $haystack = self::normaliseHaystack($recentTitles, $recentTags);
        $fresh = array_values(array_filter(
            $clusters,
            fn (array $cluster): bool => ! self::clusterMatchesRecent($cluster, $haystack),
        ));

        $pool = $fresh !== [] ? $fresh : $clusters;
        $selected = self::weightedPick($pool);

        return self::withSelectedSupporting($selected);
    }

    /**
     * @param  array{
     *     id: string,
     *     weight: int,
     *     primary: string,
     *     supporting: array<int, string>,
     *     angle_hints: array<int, string>,
     *     selected_supporting?: array<int, string>
     * }  $target
     */
    public static function promptBlock(array $target): string
    {
        $primary = $target['primary'];
        $supporting = $target['selected_supporting'] ?? self::pickSupporting($target['supporting'] ?? []);
        $supportingList = $supporting === []
            ? '(none - focus on the primary keyword)'
            : implode(', ', $supporting);
        $brand = implode(', ', self::brandTerms());
        $avoid = self::topicsToAvoid();
        $thin = self::thinContentRules();
        $hints = $target['angle_hints'] ?? [];

        $avoidBlock = $avoid === []
            ? ''
            : "\nTopics / angles to avoid:\n".implode("\n", array_map(fn (string $t): string => "- {$t}", $avoid));
        $thinBlock = $thin === []
            ? ''
            : "\nThin-content rules:\n".implode("\n", array_map(fn (string $r): string => "- {$r}", $thin));
        $hintsBlock = $hints === []
            ? ''
            : "\nUseful angle hints for this cluster:\n".implode("\n", array_map(fn (string $h): string => "- {$h}", $hints));

        return <<<BLOCK
## SEO keyword target for this post
Cluster: {$target['id']}
Primary keyword (must shape topic, title, slug-friendly wording, excerpt, and at least one H2): {$primary}
Supporting keywords (use 2-4 naturally across H2s/body; no stuffing): {$supportingList}
Brand terms to include where natural: {$brand}

SEO writing rules:
- Optimise title, excerpt, and H2s for the primary keyword without repeating it in every sentence.
- Prefer natural UK English phrasing over exact-match spam.
- Include the primary keyword (or a close natural variant) in the title and excerpt.
- Weave supporting keywords into section headings or opening sentences where they fit.
- Do not invent features to chase a keyword; stay inside the research brief.
{$hintsBlock}{$avoidBlock}{$thinBlock}
BLOCK;
    }

    /**
     * @param  array{primary: string, supporting?: array<int, string>, selected_supporting?: array<int, string>}  $target
     * @return array<int, string>
     */
    public static function tagsForTarget(array $target): array
    {
        $tags = ['autocvapply', 'job-search', 'careers'];
        $keywords = array_merge(
            [$target['primary']],
            $target['selected_supporting'] ?? $target['supporting'] ?? [],
        );

        foreach ($keywords as $keyword) {
            if (! is_string($keyword) || trim($keyword) === '') {
                continue;
            }
            $slug = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $keyword) ?? $keyword, '-'));
            if ($slug !== '') {
                $tags[] = $slug;
            }
        }

        return array_values(array_unique($tags));
    }

    /**
     * @param  array{
     *     id: string,
     *     weight: int,
     *     primary: string,
     *     supporting: array<int, string>,
     *     angle_hints: array<int, string>
     * }  $cluster
     * @return array{
     *     id: string,
     *     weight: int,
     *     primary: string,
     *     supporting: array<int, string>,
     *     angle_hints: array<int, string>,
     *     selected_supporting: array<int, string>
     * }
     */
    public static function withSelectedSupporting(array $cluster): array
    {
        $cluster['selected_supporting'] = self::pickSupporting($cluster['supporting'] ?? []);

        return $cluster;
    }

    /**
     * @param  array<int, string>  $supporting
     * @return array<int, string>
     */
    public static function pickSupporting(array $supporting): array
    {
        $supporting = array_values(array_filter(
            $supporting,
            fn (mixed $kw): bool => is_string($kw) && trim($kw) !== '',
        ));

        if ($supporting === []) {
            return [];
        }

        $range = self::config()['supporting_keywords_per_post'] ?? [2, 4];
        $min = max(1, (int) ($range[0] ?? 2));
        $max = max($min, (int) ($range[1] ?? 4));
        $count = min(count($supporting), random_int($min, $max));

        if ($count >= count($supporting)) {
            return $supporting;
        }

        $keys = array_rand($supporting, $count);
        if (! is_array($keys)) {
            $keys = [$keys];
        }

        return array_values(array_map(fn (int $key): string => $supporting[$key], $keys));
    }

    /**
     * @param  array<int, array{id: string, weight: int, primary: string, supporting: array<int, string>, angle_hints: array<int, string>}>  $pool
     * @return array{id: string, weight: int, primary: string, supporting: array<int, string>, angle_hints: array<int, string>}
     */
    public static function weightedPick(array $pool): array
    {
        $total = 0;
        foreach ($pool as $cluster) {
            $total += max(1, (int) ($cluster['weight'] ?? 1));
        }

        $pick = random_int(1, max(1, $total));
        $running = 0;

        foreach ($pool as $cluster) {
            $running += max(1, (int) ($cluster['weight'] ?? 1));
            if ($pick <= $running) {
                return $cluster;
            }
        }

        return $pool[array_key_last($pool)];
    }

    /**
     * @param  array{id: string, primary: string, supporting?: array<int, string>}  $cluster
     */
    public static function clusterMatchesRecent(array $cluster, string $haystack): bool
    {
        if ($haystack === '') {
            return false;
        }

        $needles = array_merge(
            [$cluster['id'], $cluster['primary']],
            $cluster['supporting'] ?? [],
        );

        foreach ($needles as $needle) {
            if (! is_string($needle) || trim($needle) === '') {
                continue;
            }
            if (str_contains($haystack, self::normaliseText($needle))) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, string>  $recentTitles
     * @param  array<int, string>  $recentTags
     */
    public static function normaliseHaystack(array $recentTitles, array $recentTags): string
    {
        $parts = [];
        foreach (array_merge($recentTitles, $recentTags) as $part) {
            if (is_string($part) && trim($part) !== '') {
                $parts[] = self::normaliseText($part);
            }
        }

        return implode(' ', $parts);
    }

    public static function normaliseText(string $text): string
    {
        $text = strtolower(trim($text));
        $text = str_replace(["\u{2014}", "\u{2013}"], '-', $text);
        $text = preg_replace('/[^a-z0-9]+/', ' ', $text) ?? $text;

        return trim(preg_replace('/\s+/', ' ', $text) ?? $text);
    }
}
