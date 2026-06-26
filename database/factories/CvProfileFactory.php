<?php

namespace Database\Factories;

use App\Models\CvProfile;
use App\Models\User;
use App\Support\ApplicationSettings;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CvProfile>
 */
class CvProfileFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'full_name' => fake()->name(),
            'email' => fake()->safeEmail(),
            'phone' => fake()->phoneNumber(),
            'location' => fake()->city().', '.fake()->country(),
            'linkedin_url' => 'https://linkedin.com/in/'.fake()->slug(2),
            'website_url' => null,
            'summary' => fake()->paragraph(),
            'skills' => ['PHP', 'Laravel', 'Vue', 'JavaScript'],
            'experience' => [
                [
                    'title' => fake()->jobTitle(),
                    'company' => fake()->company(),
                    'location' => fake()->city(),
                    'start_date' => '2021-01',
                    'end_date' => 'Present',
                    'is_current' => true,
                    'description' => fake()->paragraph(),
                    'highlights' => [fake()->sentence(), fake()->sentence()],
                    'technologies' => ['PHP', 'Laravel'],
                ],
            ],
            'education' => [
                [
                    'degree' => 'BSc Computer Science',
                    'institution' => fake()->company().' University',
                    'location' => fake()->city(),
                    'start_date' => '2015-09',
                    'end_date' => '2019-06',
                ],
            ],
            'extra_context' => null,
            'application_settings' => ApplicationSettings::defaults(),
            'raw_cv_text' => null,
            'formatted_cv_text' => null,
            'structured_data' => [
                'languages' => [['language' => 'English', 'proficiency' => 'Native']],
                'certifications' => [],
                'projects' => [],
            ],
            'headline' => fake()->jobTitle(),
            'city' => fake()->city(),
            'postcode' => fake()->postcode(),
            'country' => 'United Kingdom',
            'parsing_complete' => false,
        ];
    }
}
