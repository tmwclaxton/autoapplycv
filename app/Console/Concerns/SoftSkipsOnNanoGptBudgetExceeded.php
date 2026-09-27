<?php

namespace App\Console\Concerns;

use App\Exceptions\NanoGptBudgetExceededException;
use App\Services\NanoGptBudgetService;
use Illuminate\Support\Facades\Log;

trait SoftSkipsOnNanoGptBudgetExceeded
{
    protected function softSkipIfNanoGptBudgetExceeded(): ?int
    {
        $budget = app(NanoGptBudgetService::class);

        if (! $budget->isCapReached()) {
            return null;
        }

        Log::warning('Skipping command: NanoGPT monthly spend cap reached.', [
            'command' => method_exists($this, 'getName') ? $this->getName() : static::class,
            'period' => $budget->currentPeriodKey(),
            'spent_gbp' => $budget->spentGbpThisMonth(),
            'cap_gbp' => $budget->monthlyCapGbp(),
        ]);

        if (method_exists($this, 'warn')) {
            $this->warn('NanoGPT monthly spend cap reached - skipping for the rest of the month.');
        }

        return self::SUCCESS;
    }

    /**
     * @param  callable(): int  $callback
     */
    protected function runUnlessNanoGptBudgetExceeded(callable $callback): int
    {
        if (($skip = $this->softSkipIfNanoGptBudgetExceeded()) !== null) {
            return $skip;
        }

        try {
            return (int) $callback();
        } catch (NanoGptBudgetExceededException $exception) {
            Log::warning('Command stopped: NanoGPT monthly spend cap reached.', [
                'command' => method_exists($this, 'getName') ? $this->getName() : static::class,
                'message' => $exception->getMessage(),
            ]);

            if (method_exists($this, 'warn')) {
                $this->warn($exception->getMessage());
            }

            return self::SUCCESS;
        }
    }
}
