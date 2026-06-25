<?php

namespace Database\Factories;

use App\Enums\ProfileDocumentCategory;
use App\Models\ProfileDocument;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ProfileDocument>
 */
class ProfileDocumentFactory extends Factory
{
    protected $model = ProfileDocument::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $filename = fake()->randomElement(['cv.pdf', 'degree-certificate.pdf', 'reference.pdf']);

        return [
            'user_id' => User::factory(),
            'category' => fake()->randomElement(ProfileDocumentCategory::cases()),
            'title' => fake()->words(3, true),
            'original_filename' => $filename,
            'stored_path' => 'profile-documents/1/'.$filename,
            'mime_type' => 'application/pdf',
            'file_size' => fake()->numberBetween(50_000, 2_000_000),
            'notes' => fake()->optional()->sentence(),
        ];
    }
}
