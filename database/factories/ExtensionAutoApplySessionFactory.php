<?php

namespace Database\Factories;

use App\Enums\ExtensionAutoApplySessionStatus;
use App\Models\ExtensionAutoApplySession;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ExtensionAutoApplySession>
 */
class ExtensionAutoApplySessionFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'platform' => 'linkedin',
            'role_description' => fake()->jobTitle(),
            'status' => ExtensionAutoApplySessionStatus::Completed,
            'max_applications' => 3,
            'jobs_found' => fake()->numberBetween(3, 20),
            'applied_count' => fake()->numberBetween(0, 3),
            'skipped_count' => fake()->numberBetween(0, 5),
            'error_count' => fake()->numberBetween(0, 2),
            'fields_filled_count' => fake()->numberBetween(0, 40),
            'started_at' => now()->subMinutes(30),
            'stopped_at' => now()->subMinutes(5),
            'last_error' => null,
        ];
    }

    public function running(): static
    {
        return $this->state(fn (): array => [
            'status' => ExtensionAutoApplySessionStatus::Running,
            'stopped_at' => null,
        ]);
    }
}
