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
     *     angle_hints: array<int, string>,
     *     must_cover: array<int, string>
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
     * @return array{
     *     id: string,
     *     weight: int,
     *     primary: string,
     *     supporting: array<int, string>,
     *     angle_hints: array<int, string>,
     *     must_cover: array<int, string>,
     *     selected_supporting: array<int, string>
     * }
     */
    public static function targetForCluster(string $clusterId): array
    {
        foreach (self::clusters() as $cluster) {
            if ($cluster['id'] === $clusterId) {
                return self::withSelectedSupporting($cluster);
            }
        }

        throw new \InvalidArgumentException(
            'Unknown blog SEO cluster ['.$clusterId.']. Valid ids: '.implode(', ', array_column(self::clusters(), 'id'))
        );
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
     * @return array<int, string>
     */
    public static function bannedTitlePhrases(): array
    {
        return array_values(array_filter(
            self::config()['banned_title_phrases'] ?? [],
            fn (mixed $phrase): bool => is_string($phrase) && trim($phrase) !== '',
        ));
    }

    /**
     * @return array<int, array{id: string, label: string, hint: string, example: string}>
     */
    public static function titleStyles(): array
    {
        $styles = self::config()['title_styles'] ?? [];

        return array_values(array_filter(
            $styles,
            fn (mixed $style): bool => is_array($style)
                && is_string($style['id'] ?? null)
                && is_string($style['hint'] ?? null),
        ));
    }

    public static function titleLooksGeneric(string $title): bool
    {
        $haystack = self::normaliseText($title);
        if ($haystack === '') {
            return true;
        }

        foreach (self::bannedTitlePhrases() as $phrase) {
            if (str_contains($haystack, self::normaliseText($phrase))) {
                return true;
            }
        }

        // "Beginner's Guide..." and "How to Save..." openings dominate the index.
        if (str_starts_with($haystack, 'beginner') || str_starts_with($haystack, 'beginners')) {
            return true;
        }

        // Brand stuffed into the title twice reads as template spam.
        if (substr_count($haystack, 'autocvapply') > 1) {
            return true;
        }

        // Prefer not ending every title with "... with AutoCVApply".
        if (str_ends_with($haystack, 'with autocvapply')
            || str_ends_with($haystack, 'from autocvapply')
            || str_ends_with($haystack, 'autocvapply s autofill extension')
            || str_ends_with($haystack, 'autocvapplys autofill extension')) {
            return true;
        }

        return false;
    }

    /**
     * True when the candidate shares an opening shape with a recent title.
     *
     * @param  array<int, string>  $recentTitles
     */
    public static function titleTooSimilarToRecent(string $title, array $recentTitles): bool
    {
        $candidateOpening = self::titleOpeningKey($title);
        if ($candidateOpening === '') {
            return false;
        }

        foreach ($recentTitles as $recent) {
            if (! is_string($recent) || trim($recent) === '') {
                continue;
            }
            if (self::titleOpeningKey($recent) === $candidateOpening) {
                return true;
            }

            similar_text(self::normaliseText($title), self::normaliseText($recent), $percent);
            if ($percent >= 62.0) {
                return true;
            }
        }

        return false;
    }

    public static function titleOpeningKey(string $title): string
    {
        $words = preg_split('/\s+/', self::normaliseText($title)) ?: [];
        $words = array_values(array_filter($words, fn (string $word): bool => $word !== ''));

        return implode(' ', array_slice($words, 0, 4));
    }

    /**
     * Pick a title style that recent titles have not already used.
     *
     * @param  array<int, string>  $recentTitles
     * @return array{id: string, label: string, hint: string, example: string}
     */
    public static function selectTitleStyle(array $recentTitles = []): array
    {
        $styles = self::titleStyles();
        if ($styles === []) {
            return [
                'id' => 'feature-first',
                'label' => 'Feature-first',
                'hint' => 'Lead with a product feature or platform, not a generic guide label.',
                'example' => 'Draft All for Easy Apply screening questions',
            ];
        }

        $used = [];
        foreach ($recentTitles as $recent) {
            if (! is_string($recent)) {
                continue;
            }
            $detected = self::detectTitleStyleId($recent);
            if ($detected !== null) {
                $used[$detected] = true;
            }
        }

        $fresh = array_values(array_filter(
            $styles,
            fn (array $style): bool => ! isset($used[$style['id']]),
        ));
        $pool = $fresh !== [] ? $fresh : $styles;

        return $pool[array_rand($pool)];
    }

    public static function detectTitleStyleId(string $title): ?string
    {
        $haystack = self::normaliseText($title);

        if (str_starts_with($haystack, 'can you') || str_starts_with($haystack, 'does ') || str_ends_with($haystack, '?') || str_contains($title, '?')) {
            return 'question';
        }
        if (str_contains($haystack, ' vs ') || str_contains($haystack, 'myth')) {
            return 'contrast';
        }
        if (preg_match('/^\d+\s/', $haystack) === 1) {
            return 'numbered-specific';
        }
        if (str_starts_with($haystack, 'between ') || str_starts_with($haystack, 'graduate') || str_contains($haystack, 'between gig') || str_contains($haystack, 'between contract')) {
            return 'audience-situation';
        }
        if (str_starts_with($haystack, 'linkedin') || str_starts_with($haystack, 'indeed') || str_starts_with($haystack, 'workday') || str_starts_with($haystack, 'greenhouse')) {
            return 'board-or-ats';
        }
        if (str_starts_with($haystack, 'draft all') || str_starts_with($haystack, 'autofill') || str_starts_with($haystack, 'auto apply') || str_starts_with($haystack, 'upload')) {
            return 'feature-first';
        }
        if (str_word_count($haystack) <= 10) {
            return 'short-punchy';
        }
        if (str_contains($haystack, 'then ') || str_contains($haystack, 'from the') || str_contains($haystack, 'sidebar')) {
            return 'workflow';
        }

        return null;
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
     *     must_cover: array<int, string>,
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
     *     must_cover?: array<int, string>,
     *     selected_supporting?: array<int, string>
     * }  $target
     * @param  array{id?: string, label?: string, hint?: string, example?: string}|null  $titleStyle
     */
    public static function promptBlock(array $target, ?array $titleStyle = null): string
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
        $mustCover = array_values(array_filter(
            $target['must_cover'] ?? [],
            fn (mixed $item): bool => is_string($item) && trim($item) !== '',
        ));
        $banned = self::bannedTitlePhrases();
        $titleStyle ??= is_array($target['title_style'] ?? null) ? $target['title_style'] : null;

        $avoidBlock = $avoid === []
            ? ''
            : "\nTopics / angles to avoid:\n".implode("\n", array_map(fn (string $t): string => "- {$t}", $avoid));
        $thinBlock = $thin === []
            ? ''
            : "\nThin-content rules:\n".implode("\n", array_map(fn (string $r): string => "- {$r}", $thin));
        $hintsBlock = $hints === []
            ? ''
            : "\nUseful angle hints for this cluster:\n".implode("\n", array_map(fn (string $h): string => "- {$h}", $hints));
        $mustCoverBlock = $mustCover === []
            ? ''
            : "\nMust-cover product beats (each must appear somewhere in the article):\n"
                .implode("\n", array_map(fn (string $beat): string => "- {$beat}", $mustCover));
        $bannedBlock = $banned === []
            ? ''
            : "\nBanned generic title/topic phrases (do not use these patterns):\n"
                .implode("\n", array_map(fn (string $phrase): string => "- {$phrase}", $banned));

        $titleStyleBlock = '';
        if (is_array($titleStyle) && is_string($titleStyle['hint'] ?? null)) {
            $styleLabel = (string) ($titleStyle['label'] ?? $titleStyle['id'] ?? 'custom');
            $styleExample = (string) ($titleStyle['example'] ?? '');
            $exampleLine = $styleExample !== '' ? "\nExample shape (do not copy verbatim): {$styleExample}" : '';
            $titleStyleBlock = <<<STYLE

## Required title style for this post
Style: {$styleLabel}
{$titleStyle['hint']}{$exampleLine}
Title variety rules:
- Do NOT start with "Beginner's Guide" or "How to Save Time".
- Mention AutoCVApply at most once in the title (ok to omit if the keyword + feature are clear).
- Do NOT end the title with "with AutoCVApply" / "from AutoCVApply".
- The title must look different from other posts on the blog index - vary opening words and structure.
STYLE;
        }

        return <<<BLOCK
## SEO keyword target for this post
Cluster: {$target['id']}
Primary keyword (must shape topic, title, excerpt, and at least one H2): {$primary}
Supporting keywords (use 2-4 naturally across H2s/body; no stuffing): {$supportingList}
Brand terms to include where natural: {$brand}
{$titleStyleBlock}

Editorial bar (high-level SEO strategy):
- This is a product-led SEO post, not generic career advice with AutoCVApply sprinkled in.
- Lead with a specific AutoCVApply workflow (AutoFill, Draft All, and/or Auto Apply) tied to the primary keyword.
- Title should be specific and searchable; avoid mushy benefit slogans.
- Name real boards/ATS from the research brief when the cluster requires them.
- Prefer "how the product works on X" over "tips for graduates/career changers".

SEO writing rules:
- Optimise title, excerpt, and H2s for the primary keyword without repeating it in every sentence.
- Prefer natural UK English phrasing over exact-match spam.
- Include the primary keyword (or a close natural variant) in the title and excerpt.
- Weave supporting keywords into section headings or opening sentences where they fit.
- Do not invent features to chase a keyword; stay inside the research brief.
- Use only https://autocvapply.com links (plus the official Chrome Web Store URL) for product URLs.
{$mustCoverBlock}{$hintsBlock}{$bannedBlock}{$avoidBlock}{$thinBlock}
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
     *     angle_hints: array<int, string>,
     *     must_cover?: array<int, string>
     * }  $cluster
     * @return array{
     *     id: string,
     *     weight: int,
     *     primary: string,
     *     supporting: array<int, string>,
     *     angle_hints: array<int, string>,
     *     must_cover: array<int, string>,
     *     selected_supporting: array<int, string>
     * }
     */
    public static function withSelectedSupporting(array $cluster): array
    {
        $cluster['must_cover'] = array_values(array_filter(
            $cluster['must_cover'] ?? [],
            fn (mixed $item): bool => is_string($item) && trim($item) !== '',
        ));
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
     * @param  array<int, array{id: string, weight: int, primary: string, supporting: array<int, string>, angle_hints: array<int, string>, must_cover?: array<int, string>}>  $pool
     * @return array{id: string, weight: int, primary: string, supporting: array<int, string>, angle_hints: array<int, string>, must_cover?: array<int, string>}
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
