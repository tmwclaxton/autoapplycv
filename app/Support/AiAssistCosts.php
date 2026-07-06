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
     * }
     */
    public static function forFrontend(): array
    {
        return [
            'cover_letter_cost' => (int) config('cv.ai_assist.cover_letter_cost', 5),
            'ats_score_cost' => (int) config('cv.ai_assist.ats_score_cost', 5),
            'tailored_resume_cost' => (int) config('cv.ai_assist.tailored_resume_cost', 10),
            'draft_field_cost' => (int) config('cv.ai_assist.draft_field_cost', 1),
            'chat_cost' => (int) config('cv.ai_assist.chat_cost', 2),
            'draft_all_batch_cost' => (int) config('cv.ai_assist.draft_all_batch_cost', 3),
            'inventory_cost' => (int) config('cv.ai_assist.inventory_cost', 1),
            'job_context_cost' => (int) config('cv.ai_assist.job_context_cost', 1),
        ];
    }
}
