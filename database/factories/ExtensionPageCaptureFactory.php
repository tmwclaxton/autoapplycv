<?php

namespace Database\Factories;

use App\Models\ExtensionPageCapture;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ExtensionPageCapture>
 */
class ExtensionPageCaptureFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $url = fake()->url();

        return [
            'user_id' => User::factory(),
            'url' => $url,
            'page_title' => fake()->sentence(4),
            'domain' => parse_url($url, PHP_URL_HOST) ?: 'example.com',
            'platform' => null,
            'html' => '<html><body><h1>'.fake()->sentence().'</h1></body></html>',
        ];
    }
}
