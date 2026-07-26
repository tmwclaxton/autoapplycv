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
        $this->assertSame(
            'Internship Applications for 2026-2027 Roles',
            BlogYearNormalizer::normalizeTitle('Internship Applications for 2026-2027 Roles', 2026),
        );
        $this->assertSame(
            'Applications for 2027 Roles',
            BlogYearNormalizer::normalizeTitle('Applications for 2027 Roles', 2026),
        );
        $this->assertSame(
            'Applications for 2026 Roles',
            BlogYearNormalizer::normalizeTitle('Applications for 2025 Roles', 2026),
        );
    }

    public function test_content_normalizer_rewrites_marketing_years_not_history(): void
    {
        $this->assertSame(
            "Guide for 2026\n\nWe founded the company in 2019 and shipped in 2023.",
            BlogYearNormalizer::normalizeContent(
                "Guide for 2024\n\nWe founded the company in 2019 and shipped in 2023.",
                2026,
            ),
        );
        $this->assertSame(
            'Tips for 2026 and late 2026 hiring.',
            BlogYearNormalizer::normalizeContent('Tips for 2024 and late 2025 hiring.', 2026),
        );
        $this->assertSame(
            'Already mentions 2026 only.',
            BlogYearNormalizer::normalizeContent('Already mentions 2026 only.', 2026),
        );
        $this->assertFalse(BlogYearNormalizer::contentNeedsNormalization('Founded in 2019', 2026));
        $this->assertTrue(BlogYearNormalizer::contentNeedsNormalization('Written in 2025', 2026));
    }

    public function test_command_updates_title_body_and_excerpt_not_slug(): void
    {
        $blog = Blog::factory()->create([
            'title' => 'Workday Autofill Guide (2025)',
            'slug' => 'workday-autofill-guide-2025',
            'excerpt' => 'Written in 2025 for job seekers. Founded 2019.',
            'body' => "## Intro\n\nWe launched features in 2024 and 2025. Legacy note: 2019 founding.",
        ]);

        $unchanged = Blog::factory()->create([
            'title' => 'Already fresh (2026)',
            'slug' => 'already-fresh-2026',
            'excerpt' => 'All set for 2026.',
            'body' => 'No stale years here; founded 2019.',
        ]);

        $this->artisan('blog:normalize-years', ['--to' => 2026])
            ->expectsOutputToContain('Updated 1 post(s): 1 title(s), 1 body(ies), 1 excerpt(s)')
            ->assertSuccessful();

        $blog->refresh();
        $unchanged->refresh();

        $this->assertSame('Workday Autofill Guide (2026)', $blog->title);
        $this->assertSame('workday-autofill-guide-2025', $blog->slug);
        $this->assertSame('Written in 2026 for job seekers. Founded 2019.', $blog->excerpt);
        $this->assertSame(
            "## Intro\n\nWe launched features in 2026 and 2026. Legacy note: 2019 founding.",
            $blog->body,
        );
        $this->assertSame('Already fresh (2026)', $unchanged->title);
        $this->assertSame('All set for 2026.', $unchanged->excerpt);
        $this->assertSame('No stale years here; founded 2019.', $unchanged->body);
    }

    public function test_command_updates_body_when_title_already_current(): void
    {
        $blog = Blog::factory()->create([
            'title' => 'Fresh title (2026)',
            'slug' => 'fresh-title-2026',
            'excerpt' => 'Excerpt without years.',
            'body' => 'Still mentions the 2024 market and 2025 tools.',
        ]);

        $this->artisan('blog:normalize-years', ['--to' => 2026])
            ->expectsOutputToContain('Updated 1 post(s): 0 title(s), 1 body(ies), 0 excerpt(s)')
            ->assertSuccessful();

        $blog->refresh();
        $this->assertSame('Fresh title (2026)', $blog->title);
        $this->assertSame('Still mentions the 2026 market and 2026 tools.', $blog->body);
    }

    public function test_dry_run_does_not_write(): void
    {
        $blog = Blog::factory()->create([
            'title' => 'Indeed Auto Apply (2024)',
            'slug' => 'indeed-auto-apply-2024',
            'body' => 'Updated for 2025 seekers.',
        ]);

        $this->artisan('blog:normalize-years', ['--to' => 2026, '--dry-run' => true])
            ->expectsOutputToContain('Would update 1 post(s)')
            ->assertSuccessful();

        $blog->refresh();
        $this->assertSame('Indeed Auto Apply (2024)', $blog->title);
        $this->assertSame('Updated for 2025 seekers.', $blog->body);
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
