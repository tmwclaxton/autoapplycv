<?php

namespace Database\Factories;

use App\Enums\ExtensionAutoApplyEventType;
use App\Models\ExtensionAutoApplyEvent;
use App\Models\ExtensionAutoApplySession;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ExtensionAutoApplyEvent>
 */
class ExtensionAutoApplyEventFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'extension_auto_apply_session_id' => ExtensionAutoApplySession::factory(),
            'event_type' => ExtensionAutoApplyEventType::Submitted,
            'job_title' => fake()->jobTitle(),
            'company' => fake()->company(),
            'job_url' => fake()->url(),
            'fields_filled_count' => fake()->numberBetween(0, 12),
            'metadata' => null,
            'created_at' => now(),
        ];
    }
}
