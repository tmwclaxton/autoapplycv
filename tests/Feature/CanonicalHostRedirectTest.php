<?php

namespace Tests\Feature;

use Tests\TestCase;

class CanonicalHostRedirectTest extends TestCase
{
    public function test_www_host_redirects_to_canonical_app_url(): void
    {
        config(['app.url' => 'https://autocvapply.com']);

        $response = $this->get('https://www.autocvapply.com/login');

        $response->assertRedirect('https://autocvapply.com/login');
        $this->assertSame(301, $response->getStatusCode());
    }

    public function test_www_host_preserves_path_and_query(): void
    {
        config(['app.url' => 'https://autocvapply.com']);

        $response = $this->get('https://www.autocvapply.com/pricing?utm_source=test');

        $response->assertRedirect('https://autocvapply.com/pricing?utm_source=test');
    }

    public function test_canonical_host_does_not_redirect(): void
    {
        config(['app.url' => 'https://autocvapply.com']);

        $response = $this->get('https://autocvapply.com/login');

        $response->assertRedirect();
        $this->assertStringContainsString('workos.com', (string) $response->headers->get('Location'));
    }
}
