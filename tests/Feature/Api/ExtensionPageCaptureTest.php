<?php

namespace Tests\Feature\Api;

use App\Models\ExtensionPageCapture;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExtensionPageCaptureTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_request_returns_401(): void
    {
        $this->postJson('/api/extension/page-captures', [
            'url' => 'https://boards.greenhouse.io/example/jobs/123',
            'page_title' => 'Software Engineer',
            'html' => '<html><body>Apply</body></html>',
        ])->assertUnauthorized();
    }

    public function test_authenticated_user_can_store_page_capture(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/page-captures', [
                'url' => 'https://boards.greenhouse.io/example/jobs/123',
                'page_title' => 'Software Engineer',
                'html' => '<html><body>Apply</body></html>',
            ])
            ->assertCreated()
            ->assertJsonPath('success', true);

        $this->assertDatabaseHas('extension_page_captures', [
            'user_id' => $user->id,
            'url' => 'https://boards.greenhouse.io/example/jobs/123',
            'page_title' => 'Software Engineer',
            'domain' => 'boards.greenhouse.io',
            'platform' => 'greenhouse',
        ]);

        $capture = ExtensionPageCapture::query()->first();
        $this->assertSame('<html><body>Apply</body></html>', $capture?->html);
    }

    public function test_page_capture_requires_url_and_html(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/page-captures', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['url', 'html']);
    }
}
