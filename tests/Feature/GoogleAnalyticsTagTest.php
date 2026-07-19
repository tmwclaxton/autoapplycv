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
            "gtag('config', \"G-XXET6H4VM1\", { send_page_view: false })",
            $content,
        );
    }

    public function test_google_analytics_tag_is_omitted_when_measurement_id_is_empty(): void
    {
        config(['analytics.google_analytics_id' => '']);

        $response = $this->get(route('home'));

        $response->assertOk();

        $content = (string) $response->getContent();

        $this->assertStringNotContainsString('googletagmanager.com/gtag/js', $content);
        $this->assertStringNotContainsString('gtag(', $content);
    }
}
