<?php

namespace App\Support;

/**
 * Deterministic, topic-conditioned scene picks for blog hero image prompts.
 * Keeps related posts on-brand while avoiding a single "person at laptop" cliche.
 */
class BlogHeroSceneVariety
{
    /**
     * Scene ids that read as the old laptop-at-desk default.
     *
     * @var list<string>
     */
    public const LAPTOP_CLICHE_SCENE_IDS = [
        'desk-apply',
        'multi-monitor',
        'city-window',
    ];

    /**
     * @return list<array{id: string, label: string, directive: string, keywords: list<string>}>
     */
    public static function scenes(): array
    {
        return [
            [
                'id' => 'desk-apply',
                'label' => 'desk apply session',
                'directive' => 'Scene: a focused evening desk apply session - open laptop angled away from the camera, mug and sticky notes, soft lamp glow, sense of finishing an application without a face-forward laptop stare.',
                'keywords' => ['autofill', 'auto-apply', 'auto apply', 'chrome extension', 'sidebar', 'profile'],
            ],
            [
                'id' => 'cafe-remote',
                'label' => 'cafe remote work',
                'directive' => 'Scene: a sunny cafe or co-working corner - job seeker mid-apply with a notebook and phone beside a laptop, ambient bokeh, warm wood and steam from a coffee cup; remote job-hunt energy, not a sterile office stock shot.',
                'keywords' => ['remote', 'freelance', 'contractor', 'burnout', 'fatigue', 'pacing'],
            ],
            [
                'id' => 'interview-prep',
                'label' => 'interview prep notes',
                'directive' => 'Scene: interview prep still-life - open notebook with handwritten bullet points (illegible scribbles only), highlighter, printed JD edges, water glass, chair pulled up to a small table; anticipation before a call, no readable text.',
                'keywords' => ['interview', 'screening', 'why this role', 'draft all', 'cover letter', 'answer'],
            ],
            [
                'id' => 'commute-phone',
                'label' => 'phone Easy Apply on commute',
                'directive' => 'Scene: commute or waiting-room moment - phone in hand showing a generic unbranded Easy Apply-style screen (abstract UI blocks only), train window blur or soft city lights, coat and bag nearby; mobile job-hunt momentum.',
                'keywords' => ['linkedin', 'easy apply', 'indeed', 'totaljobs', 'reed', 'glassdoor', 'commute', 'mobile'],
            ],
            [
                'id' => 'ats-still-life',
                'label' => 'ATS keyword abstract UI still-life',
                'directive' => 'Scene: abstract ATS / keyword still-life - layered translucent UI cards, form field outlines, and soft document shapes on a desk; no logos, no readable labels; cool navy and cream with a red accent, editorial product-mood photography.',
                'keywords' => ['ats', 'workday', 'greenhouse', 'lever', 'keyword', 'parser', 'resume', 'cv', 'form'],
            ],
            [
                'id' => 'multi-monitor',
                'label' => 'multi-monitor ops',
                'directive' => 'Scene: multi-monitor job-search ops desk - dual screens with soft abstract dashboards (no readable UI), keyboard and trackpad mid-action, cable tidy, cool task lighting; power-user applying at volume without chaotic clutter.',
                'keywords' => ['auto apply', 'volume', 'batch', 'ops', 'dashboard', 'extension', 'automation'],
            ],
            [
                'id' => 'notebook-jd',
                'label' => 'notebook and highlighter JD',
                'directive' => 'Scene: annotated job description ritual - printed pages (blurred body text), neon highlighter strokes, sticky tabs, pen and notebook; top-down editorial still-life suggesting careful matching of CV to role.',
                'keywords' => ['tailor', 'cv', 'resume', 'job description', 'match', 'score', 'ats score', 'cover letter'],
            ],
            [
                'id' => 'city-window',
                'label' => 'city window home office',
                'directive' => 'Scene: home office beside a tall city window at golden hour - silhouette at a standing desk, skyline soft-focus, plant and lamp; hopeful end-of-day apply energy, laptop secondary in the frame.',
                'keywords' => ['career', 'strategy', 'graduate', 'changer', 'uk', 'home office'],
            ],
            [
                'id' => 'whiteboard-collab',
                'label' => 'collaboration whiteboard job hunt',
                'directive' => 'Scene: two stylised figures at a whiteboard planning a job hunt - abstract arrows and circled blobs (no readable words), sticky notes in warm tones, markers on the tray; collaborative strategy mood rather than solo laptop stare.',
                'keywords' => ['strategy', 'compare', 'vs', 'alternative', 'plan', 'burnout', 'team', 'mentor'],
            ],
        ];
    }

    /**
     * @param  list<string>  $tags
     * @return array{id: string, label: string, directive: string, keywords: list<string>}
     */
    public static function selectScene(
        string $topic,
        string $slug = '',
        string $title = '',
        array $tags = [],
        int $offset = 0,
    ): array {
        $scenes = self::scenes();
        $haystack = self::haystack($topic, $slug, $title, $tags);
        $preferredIndexes = self::preferredIndexes($haystack, $scenes);

        $pool = $preferredIndexes !== []
            ? array_values(array_map(static fn (int $i): array => $scenes[$i], $preferredIndexes))
            : $scenes;

        $seed = strtolower(trim(implode('|', array_filter([$slug, $title, $topic, implode(',', $tags)]))));
        $index = self::stableIndex($seed !== '' ? $seed : 'autocvapply-blog', count($pool));
        $index = ($index + max(0, $offset)) % count($pool);

        return $pool[$index];
    }

    public static function isLaptopClicheScene(string $sceneId): bool
    {
        return in_array($sceneId, self::LAPTOP_CLICHE_SCENE_IDS, true);
    }

    /**
     * @param  list<string>  $tags
     */
    public static function haystack(string $topic, string $slug = '', string $title = '', array $tags = []): string
    {
        $parts = array_merge([$topic, $slug, $title], $tags);
        $joined = strtolower(implode(' ', array_filter($parts, static fn ($p): bool => is_string($p) && $p !== '')));

        return str_replace(['-', '_'], ' ', $joined);
    }

    /**
     * @param  list<array{id: string, label: string, directive: string, keywords: list<string>}>  $scenes
     * @return list<int>
     */
    protected static function preferredIndexes(string $haystack, array $scenes): array
    {
        $matched = [];

        foreach ($scenes as $index => $scene) {
            foreach ($scene['keywords'] as $keyword) {
                if ($keyword !== '' && str_contains($haystack, strtolower($keyword))) {
                    $matched[] = $index;
                    break;
                }
            }
        }

        return array_values(array_unique($matched));
    }

    protected static function stableIndex(string $seed, int $modulo): int
    {
        if ($modulo < 1) {
            return 0;
        }

        return (int) (sprintf('%u', crc32($seed)) % $modulo);
    }
}
