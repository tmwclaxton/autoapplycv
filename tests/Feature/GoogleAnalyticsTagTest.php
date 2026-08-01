<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GoogleAnalyticsTagTest extends TestCase
{
    use RefreshDatabase;

    public function test_home_page_includes_configured_google_analytics_tag(): void
    {
        config(['analytics.google_analytics_id' => 'G-XXET6H4VM1']);

        $response = $this->get(route('home'));

        $response->assertOk();

        $content = (string) $response->getContent();

        $this->assertStringContainsString(
            'https://www.googletagmanager.com/gtag/js?id=G-XXET6H4VM1',
            $content,
        );
        $this->assertStringContainsString(
            "gtag('consent', 'default'",
            $content,
        );
        $this->assertStringContainsString(
            "analytics_storage: 'denied'",
            $content,
        );
        $this->assertStringContainsString(
            "ad_storage: 'denied'",
            $content,
        );
        $this->assertStringContainsString(
            "gtag('config', \"G-XXET6H4VM1\", { send_page_view: false })",
            $content,
        );
        $this->assertStringContainsString(
            "gtag('config', \"AW-18219075665\")",
            $content,
        );
        $this->assertStringContainsString(
            '__autocvapplyGoogleAdsConversions',
            $content,
        );
        // Blade @json escapes slashes (AW-...\/label).
        $this->assertStringContainsString('xFpFCIDTldQcENGQxO9D', $content);
        $this->assertStringContainsString('_yFvCIPTldQcENGQxO9D', $content);
    }

    public function test_google_ads_tag_still_loads_when_measurement_id_is_empty(): void
    {
        config([
            'analytics.google_analytics_id' => '',
            'analytics.google_ads_id' => 'AW-18219075665',
            'analytics.google_ads_conversions' => [
                'sign_up' => 'AW-18219075665/xFpFCIDTldQcENGQxO9D',
                'purchase' => 'AW-18219075665/_yFvCIPTldQcENGQxO9D',
            ],
        ]);

        $response = $this->get(route('home'));

        $response->assertOk();

        $content = (string) $response->getContent();

        $this->assertStringContainsString(
            'https://www.googletagmanager.com/gtag/js?id=AW-18219075665',
            $content,
        );
        $this->assertStringContainsString("gtag('config', \"AW-18219075665\")", $content);
        $this->assertStringContainsString('__autocvapplyGoogleAdsConversions', $content);
        $this->assertStringNotContainsString('G-XXET6H4VM1', $content);
    }

    public function test_google_tag_is_omitted_when_analytics_and_ads_ids_are_empty(): void
    {
        config([
            'analytics.google_analytics_id' => '',
            'analytics.google_ads_id' => '',
        ]);

        $response = $this->get(route('home'));

        $response->assertOk();

        $content = (string) $response->getContent();

        $this->assertStringNotContainsString('googletagmanager.com/gtag/js', $content);
        $this->assertStringNotContainsString('gtag(', $content);
        $this->assertStringNotContainsString('AW-18219075665', $content);
    }

    public function test_google_ads_config_is_omitted_when_ads_id_is_empty(): void
    {
        config([
            'analytics.google_analytics_id' => 'G-XXET6H4VM1',
            'analytics.google_ads_id' => '',
        ]);

        $response = $this->get(route('home'));

        $response->assertOk();

        $content = (string) $response->getContent();

        $this->assertStringContainsString('G-XXET6H4VM1', $content);
        $this->assertStringNotContainsString('AW-18219075665', $content);
        $this->assertStringNotContainsString('__autocvapplyGoogleAdsConversions', $content);
    }
}
