<?php

namespace Database\Factories;

use App\Models\NanoGptSpendEntry;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<NanoGptSpendEntry>
 */
class NanoGptSpendEntryFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $promptTokens = fake()->numberBetween(100, 2000);
        $completionTokens = fake()->numberBetween(20, 800);
        $costUsd = fake()->randomFloat(8, 0.0001, 0.05);

        return [
            'period' => now('Europe/London')->format('Y-m'),
            'endpoint' => 'chat',
            'model' => 'openai/gpt-4.1-mini',
            'prompt_tokens' => $promptTokens,
            'completion_tokens' => $completionTokens,
            'total_tokens' => $promptTokens + $completionTokens,
            'cost_usd' => $costUsd,
            'cost_gbp' => round($costUsd * 0.79, 8),
            'cost_source' => NanoGptSpendEntry::SOURCE_REPORTED,
            'remaining_balance_usd' => fake()->optional()->randomFloat(6, 1, 100),
        ];
    }
}
