<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MarketingPagesTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function publicPagesProvider(): array
    {
        return [
            'home' => ['home', 'Welcome'],
            'about' => ['about', 'About'],
            'how-to' => ['how-to', 'HowTo'],
            'pricing' => ['pricing', 'Pricing'],
            'analytics' => ['analytics', 'Analytics'],
            'contact' => ['contact', 'Contact'],
            'terms' => ['terms', 'Legal/Terms'],
            'privacy' => ['privacy', 'Legal/Privacy'],
            'blog' => ['blog.index', 'Blog/Index'],
        ];
    }

    #[DataProvider('publicPagesProvider')]
    public function test_marketing_pages_are_publicly_accessible(string $route, string $component): void
    {
        $this->get(route($route))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component($component));
    }

    public function test_extension_download_panel_browser_cards_use_theme_aware_surface(): void
    {
        $source = (string) file_get_contents(
            resource_path('js/components/extension/ExtensionDownloadPanel.vue'),
        );

        $this->assertStringContainsString('bg-postbox-surface', $source);
        $this->assertStringNotContainsString(
            'border-postbox-navy/15 bg-white hover:border-postbox-navy/30',
            $source,
        );
    }

    public function test_welcome_page_includes_cover_letter_section(): void
    {
        $source = (string) file_get_contents(resource_path('js/pages/Welcome.vue'));

        $this->assertStringContainsString('Cover letters', $source);
        $this->assertStringContainsString('Styled letters, ready when you apply.', $source);
        $this->assertStringContainsString('Cover letter settings', $source);
        $this->assertStringContainsString('Live preview', $source);
    }

    public function test_platform_badges_include_logo_urls_for_listed_boards(): void
    {
        $site = (string) file_get_contents(resource_path('js/lib/site.ts'));
        $badges = (string) file_get_contents(
            resource_path('js/components/postbox/PostboxPlatformBadges.vue'),
        );

        $this->assertStringContainsString('PLATFORM_LOGO_SOURCES', $site);
        $this->assertStringContainsString(
            'https://www.jobsdb.com/static/shared-web/',
            $site,
        );
        $this->assertStringContainsString(
            'https://www.jobs.nhs.uk/candidate/public/nhsuk-frontend/assets/favicons/',
            $site,
        );
        $this->assertStringContainsString('/images/platforms/logos/', $site);
        $this->assertStringNotContainsString('google.com/s2/favicons', $site);
        $this->assertStringContainsString('platformLogoUrl', $badges);
        $this->assertStringContainsString('platformSiteUrl', $badges);
        $this->assertStringContainsString('PLATFORM_SITE_URLS', $site);
        $this->assertStringContainsString("LinkedIn: 'https://www.linkedin.com/jobs'", $site);
        $this->assertStringContainsString('postbox-badge-logo', $badges);
        $this->assertStringContainsString('Platforms Coming Soon:', $badges);

        preg_match(
            '/export const PLATFORM_LOGO_SOURCES[^=]*=\s*\{([\s\S]*?)\};/',
            $site,
            $sourceBlock,
        );

        $this->assertNotEmpty($sourceBlock, 'Expected PLATFORM_LOGO_SOURCES in site.ts');

        preg_match_all(
            "/(?:'([^']+)'|([A-Za-z0-9]+)):\s*'(https?:\/\/[^']+)'/s",
            $sourceBlock[1],
            $matches,
            PREG_SET_ORDER,
        );

        $this->assertNotEmpty($matches, 'Expected PLATFORM_LOGO_SOURCES entries in site.ts');

        foreach ($matches as $match) {
            $platform = $match[1] !== '' ? $match[1] : $match[2];
            $sourceUrl = $match[3];
            $slug = (string) preg_replace(
                ['/\./', '/[^a-z0-9]+/', '/(^-|-$)/'],
                ['-', '-', ''],
                strtolower($platform),
            );
            $extension = str_ends_with(strtolower(parse_url($sourceUrl, PHP_URL_PATH) ?? ''), '.ico')
                ? 'ico'
                : 'png';
            $logoPath = public_path("images/platforms/logos/{$slug}.{$extension}");

            $this->assertFileExists(
                $logoPath,
                "Missing local platform logo for {$platform} at images/platforms/logos/{$slug}.{$extension}",
            );
        }
    }
}
