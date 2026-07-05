<?php

namespace Database\Factories;

use App\Models\ExtensionNanoGptUsage;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ExtensionNanoGptUsage>
 */
class ExtensionNanoGptUsageFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $promptTokens = fake()->numberBetween(200, 4000);
        $completionTokens = fake()->numberBetween(50, 1500);

        return [
            'user_id' => User::factory(),
            'action' => fake()->randomElement([
                'assist.draft-all',
                'assist.chat',
                'assist.questions',
                'assist.inventory',
            ]),
            'prompt_tokens' => $promptTokens,
            'completion_tokens' => $completionTokens,
            'total_tokens' => $promptTokens + $completionTokens,
            'nanogpt_credits' => fake()->randomFloat(6, 0.0001, 0.05),
            'autofill_cost' => fake()->numberBetween(1, 5),
            'model' => 'openai/gpt-4.1-mini',
        ];
    }
}
