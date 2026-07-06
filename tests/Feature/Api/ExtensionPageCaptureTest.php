<?php

namespace Tests\Feature\Api;

use App\Models\CvProfile;
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

    public function test_page_capture_redacts_user_pii_before_storage(): void
    {
        $user = User::factory()->create([
            'name' => 'Toby Claxton',
            'email' => 'tmwclaxton@gmail.com',
        ]);

        CvProfile::factory()->for($user)->create([
            'full_name' => 'Toby Claxton',
            'email' => 'tmwclaxton@gmail.com',
        ]);

        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/page-captures', [
                'url' => 'https://www.linkedin.com/jobs/view/123',
                'page_title' => 'Software Engineer',
                'html' => '<html><body>Toby Claxton tmwclaxton@gmail.com</body></html>',
            ])
            ->assertCreated();

        $capture = ExtensionPageCapture::query()->first();

        $this->assertStringNotContainsString('Toby Claxton', $capture?->html ?? '');
        $this->assertStringNotContainsString('tmwclaxton@gmail.com', $capture?->html ?? '');
        $this->assertStringContainsString('Alex Candidate', $capture?->html ?? '');
        $this->assertStringContainsString('candidate@example.com', $capture?->html ?? '');
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
