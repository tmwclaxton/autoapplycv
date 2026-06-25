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
                'hint' => 'Walk the reader through a clear numbered sequence of steps. Process-focused and practical.',
                'title_pattern' => 'Titles often use "How to...", "A Step-by-Step Guide to...", or "X Steps to...".',
            ],
            [
                'key' => 'listicle',
                'name' => 'Numbered tips listicle',
                'hint' => 'Structure the article as numbered tips. Each section is one tip with a bold subheading and example.',
                'title_pattern' => 'Titles use "N Ways to...", "N Tips for...", or similar.',
            ],
            [
                'key' => 'myth-buster',
                'name' => 'Myth-buster',
                'hint' => 'Identify common misconceptions. Each section states a myth, then dismantles it with better advice.',
                'title_pattern' => 'Titles use "X Myths About Y" or "The Truth About X".',
            ],
            [
                'key' => 'beginners-guide',
                'name' => "Beginner's guide",
                'hint' => 'Assume the reader knows nothing. Define terms and build from basics to actionable steps.',
                'title_pattern' => 'Titles use "Getting Started with..." or "X for First-Timers".',
            ],
            [
                'key' => 'qa',
                'name' => 'Q&A explainer',
                'hint' => 'Each section answers a real question job seekers ask. Honest and conversational tone.',
                'title_pattern' => 'Titles use "X Questions About Y, Answered".',
            ],
        ];
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
            'Why job seekers waste hours retyping the same CV details on every application',
            'Upload once, apply everywhere: how a single profile powers dozens of applications',
            'What counts as an autofill on AutoCVApply and how monthly allowances work',
            'Applying on Workday-heavy employers without burning out on repetitive forms',
            'How AutoCVApply helps graduates running a high-volume application campaign',
            'Career changers: keeping employment history consistent across many employer portals',
            'Reducing typos and mismatched dates when you apply to multiple roles in one week',
            'Free vs Starter vs Pro: choosing an AutoCVApply plan for your job search intensity',
            'Why CV upload and profile editing are free but extension autofill is metered',
            'Using the Chrome extension safely: API tokens and what stays on your device',
            'Indeed, LinkedIn, Greenhouse, Lever, and Workday: where AutoCVApply autofill works today',
            'Application fatigue is real: practical ways to lower friction without cutting corners',
            'How AI CV parsing gets your profile started so you can focus on tailoring answers',
            'After redundancy: structuring a faster, calmer application routine with AutoCVApply',
            'Contractors between gigs: speeding up repetitive screening forms without sounding generic',
            'Editing your parsed profile before autofill: quality control for serious applicants',
            '250 free autofills per month: what that means in real applications for new users',
            'When intensive job hunting makes the Pro plan worth £17 a month',
            'The hidden cost of copy-paste: time, errors, and missed deadlines',
            'AutoCVApply is not auto-submit: why you stay in control of every application',
            'Building a weekly application rhythm with a saved profile and browser extension',
            'Accessibility and consistency: less manual typing on long employer application forms',
        ];
    }
}
