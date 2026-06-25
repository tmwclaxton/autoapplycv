<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class HttpsAssetUrlsTest extends TestCase
{
    use RefreshDatabase;

    public function test_home_page_does_not_emit_http_asset_urls_when_request_is_secure(): void
    {
        config(['app.url' => 'http://autocvapply.com']);
        URL::forceScheme('https');

        $response = $this->withHeaders([
            'X-Forwarded-Proto' => 'https',
            'X-Forwarded-For' => '203.0.113.1',
        ])->get('/');

        $response->assertOk();

        $content = (string) $response->getContent();

        $this->assertStringNotContainsString(
            'http://autocvapply.com/build/',
            $content,
            'Mixed-content asset URLs must not be generated for HTTPS requests.',
        );
    }
}
