<?php

namespace Tests\Feature;

use App\Models\Blog;
use App\Services\NanoGptBlogHeroImageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Mockery\MockInterface;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class BackfillBlogHeroImagesCommandTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function test_it_backfills_posts_with_missing_image_files(): void
    {
        Storage::fake('public');

        $post = Blog::factory()->published()->create([
            'slug' => 'missing-hero-image',
            'image_url' => 'blogs/heroes/missing.png',
        ]);

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('buildPrompt')->once()->andReturn('Job seeker at laptop.');
            $mock->shouldReceive('generateAndStore')->once()->andReturn('blogs/heroes/regenerated.png');
        });

        $this->artisan('blog:backfill-hero-images', ['--missing-files' => true])
            ->assertExitCode(0);

        $this->assertSame('blogs/heroes/regenerated.png', $post->fresh()->getRawOriginal('image_url'));
    }

    #[Test]
    public function test_it_skips_posts_when_image_file_exists(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('blogs/heroes/existing.png', 'png-bytes');

        Blog::factory()->published()->create([
            'slug' => 'has-hero-image',
            'image_url' => 'blogs/heroes/existing.png',
        ]);

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('generateAndStore');
        });

        $this->artisan('blog:backfill-hero-images', ['--missing-files' => true])
            ->assertExitCode(0);
    }

    #[Test]
    public function test_it_backfills_posts_without_image_url(): void
    {
        Storage::fake('public');

        $post = Blog::factory()->published()->create([
            'slug' => 'no-hero-yet',
            'image_url' => null,
        ]);

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('buildPrompt')->once()->andReturn('Job seeker at laptop.');
            $mock->shouldReceive('generateAndStore')->once()->andReturn('blogs/heroes/new.png');
        });

        $this->artisan('blog:backfill-hero-images')
            ->assertExitCode(0);

        $this->assertSame('blogs/heroes/new.png', $post->fresh()->getRawOriginal('image_url'));
    }
}
