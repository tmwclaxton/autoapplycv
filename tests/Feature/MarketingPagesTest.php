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
            'glossary' => ['glossary', 'Glossary'],
            'faq' => ['faq', 'Faq'],
            'compare' => ['compare', 'Compare'],
            'ats-checker' => ['tools.ats-score-checker', 'Tools/AtsScoreChecker'],
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
        $response = $this->get(route($route))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component($component));

        if ($route === 'tools.ats-score-checker') {
            $response->assertInertia(fn ($page) => $page
                ->where('atsScoreCost', (int) config('cv.ai_assist.ats_score_cost'))
                ->where('guestFreeUsesLimit', (int) config('cv.ats_score_checker.guest_free_uses'))
                ->where('guestFreeUsesRemaining', (int) config('cv.ats_score_checker.guest_free_uses'))
            );
        }
    }

    public function test_pricing_page_includes_credit_costs_from_config(): void
    {
        $this->get(route('pricing'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Pricing')
                ->has('plans')
                ->has('creditCosts', 4)
                ->where('creditCosts.0.key', 'chat')
                ->where('creditCosts.0.label', 'Assist reply')
                ->where('creditCosts.0.credits', (int) config('cv.ai_assist.chat_cost'))
                ->where('creditCosts.1.key', 'question')
                ->where('creditCosts.1.credits', (int) config('cv.ai_assist.question_cost'))
                ->where('creditCosts.2.key', 'cover_letter')
                ->where('creditCosts.2.credits', (int) config('cv.ai_assist.cover_letter_cost'))
                ->where('creditCosts.3.key', 'ats_score')
                ->where('creditCosts.3.credits', (int) config('cv.ai_assist.ats_score_cost'))
                ->where('draftAllBatchSize', max(1, (int) config('cv.ai_assist.draft_all_batch_size', 10)))
            );
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

    public function test_marketing_pages_include_instagram_profile_link(): void
    {
        $instagramUrl = 'https://www.instagram.com/autocvapply/';

        $site = (string) file_get_contents(resource_path('js/lib/site.ts'));
        $nav = (string) file_get_contents(
            resource_path('js/components/postbox/PostboxMarketingNav.vue'),
        );
        $footer = (string) file_get_contents(
            resource_path('js/components/postbox/PostboxSiteFooter.vue'),
        );
        $contact = (string) file_get_contents(resource_path('js/pages/Contact.vue'));

        $this->assertStringContainsString("INSTAGRAM_URL = '{$instagramUrl}'", $site);
        $this->assertStringNotContainsString('INSTAGRAM_URL', $nav);
        $this->assertStringContainsString('INSTAGRAM_URL', $footer);
        $this->assertStringContainsString('INSTAGRAM_URL', $contact);
    }

    public function test_marketing_pages_include_x_profile_link(): void
    {
        $xUrl = 'https://x.com/AutoCVApply';

        $site = (string) file_get_contents(resource_path('js/lib/site.ts'));
        $nav = (string) file_get_contents(
            resource_path('js/components/postbox/PostboxMarketingNav.vue'),
        );
        $footer = (string) file_get_contents(
            resource_path('js/components/postbox/PostboxSiteFooter.vue'),
        );
        $contact = (string) file_get_contents(resource_path('js/pages/Contact.vue'));

        $this->assertStringContainsString("X_URL = '{$xUrl}'", $site);
        $this->assertStringNotContainsString('X_URL', $nav);
        $this->assertStringContainsString('X_URL', $footer);
        $this->assertStringContainsString('X.com', $footer);
        $this->assertStringContainsString('X_URL', $contact);
        $this->assertStringContainsString('X.com', $contact);
    }

    public function test_marketing_footer_includes_resources_and_marketing_pages_are_standalone(): void
    {
        $footer = (string) file_get_contents(
            resource_path('js/components/postbox/PostboxSiteFooter.vue'),
        );
        $site = (string) file_get_contents(resource_path('js/lib/site.ts'));
        $nav = (string) file_get_contents(
            resource_path('js/components/postbox/PostboxMarketingNav.vue'),
        );
        $app = (string) file_get_contents(resource_path('js/app.ts'));

        $this->assertStringContainsString('FOOTER_LEGAL_LINKS', $site);
        $this->assertStringContainsString('FOOTER_RESOURCE_LINKS', $site);
        $this->assertStringNotContainsString('export const FOOTER_LINKS', $site);

        preg_match(
            '/export const MARKETING_NAV_LINKS[^=]*=\s*\[([\s\S]*?)\] as const;/',
            $site,
            $navLinks,
        );
        $this->assertNotEmpty($navLinks, 'Expected MARKETING_NAV_LINKS in site.ts');
        $this->assertStringNotContainsString('Glossary', $navLinks[1]);
        $this->assertStringNotContainsString("'faq'", $navLinks[1]);
        $this->assertStringNotContainsString("'compare'", $navLinks[1]);

        preg_match(
            '/export const FOOTER_RESOURCE_LINKS[^=]*=\s*\[([\s\S]*?)\] as const;/',
            $site,
            $resourceLinks,
        );
        $this->assertNotEmpty($resourceLinks, 'Expected FOOTER_RESOURCE_LINKS in site.ts');
        $this->assertStringContainsString('Glossary', $resourceLinks[1]);
        $this->assertStringContainsString("'faq'", $resourceLinks[1]);
        $this->assertStringContainsString("'compare'", $resourceLinks[1]);

        $this->assertStringContainsString('footer-extension-heading', $footer);
        $this->assertStringContainsString('footer-resources-heading', $footer);
        $this->assertStringContainsString('footer-community-heading', $footer);
        $this->assertStringContainsString('footer-legal-heading', $footer);
        $this->assertStringNotContainsString('footer-product-heading', $footer);
        $this->assertStringContainsString('FOOTER_RESOURCE_LINKS', $footer);

        $this->assertStringNotContainsString('glossary,', $nav);
        $this->assertStringNotContainsString('faq,', $nav);
        $this->assertStringNotContainsString('compare,', $nav);

        $this->assertStringContainsString("'Glossary'", $app);
        $this->assertStringContainsString("'Faq'", $app);
        $this->assertStringContainsString("'Compare'", $app);
        $this->assertStringContainsString("name.startsWith('Tools/')", $app);
    }

    public function test_welcome_page_includes_cover_letter_section(): void
    {
        $source = (string) file_get_contents(resource_path('js/pages/Welcome.vue'));

        $this->assertStringContainsString('Cover letters', $source);
        $this->assertStringContainsString('Styled letters, ready when you apply.', $source);
        $this->assertStringContainsString('Cover letter settings', $source);
        $this->assertStringContainsString('Live preview', $source);
    }

    public function test_glossary_letter_sections_have_clear_dividers(): void
    {
        $source = (string) file_get_contents(resource_path('js/pages/Glossary.vue'));

        $this->assertStringContainsString('border-t-2 border-postbox-navy pt-8', $source);
        $this->assertStringContainsString(
            'border-b border-postbox-navy/25 pb-3 text-3xl font-bold tracking-wide',
            $source,
        );
        $this->assertStringContainsString('aria-labelledby="`letter-${letter}`"', $source);
    }

    public function test_faq_sections_use_expandable_shelves(): void
    {
        $source = (string) file_get_contents(resource_path('js/pages/Faq.vue'));

        $this->assertStringContainsString('border-t-2 border-postbox-navy pt-8', $source);
        $this->assertStringContainsString('<details', $source);
        $this->assertStringContainsString('<summary', $source);
        $this->assertStringContainsString('group-open:rotate-180', $source);
        $this->assertStringContainsString('openFromHash', $source);
    }

    public function test_compare_page_lists_competitors_from_blog_definitions(): void
    {
        $response = $this->get(route('compare'));

        $response->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Compare')
                ->has('comparisons', 10)
                ->where('comparisonCount', 10)
                ->where('comparisons.0.id', 'autoapplymax')
                ->where('comparisons.0.slug', 'autocvapply-vs-autoapplymax')
                ->where('comparisons.0.logo_url', '/images/competitors/logos/autoapplymax.png')
                ->has('comparisons.0.reasons')
                ->where('comparisons.9.id', 'massive')
            );

        $source = (string) file_get_contents(resource_path('js/pages/Compare.vue'));
        $this->assertStringContainsString('Why AutoCVApply', $source);
        $this->assertStringContainsString('blogShow', $source);
        $this->assertStringContainsString('homepage_url', $source);
        $this->assertStringContainsString('logo_url', $source);
        $this->assertStringContainsString('competitorInitials', $source);
        $this->assertStringNotContainsString('Jump to a comparison', $source);
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
