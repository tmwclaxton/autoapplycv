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
                'key' => 'step-by-step',
                'name' => 'Step-by-step guide',
                'hint' => 'Walk the reader through a clear numbered sequence of steps. Process-focused and practical. Do not title it "Beginner\'s Guide".',
                'title_pattern' => 'Titles name the workflow or platform first, e.g. "LinkedIn Easy Apply from the Auto Apply sidebar".',
            ],
            [
                'key' => 'listicle',
                'name' => 'Numbered tips listicle',
                'hint' => 'Structure the article as numbered tips. Each section is one tip with a bold subheading and example.',
                'title_pattern' => 'Titles use a specific number + object ("4 Easy Apply boards...") - never "N Ways to Save Time".',
            ],
            [
                'key' => 'myth-buster',
                'name' => 'Myth-buster',
                'hint' => 'Identify common misconceptions. Each section states a myth, then dismantles it with better advice.',
                'title_pattern' => 'Titles name the myth topic concretely ("Autofill myths: you still click Submit").',
            ],
            [
                'key' => 'beginners-guide',
                'name' => 'First-run walkthrough',
                'hint' => 'Assume the reader is new. Define terms and build from basics to actionable steps. Never use the words "Beginner\'s Guide" in the title.',
                'title_pattern' => 'Titles use "First run:", "Getting your profile ready:", or a plain workflow title - never "Beginner\'s Guide to...".',
            ],
            [
                'key' => 'qa',
                'name' => 'Q&A explainer',
                'hint' => 'Each section answers a real question job seekers ask. Honest and conversational tone.',
                'title_pattern' => 'Titles are often a question, or "X questions about Y".',
            ],
        ];
    }

    /**
     * Prefer formats that recent titles have not already overused.
     *
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

        // Beginner-guide openings have flooded the index - deprioritise hard.
        if (($used['beginners-guide'] ?? false) === true || self::recentTitlesLookBeginnerHeavy($recentTitles)) {
            $used['beginners-guide'] = true;
        }

        $fresh = array_values(array_filter(
            $formats,
            fn (array $format): bool => ! isset($used[$format['key']]),
        ));
        $pool = $fresh !== [] ? $fresh : array_values(array_filter(
            $formats,
            fn (array $format): bool => $format['key'] !== 'beginners-guide',
        ));
        if ($pool === []) {
            $pool = $formats;
        }

        return $pool[array_rand($pool)];
    }

    /**
     * @param  array<int, string>  $recentTitles
     */
    public static function recentTitlesLookBeginnerHeavy(array $recentTitles): bool
    {
        $beginner = 0;
        $total = 0;
        foreach ($recentTitles as $title) {
            if (! is_string($title) || trim($title) === '') {
                continue;
            }
            $total++;
            $normalised = BlogKeywordStrategy::normaliseText($title);
            if (str_starts_with($normalised, 'beginner') || str_contains($normalised, 'beginner s guide') || str_contains($normalised, 'beginners guide')) {
                $beginner++;
            }
        }

        return $total > 0 && ($beginner / $total) >= 0.34;
    }

    public static function detectFormatKeyFromTitle(string $title): ?string
    {
        $haystack = BlogKeywordStrategy::normaliseText($title);

        if (str_starts_with($haystack, 'beginner') || str_contains($haystack, 'beginner s guide') || str_contains($haystack, 'first run') || str_contains($haystack, 'getting your profile')) {
            return 'beginners-guide';
        }
        if (str_contains($haystack, 'myth')) {
            return 'myth-buster';
        }
        if (preg_match('/^\d+\s/', $haystack) === 1 || str_contains($haystack, ' ways to ') || str_contains($haystack, ' tips for ')) {
            return 'listicle';
        }
        if (str_contains($title, '?') || str_contains($haystack, 'questions about') || str_contains($haystack, 'answered')) {
            return 'qa';
        }
        if (str_starts_with($haystack, 'how to ') || str_contains($haystack, 'step by step') || str_contains($haystack, 'sidebar')) {
            return 'step-by-step';
        }

        return null;
    }

    /**
     * @return array<int, string>
     */
    public static function lengthPresetKeys(): array
    {
        return ['short', 'medium', 'long'];
    }

    public static function resolveArticleLength(string $length): string
    {
        $length = strtolower(trim($length));

        if ($length === 'random') {
            $keys = self::lengthPresetKeys();

            return $keys[array_rand($keys)];
        }

        if (in_array($length, self::lengthPresetKeys(), true)) {
            return $length;
        }

        throw new \InvalidArgumentException(
            'Invalid --length ['.$length.']. Use one of: '.implode(', ', self::lengthPresetKeys()).', random.'
        );
    }

    public static function articleBodyWordGuidance(string $lengthKey): string
    {
        return match ($lengthKey) {
            'short' => 'approximately 450–700 words',
            'medium' => 'approximately 800–1150 words',
            'long' => 'approximately 1200–1800 words',
            default => throw new \InvalidArgumentException("Unknown article length preset: {$lengthKey}"),
        };
    }

    public static function sectionCountForLength(string $lengthKey): int
    {
        return match ($lengthKey) {
            'short' => 3,
            'medium' => 4,
            'long' => 5,
            default => 4,
        };
    }

    /**
     * @return array{min: int, max: int}
     */
    public static function perSectionWordRange(string $lengthKey, int $sectionCount): array
    {
        [$minTotal, $maxTotal] = match ($lengthKey) {
            'short' => [450, 700],
            'medium' => [800, 1150],
            'long' => [1200, 1800],
            default => [800, 1150],
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
            'Upload once, apply everywhere: how one profile powers AutoFill across many ATS forms',
            'LinkedIn Easy Apply from the Auto Apply sidebar: search, fill, review, submit',
            'Indeed Apply plus Totaljobs, Glassdoor, and Reed: one Auto Apply workflow for UK boards',
            'Workday and Greenhouse multi-step forms: AutoFill structured fields, Draft All the screeners',
            'Draft All for "Why this role?" answers grounded in your saved CV profile',
            'CV upload and profile editing are free - polish the profile before spending credits',
            'Auto Apply is user-started: what the sidebar run does (and does not) automate',
            'Free vs Starter vs Pro credits when you are running high-volume board applications',
            'ATS/fit scoring as a gate before you spend credits on weak-fit roles',
            'Cover letters during Auto Apply: generate, review, then attach',
            'Ashby and Lever career sites: autofill + Draft All, you still click Submit',
            'How screening-question fatigue shows up on Easy Apply modals - and what Draft All changes',
            'Building a weekly board Auto Apply routine you monitor instead of babysitting every field',
            'Why a messy parsed profile ruins every later AutoFill and Draft All run',
            'Human-like typing on Auto Apply runs: practical anti-bot behaviour, not black-hat claims',
            'When to use AutoFill alone vs Draft All vs full job-board Auto Apply',
        ];
    }
}
