<?php

namespace Database\Factories;

use App\Models\AutofillDailyStat;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AutofillDailyStat>
 */
class AutofillDailyStatFactory extends Factory
{
    protected $model = AutofillDailyStat::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'date' => fake()->unique()->date(),
            'answers_count' => fake()->numberBetween(1, 500),
            'extension_questions_count' => fake()->numberBetween(0, 120),
            'cvs_parsed_count' => fake()->numberBetween(0, 40),
        ];
    }
}
