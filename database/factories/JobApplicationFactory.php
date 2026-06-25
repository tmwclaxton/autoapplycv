<?php

namespace Database\Factories;

use App\Models\JobApplication;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<JobApplication>
 */
class JobApplicationFactory extends Factory
{
    protected $model = JobApplication::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'title' => fake()->jobTitle(),
            'company' => fake()->company(),
            'link' => 'https://www.linkedin.com/jobs/view/'.fake()->numerify('########'),
            'location' => fake()->city().', UK',
            'source' => 'linkedin',
            'applied_at' => now()->subDays(fake()->numberBetween(0, 14)),
        ];
    }
}
