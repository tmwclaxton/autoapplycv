<?php

namespace Tests\Feature;

use App\Enums\BlogStatus;
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
            $mock->shouldReceive('resolveScene')->once()->andReturn([
                'id' => 'desk-apply',
                'label' => 'desk apply session',
                'directive' => 'desk',
                'keywords' => [],
            ]);
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
            $mock->shouldReceive('resolveScene')->once()->andReturn([
                'id' => 'notebook-jd',
                'label' => 'notebook and highlighter JD',
                'directive' => 'notebook',
                'keywords' => [],
            ]);
            $mock->shouldReceive('buildPrompt')->once()->andReturn('Notebook and highlighter.');
            $mock->shouldReceive('generateAndStore')->once()->andReturn('blogs/heroes/new.png');
        });

        $this->artisan('blog:backfill-hero-images')
            ->assertExitCode(0);

        $this->assertSame('blogs/heroes/new.png', $post->fresh()->getRawOriginal('image_url'));
    }

    #[Test]
    public function test_it_backfills_draft_posts_without_image_url(): void
    {
        Storage::fake('public');

        $post = Blog::factory()->create([
            'slug' => 'draft-no-hero',
            'status' => BlogStatus::Draft,
            'published_at' => null,
            'image_url' => null,
        ]);

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('resolveScene')->once()->andReturn([
                'id' => 'interview-prep',
                'label' => 'interview prep notes',
                'directive' => 'prep',
                'keywords' => [],
            ]);
            $mock->shouldReceive('buildPrompt')->once()->andReturn('Interview prep notes.');
            $mock->shouldReceive('generateAndStore')->once()->andReturn('blogs/heroes/draft.png');
        });

        $this->artisan('blog:backfill-hero-images')
            ->assertExitCode(0);

        $this->assertSame('blogs/heroes/draft.png', $post->fresh()->getRawOriginal('image_url'));
    }

    #[Test]
    public function test_it_force_regenerates_existing_heroes(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('blogs/heroes/old.png', 'png-bytes');

        $post = Blog::factory()->published()->create([
            'slug' => 'force-regen-hero',
            'image_url' => 'blogs/heroes/old.png',
        ]);

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('resolveScene')->once()->andReturn([
                'id' => 'cafe-remote',
                'label' => 'cafe remote work',
                'directive' => 'cafe',
                'keywords' => [],
            ]);
            $mock->shouldReceive('buildPrompt')->once()->andReturn('Vivid job seeker scene.');
            $mock->shouldReceive('generateAndStore')->once()->andReturn('blogs/heroes/fresh.png');
        });

        $this->artisan('blog:backfill-hero-images', ['--force' => true, '--slug' => 'force-regen-hero'])
            ->assertExitCode(0);

        $this->assertSame('blogs/heroes/fresh.png', $post->fresh()->getRawOriginal('image_url'));
        Storage::disk('public')->assertMissing('blogs/heroes/old.png');
    }

    #[Test]
    public function test_it_cliche_regenerates_with_scene_offset(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('blogs/heroes/old.png', 'png-bytes');

        $post = Blog::factory()->published()->create([
            'slug' => 'cliche-desk-hero',
            'title' => 'Auto apply volume ops dashboard',
            'excerpt' => 'Chrome extension autofill dashboard ops',
            'tags' => ['auto-apply', 'extension', 'ops'],
            'image_url' => 'blogs/heroes/old.png',
        ]);

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock) use ($post): void {
            $mock->shouldReceive('resolveScene')
                ->atLeast()->once()
                ->andReturnUsing(function (string $topic, array $context = []) {
                    $offset = (int) ($context['scene_offset'] ?? 0);

                    return [
                        'id' => $offset === 0 ? 'multi-monitor' : 'ats-still-life',
                        'label' => $offset === 0 ? 'multi-monitor ops' : 'ATS keyword abstract UI still-life',
                        'directive' => $offset === 0 ? 'monitors' : 'abstract',
                        'keywords' => [],
                    ];
                });
            $mock->shouldReceive('buildPrompt')
                ->once()
                ->withArgs(function ($nanoGpt, string $topic, array $context) use ($post): bool {
                    return $context['slug'] === $post->slug
                        && ($context['scene_offset'] ?? null) === 1;
                })
                ->andReturn('Alternate non-laptop scene.');
            $mock->shouldReceive('generateAndStore')->once()->andReturn('blogs/heroes/varied.png');
        });

        $this->artisan('blog:backfill-hero-images', ['--cliche' => true, '--slug' => 'cliche-desk-hero'])
            ->assertExitCode(0);

        $this->assertSame('blogs/heroes/varied.png', $post->fresh()->getRawOriginal('image_url'));
    }

    #[Test]
    public function test_it_respects_limit_option(): void
    {
        Storage::fake('public');

        Blog::factory()->published()->create(['slug' => 'missing-a', 'image_url' => null]);
        Blog::factory()->published()->create(['slug' => 'missing-b', 'image_url' => null]);

        $this->mock(NanoGptBlogHeroImageService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('resolveScene')->once()->andReturn([
                'id' => 'cafe-remote',
                'label' => 'cafe remote work',
                'directive' => 'cafe',
                'keywords' => [],
            ]);
            $mock->shouldReceive('buildPrompt')->once()->andReturn('One scene.');
            $mock->shouldReceive('generateAndStore')->once()->andReturn('blogs/heroes/one.png');
        });

        $this->artisan('blog:backfill-hero-images', ['--limit' => 1])
            ->assertExitCode(0);
    }
}
