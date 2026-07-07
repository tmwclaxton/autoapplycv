<?php

namespace App\Support;

class AiAssistCosts
{
    /**
     * @return array{
     *     cover_letter_cost: int,
     *     ats_score_cost: int,
     *     chat_cost: int,
     *     question_cost: int,
     *     pricing: array<int, array{key: string, label: string, credits: int}>,
     * }
     */
    public static function forFrontend(): array
    {
        return [
            'cover_letter_cost' => self::coverLetterCost(),
            'ats_score_cost' => self::atsScoreCost(),
            'chat_cost' => self::chatCost(),
            'question_cost' => self::questionCost(),
            'pricing' => self::pricing(),
        ];
    }

    /**
     * @return array<int, array{key: string, label: string, credits: int}>
     */
    public static function pricing(): array
    {
        return [
            ['key' => 'chat', 'label' => 'Assist reply', 'credits' => self::chatCost()],
            ['key' => 'question', 'label' => 'Autofilled question', 'credits' => self::questionCost()],
            ['key' => 'cover_letter', 'label' => 'Cover letter', 'credits' => self::coverLetterCost()],
            ['key' => 'ats_score', 'label' => 'ATS score', 'credits' => self::atsScoreCost()],
        ];
    }

    public static function chatCost(): int
    {
        return (int) config('cv.ai_assist.chat_cost', 1);
    }

    public static function questionCost(): int
    {
        return (int) config('cv.ai_assist.question_cost', 1);
    }

    public static function coverLetterCost(): int
    {
        return (int) config('cv.ai_assist.cover_letter_cost', 5);
    }

    public static function atsScoreCost(): int
    {
        return (int) config('cv.ai_assist.ats_score_cost', 5);
    }
}
