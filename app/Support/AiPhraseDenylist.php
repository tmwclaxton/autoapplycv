<?php

namespace App\Support;

class AiPhraseDenylist
{
    public const SEVERITY_HARD = 'hard';

    public const SEVERITY_SOFT = 'soft';

    public const HARD_HUMAN_TONE_CAP = 2;

    public const HARD_HUMAN_TONE_CAP_SINGLE = 3;

    public const SOFT_PENALTY_PER_HIT = 1;

    public const SOFT_PENALTY_MAX = 2;

    /**
     * @return array<int, array{phrase: string, severity: string, word_boundary: bool}>
     */
    public static function entries(): array
    {
        $entries = [];

        foreach (self::hardBannedPhrases() as $phrase) {
            $entries[] = [
                'phrase' => $phrase,
                'severity' => self::SEVERITY_HARD,
                'word_boundary' => self::needsWordBoundary($phrase),
            ];
        }

        foreach (self::softPenaltyPhrases() as $phrase) {
            $entries[] = [
                'phrase' => $phrase,
                'severity' => self::SEVERITY_SOFT,
                'word_boundary' => self::needsWordBoundary($phrase),
            ];
        }

        return $entries;
    }

    /**
     * @return array{hard: array<int, string>, soft: array<int, string>}
     */
    public static function findViolations(string $answer): array
    {
        $normalized = mb_strtolower(trim($answer));

        if ($normalized === '') {
            return ['hard' => [], 'soft' => []];
        }

        $hard = [];
        $soft = [];

        foreach (self::hardBannedPhrases() as $phrase) {
            if (self::phraseMatches($normalized, $phrase, self::needsWordBoundary($phrase))) {
                $hard[] = $phrase;
            }
        }

        foreach (self::softPenaltyPhrases() as $phrase) {
            if (self::phraseMatches($normalized, $phrase, self::needsWordBoundary($phrase))) {
                $soft[] = $phrase;
            }
        }

        $soft = self::filterSoftOverlappingHard($hard, $soft);

        return [
            'hard' => array_values(array_unique($hard)),
            'soft' => array_values(array_unique($soft)),
        ];
    }

    /**
     * @param  array{hard: array<int, string>, soft: array<int, string>}  $violations
     * @return array{
     *     human_tone_cap: int|null,
     *     human_tone_penalty: int,
     *     reason: string|null,
     *     passed: bool,
     * }
     */
    public static function mechanicalPenalty(array $violations): array
    {
        $hard = $violations['hard'] ?? [];
        $soft = $violations['soft'] ?? [];

        if ($hard === [] && $soft === []) {
            return [
                'human_tone_cap' => null,
                'human_tone_penalty' => 0,
                'reason' => null,
                'passed' => true,
            ];
        }

        $reasons = [];
        $cap = null;
        $penalty = 0;

        if ($hard !== []) {
            $cap = count($hard) >= 2 ? self::HARD_HUMAN_TONE_CAP : self::HARD_HUMAN_TONE_CAP_SINGLE;
            $reasons[] = 'AI telltale phrase(s): '.implode(', ', $hard);
        }

        if ($soft !== []) {
            $penalty = min(count($soft) * self::SOFT_PENALTY_PER_HIT, self::SOFT_PENALTY_MAX);
            $reasons[] = 'Overused AI word(s): '.implode(', ', $soft);
        }

        return [
            'human_tone_cap' => $cap,
            'human_tone_penalty' => $penalty,
            'reason' => implode('; ', $reasons),
            'passed' => $hard === [],
        ];
    }

    /**
     * Bullet list for generation prompts (ApplicationAssistantService).
     */
    public static function generationPromptLines(): string
    {
        $hardSamples = array_slice(self::hardBannedPhrases(), 0, 12);
        $softSamples = array_slice(self::softPenaltyPhrases(), 0, 10);

        return '- '.implode("\n- ", array_merge($hardSamples, $softSamples));
    }

    /**
     * Short hint for the NanoGPT judge prompt.
     */
    public static function judgePromptHint(): string
    {
        $top = array_slice(array_merge(
            self::hardBannedPhrases(),
            self::softPenaltyPhrases(),
        ), 0, 20);

        return implode(', ', $top);
    }

    /**
     * @return array<int, string>
     */
    public static function hardBannedPhrases(): array
    {
        return [
            'based on your profile',
            'as an ai',
            'as an artificial intelligence',
            'i am writing to express my interest',
            'i am writing to express my strong interest',
            'i am writing to express my keen interest',
            'writing to express my interest',
            'writing to express my strong interest',
            'thank you for considering my application',
            'i am thrilled to apply',
            'i am excited to apply',
            'i am excited to express my interest',
            'with great interest',
            'i am confident in my ability to contribute',
            'proven track record',
            'detail-oriented professional',
            'dynamic team player',
            'results-driven professional',
            'results-oriented professional',
            'unwavering commitment',
            'hit the ground running',
            "in today's fast-paced",
            "in today's ever-evolving",
            'game-changer',
            'game changer',
            'i am uniquely positioned',
            'uniquely positioned to',
            "contribute to your organisation's continued success",
            "contribute to your organization's continued success",
            'synergy',
            'delve into',
            'delve deeper',
            'tapestry',
            'beacon of',
            'it is worth noting',
            'it is important to note',
            'unique blend of skills',
            'passion and dedication',
            'esteemed organization',
            'esteemed organisation',
            'strong interest in the role',
            'based on the information provided',
            'eager to deepen my expertise',
            'enterprise software projects',
            'various startups',
            'diverse background',
            'passionate about',
            'i am extremely passionate',
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function softPenaltyPhrases(): array
    {
        return [
            'leverage',
            'passionate',
            'dynamic',
            'robust',
            'utilize',
            'facilitate',
            'foster',
            'cutting-edge',
            'cutting edge',
            'furthermore',
            'moreover',
            'consequently',
            'spearheaded',
            'groundbreaking',
            'invaluable',
            'relentless',
            'embarked',
            'adept',
            'tech-savvy',
            'tech savvy',
            'advocate for',
            'nuance',
            'holistic',
            'streamline',
            'pivotal',
            'testament',
            'intricate',
            'ever-evolving',
            'delve',
            'landscape',
            'thrilled',
        ];
    }

    private static function filterSoftOverlappingHard(array $hard, array $soft): array
    {
        return array_values(array_filter($soft, static function (string $softPhrase) use ($hard): bool {
            foreach ($hard as $hardPhrase) {
                if (str_contains($hardPhrase, $softPhrase)) {
                    return false;
                }
            }

            return true;
        }));
    }

    private static function needsWordBoundary(string $phrase): bool
    {
        return ! str_contains($phrase, ' ');
    }

    private static function phraseMatches(string $normalizedAnswer, string $phrase, bool $wordBoundary): bool
    {
        $normalizedPhrase = mb_strtolower(trim($phrase));

        if ($normalizedPhrase === '') {
            return false;
        }

        if (! $wordBoundary) {
            return str_contains($normalizedAnswer, $normalizedPhrase);
        }

        $escaped = preg_quote($normalizedPhrase, '/');

        return preg_match('/(?<!\p{L})'.$escaped.'(?!\p{L})/u', $normalizedAnswer) === 1;
    }
}
