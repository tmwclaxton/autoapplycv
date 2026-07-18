<?php

namespace Database\Factories;

use App\Models\AutofillSyntheticDailyStat;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AutofillSyntheticDailyStat>
 */
class AutofillSyntheticDailyStatFactory extends Factory
{
    protected $model = AutofillSyntheticDailyStat::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'date' => fake()->unique()->date(),
            'answers_count' => fake()->numberBetween(1, 80),
            'extension_questions_count' => fake()->numberBetween(0, 30),
            'cvs_parsed_count' => fake()->numberBetween(0, 5),
        ];
    }
}
