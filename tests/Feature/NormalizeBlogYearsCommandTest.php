<?php

namespace Tests\Feature;

use App\Models\Blog;
use App\Support\BlogYearNormalizer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NormalizeBlogYearsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_normalizer_replaces_outdated_years_only(): void
    {
        $this->assertSame(
            'How to Auto Apply on LinkedIn Easy Apply (2026)',
            BlogYearNormalizer::normalizeTitle('How to Auto Apply on LinkedIn Easy Apply (2025)', 2026),
        );
        $this->assertSame(
            'Best CV tools for 2026 and beyond',
            BlogYearNormalizer::normalizeTitle('Best CV tools for 2024 and beyond', 2026),
        );
        $this->assertSame(
            'Already current (2026)',
            BlogYearNormalizer::normalizeTitle('Already current (2026)', 2026),
        );
        $this->assertFalse(BlogYearNormalizer::titleNeedsNormalization('Guide for 2026', 2026));
        $this->assertTrue(BlogYearNormalizer::titleNeedsNormalization('Guide for 2023', 2026));
    }

    public function test_command_updates_titles_not_slug_excerpt_or_body(): void
    {
        $blog = Blog::factory()->create([
            'title' => 'Workday Autofill Guide (2025)',
            'slug' => 'workday-autofill-guide-2025',
            'excerpt' => 'Written in 2025 for job seekers.',
            'body' => "## Intro\n\nWe launched features in 2024 and 2025.",
        ]);

        $unchanged = Blog::factory()->create([
            'title' => 'Already fresh (2026)',
            'slug' => 'already-fresh-2026',
        ]);

        $this->artisan('blog:normalize-years', ['--to' => 2026])
            ->expectsOutputToContain('Updated 1 title(s)')
            ->assertSuccessful();

        $blog->refresh();
        $unchanged->refresh();

        $this->assertSame('Workday Autofill Guide (2026)', $blog->title);
        $this->assertSame('workday-autofill-guide-2025', $blog->slug);
        $this->assertSame('Written in 2025 for job seekers.', $blog->excerpt);
        $this->assertSame("## Intro\n\nWe launched features in 2024 and 2025.", $blog->body);
        $this->assertSame('Already fresh (2026)', $unchanged->title);
    }

    public function test_dry_run_does_not_write(): void
    {
        $blog = Blog::factory()->create([
            'title' => 'Indeed Auto Apply (2024)',
            'slug' => 'indeed-auto-apply-2024',
        ]);

        $this->artisan('blog:normalize-years', ['--to' => 2026, '--dry-run' => true])
            ->expectsOutputToContain('Would update 1 title(s)')
            ->assertSuccessful();

        $blog->refresh();
        $this->assertSame('Indeed Auto Apply (2024)', $blog->title);
    }

    public function test_slug_option_limits_scope(): void
    {
        $target = Blog::factory()->create([
            'title' => 'LinkedIn Easy Apply (2025)',
            'slug' => 'linkedin-easy-apply-2025',
        ]);
        $other = Blog::factory()->create([
            'title' => 'Workday Guide (2025)',
            'slug' => 'workday-guide-2025',
        ]);

        $this->artisan('blog:normalize-years', [
            '--to' => 2026,
            '--slug' => 'linkedin-easy-apply-2025',
        ])->assertSuccessful();

        $target->refresh();
        $other->refresh();

        $this->assertSame('LinkedIn Easy Apply (2026)', $target->title);
        $this->assertSame('Workday Guide (2025)', $other->title);
    }

    public function test_rejects_invalid_target_year(): void
    {
        $this->artisan('blog:normalize-years', ['--to' => 1999])
            ->assertFailed();
    }
}
