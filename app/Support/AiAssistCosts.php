<?php

namespace App\Support;

class AiAssistCosts
{
    /**
     * @return array{
     *     cover_letter_cost: int,
     *     ats_score_cost: int,
     *     tailored_resume_cost: int,
     *     draft_field_cost: int,
     *     chat_cost: int,
     *     draft_all_batch_cost: int,
     *     inventory_cost: int,
     *     job_context_cost: int,
     *     pricing: array<int, array{key: string, label: string, credits: int}>,
     * }
     */
    public static function forFrontend(): array
    {
        return [
            'cover_letter_cost' => self::coverLetterCost(),
            'ats_score_cost' => self::atsScoreCost(),
            'tailored_resume_cost' => self::tailoredResumeCost(),
            'draft_field_cost' => self::draftFieldCost(),
            'chat_cost' => self::chatCost(),
            'draft_all_batch_cost' => self::draftAllBatchCost(),
            'inventory_cost' => self::inventoryCost(),
            'job_context_cost' => self::jobContextCost(),
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
            ['key' => 'draft_field', 'label' => 'Draft field answer', 'credits' => self::draftFieldCost()],
            ['key' => 'questions', 'label' => 'Application question', 'credits' => 1],
            ['key' => 'inventory', 'label' => 'Field inventory', 'credits' => self::inventoryCost()],
            ['key' => 'job_context', 'label' => 'Job context extraction', 'credits' => self::jobContextCost()],
            ['key' => 'draft_all_batch', 'label' => 'Draft All batch', 'credits' => self::draftAllBatchCost()],
            ['key' => 'cover_letter', 'label' => 'Cover letter', 'credits' => self::coverLetterCost()],
            ['key' => 'ats_score', 'label' => 'ATS score', 'credits' => self::atsScoreCost()],
            ['key' => 'tailored_resume', 'label' => 'Tailored resume', 'credits' => self::tailoredResumeCost()],
        ];
    }

    public static function chatCost(): int
    {
        return (int) config('cv.ai_assist.chat_cost', 1);
    }

    public static function coverLetterCost(): int
    {
        return (int) config('cv.ai_assist.cover_letter_cost', 5);
    }

    public static function atsScoreCost(): int
    {
        return (int) config('cv.ai_assist.ats_score_cost', 5);
    }

    public static function tailoredResumeCost(): int
    {
        return (int) config('cv.ai_assist.tailored_resume_cost', 10);
    }

    public static function draftFieldCost(): int
    {
        return (int) config('cv.ai_assist.draft_field_cost', 1);
    }

    public static function draftAllBatchCost(): int
    {
        return (int) config('cv.ai_assist.draft_all_batch_cost', 3);
    }

    public static function inventoryCost(): int
    {
        return (int) config('cv.ai_assist.inventory_cost', 1);
    }

    public static function jobContextCost(): int
    {
        return (int) config('cv.ai_assist.job_context_cost', 1);
    }
}
