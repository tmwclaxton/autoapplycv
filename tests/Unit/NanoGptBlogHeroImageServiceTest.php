<?php

namespace Tests\Unit;

use App\Services\NanoGptBlogHeroImageService;
use App\Services\NanoGptService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Mockery\MockInterface;
use Tests\TestCase;

class NanoGptBlogHeroImageServiceTest extends TestCase
{
    public function test_it_returns_null_when_api_key_is_missing(): void
    {
        Storage::fake('public');
        Config::set('blog.hero_image_disk', 'public');
        Config::set('services.nanogpt.api_key', '');

        Http::fake();

        $url = (new NanoGptBlogHeroImageService)->generateAndStore('Sunrise over hills');

        $this->assertNull($url);
        Http::assertNothingSent();
    }

    public function test_it_stores_png_from_image_url_and_returns_storage_path(): void
    {
        Storage::fake('public');
        Config::set('blog.hero_image_disk', 'public');
        Config::set('blog.hero_image_path_prefix', 'blogs/heroes');
        Config::set('services.nanogpt.api_key', 'test-key');
        Config::set('services.nanogpt.image_base_url', 'https://nano-gpt.com/v1');
        Config::set('services.nanogpt.image_model', 'recraft-ai/recraft-v4.1/text-to-image');
        Config::set('services.nanogpt.image_size', '1024x576');

        Http::fake(function (Request $request) {
            if (str_contains($request->url(), 'images/generations')) {
                return Http::response([
                    'data' => [
                        ['url' => 'https://cdn.example/out.png'],
                    ],
                ], 200);
            }

            if (str_contains($request->url(), 'cdn.example')) {
                return Http::response("PNG\x0d\x0a\x1a\x0a", 200);
            }

            return Http::response('not found', 404);
        });

        $path = (new NanoGptBlogHeroImageService)->generateAndStore('Soft abstract shapes');

        $this->assertIsString($path);
        $this->assertStringStartsWith('blogs/heroes/', $path);
        $this->assertStringEndsWith('.png', $path);
        Storage::disk('public')->assertExists($path);
    }

    public function test_build_prompt_asks_for_vivid_scene_based_heroes(): void
    {
        $nanoGpt = $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chat')
                ->once()
                ->withArgs(function (array $messages, array $options): bool {
                    $system = $messages[0]['content'] ?? '';

                    return is_string($system)
                        && str_contains($system, 'VIVID')
                        && str_contains($system, 'warm window light')
                        && str_contains($system, 'No competitor')
                        && ($options['temperature'] ?? null) === 0.75;
                })
                ->andReturn('A hopeful job seeker at a sunlit desk finishing an application.');
        });

        $prompt = (new NanoGptBlogHeroImageService)->buildPrompt($nanoGpt, 'How to autofill Workday');

        $this->assertSame(
            'A hopeful job seeker at a sunlit desk finishing an application.',
            $prompt,
        );
    }
}
