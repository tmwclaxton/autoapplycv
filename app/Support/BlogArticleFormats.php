<?php

namespace App\Support;

class BlogArticleFormats
{
    /**
     * @return array<int, array{key: string, name: string, hint: string, title_pattern: string}>
     */
    public static function all(): array
    {
        return [
            [
                'key' => 'how-to',
                'name' => 'How-to guide',
                'hint' => 'Search-intent how-to. Deep sections first, then TL;DR near the bottom before FAQ. Soft product CTA late - not brand in the title.',
                'title_pattern' => 'Titles look like Google queries, e.g. "How to Auto Apply on LinkedIn Easy Apply (2026)".',
            ],
            [
                'key' => 'comparison',
                'name' => 'Comparison / roundup',
                'hint' => 'X vs Y or Best tools listicle. Honest criteria. Soft CTA to AutoCVApply as one option.',
                'title_pattern' => 'Titles use "Best … (2026)", "X vs Y", or numbered tool roundups.',
            ],
            [
                'key' => 'listicle',
                'name' => 'Numbered tips listicle',
                'hint' => 'Numbered tips with concrete objects. Never "N Ways to Save Time".',
                'title_pattern' => 'Titles use a specific number + object ("7 mistakes…", "5 boards…").',
            ],
            [
                'key' => 'myth-buster',
                'name' => 'Myth-buster',
                'hint' => 'State myths, dismantle with practical advice. Keep control-model honesty.',
                'title_pattern' => 'Titles name the myth topic ("Autofill is not a silent bot").',
            ],
            [
                'key' => 'strategy',
                'name' => 'Strategy explainer',
                'hint' => 'Broader job-search strategy, burnout, volume vs quality. Product is one lever in the body.',
                'title_pattern' => 'Titles lead with the reader problem or strategy question.',
            ],
            [
                'key' => 'qa',
                'name' => 'Q&A explainer',
                'hint' => 'Each section answers a real question. End with an FAQ block as well.',
                'title_pattern' => 'Titles are often a question, or "X questions about Y".',
            ],
        ];
    }

    /**
     * @param  array<int, string>  $recentTitles
     * @return array{key: string, name: string, hint: string, title_pattern: string}
     */
    public static function pickAvoidingRecent(array $recentTitles = []): array
    {
        $formats = self::all();
        $used = [];

        foreach ($recentTitles as $title) {
            if (! is_string($title)) {
                continue;
            }
            $key = self::detectFormatKeyFromTitle($title);
            if ($key !== null) {
                $used[$key] = true;
            }
        }

        $fresh = array_values(array_filter(
            $formats,
            fn (array $format): bool => ! isset($used[$format['key']]),
        ));
        $pool = $fresh !== [] ? $fresh : $formats;

        return $pool[array_rand($pool)];
    }

    public static function detectFormatKeyFromTitle(string $title): ?string
    {
        $haystack = BlogKeywordStrategy::normaliseText($title);

        if (str_contains($haystack, 'myth') || str_contains($haystack, 'not a silent')) {
            return 'myth-buster';
        }
        if (str_contains($haystack, ' vs ') || str_starts_with($haystack, 'best ')) {
            return 'comparison';
        }
        if (preg_match('/^\d+\s/', $haystack) === 1 || str_contains($haystack, ' tips ') || str_contains($haystack, ' mistakes ')) {
            return 'listicle';
        }
        if (str_contains($title, '?') || str_contains($haystack, 'questions about')) {
            return 'qa';
        }
        if (str_contains($haystack, 'burnout') || str_contains($haystack, 'strategy') || str_contains($haystack, 'when volume')) {
            return 'strategy';
        }
        if (str_starts_with($haystack, 'how to ') || str_contains($haystack, 'step by step')) {
            return 'how-to';
        }

        return null;
    }

    /**
     * @return array<int, string>
     */
    public static function lengthPresetKeys(): array
    {
        return ['short', 'medium', 'long', 'pillar'];
    }

    public static function resolveArticleLength(string $length): string
    {
        $length = strtolower(trim($length));

        if ($length === 'random') {
            $keys = ['medium', 'long', 'pillar'];

            return $keys[array_rand($keys)];
        }

        if ($length === 'default') {
            return (string) config('blog.seo.default_generate_length', 'long');
        }

        if (in_array($length, self::lengthPresetKeys(), true)) {
            return $length;
        }

        throw new \InvalidArgumentException(
            'Invalid --length ['.$length.']. Use one of: '.implode(', ', self::lengthPresetKeys()).', default, random.'
        );
    }

    public static function articleBodyWordGuidance(string $lengthKey): string
    {
        return match ($lengthKey) {
            'short' => 'approximately 450-700 words',
            'medium' => 'approximately 900-1300 words',
            'long' => 'approximately 1500-2200 words',
            'pillar' => 'approximately 2000-2800 words',
            default => throw new \InvalidArgumentException("Unknown article length preset: {$lengthKey}"),
        };
    }

    public static function sectionCountForLength(string $lengthKey): int
    {
        return match ($lengthKey) {
            'short' => 3,
            'medium' => 4,
            'long' => 6,
            'pillar' => 7,
            default => 6,
        };
    }

    /**
     * @return array{min: int, max: int}
     */
    public static function perSectionWordRange(string $lengthKey, int $sectionCount): array
    {
        [$minTotal, $maxTotal] = match ($lengthKey) {
            'short' => [450, 700],
            'medium' => [900, 1300],
            'long' => [1500, 2200],
            'pillar' => [2000, 2800],
            default => [1500, 2200],
        };

        $n = max(1, $sectionCount);

        return [
            'min' => (int) floor($minTotal / $n),
            'max' => (int) ceil($maxTotal / $n),
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function topicAngles(): array
    {
        return [
            'How to auto-apply on LinkedIn Easy Apply safely in 2026',
            'Indeed Apply vs LinkedIn Easy Apply for UK job seekers',
            'Best autofill Chrome extensions for job applications (honest criteria)',
            'Workday multi-step forms without rebuilding your CV each time',
            'Job application burnout: when volume stops working',
            'ATS resume tips that are practical - not black-hat',
            'Screening questions: when AI drafts help and when they hurt',
            'Multi-board UK search: LinkedIn, Indeed, Totaljobs, Reed, Glassdoor',
            'Graduate scheme forms recycle the same fields - use one profile',
            'Between contracts: keep a warm profile without spam applying',
            'Cover letters and ATS scores as gates before spending credits',
            'What autofill tools should never claim about silent submit',
        ];
    }
}
