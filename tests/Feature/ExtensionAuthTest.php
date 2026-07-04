<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Tests\TestCase;

class ExtensionAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_extension_login_redirects_guest_to_login_with_complete_intended_url(): void
    {
        $extensionId = str_repeat('a', 32);

        $response = $this->get(route('extension.login', [
            'extension_id' => $extensionId,
        ]));

        $response->assertRedirect(route('extension.login.complete', [
            'extension_id' => $extensionId,
        ]));
    }

    public function test_extension_login_redirects_authenticated_user_to_complete_page(): void
    {
        $user = User::factory()->create();
        $extensionId = str_repeat('b', 32);

        $this->actingAs($user)
            ->get(route('extension.login', [
                'extension_id' => $extensionId,
            ]))
            ->assertRedirect(route('extension.login.complete', [
                'extension_id' => $extensionId,
            ]));
    }

    public function test_extension_login_complete_mints_token_for_connect_page(): void
    {
        $user = User::factory()->create();
        $extensionId = str_repeat('c', 32);

        $this->actingAs($user)
            ->get(route('extension.login.complete', [
                'extension_id' => $extensionId,
            ]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Extension/Connect')
                ->where('extensionId', $extensionId)
                ->where('apiBase', rtrim((string) config('app.url'), '/'))
                ->has('token'));

        $this->assertSame(1, $user->fresh()->tokens()->where('name', 'extension')->count());
    }

    public function test_extension_login_requires_valid_extension_id(): void
    {
        $this->get(route('extension.login', [
            'extension_id' => 'not-valid',
        ]))->assertStatus(422);
    }
}
