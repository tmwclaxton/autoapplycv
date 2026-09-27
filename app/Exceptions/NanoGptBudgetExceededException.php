<?php

namespace App\Exceptions;

use Illuminate\Contracts\Debug\ShouldntReport;

class NanoGptBudgetExceededException extends NanoGptRequestException implements ShouldntReport
{
    public const CODE_BUDGET_EXCEEDED = 'nanogpt_budget_exceeded';

    public function __construct()
    {
        parent::__construct(
            message: 'AI features are temporarily paused because this month\'s NanoGPT budget has been reached. Please try again next calendar month.',
            statusCode: 503,
            errorCode: self::CODE_BUDGET_EXCEEDED,
        );
    }
}
