<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthRoutesTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_route_redirects_to_workos(): void
    {
        $response = $this->get(route('login'));

        $response->assertRedirect();
        $this->assertStringContainsString('workos.com', $response->headers->get('Location'));
    }

    public function test_register_route_redirects_to_workos_with_sign_up_hint(): void
    {
        $response = $this->get(route('register'));

        $response->assertRedirect();
        $this->assertStringContainsString('screen_hint=sign-up', $response->headers->get('Location'));
    }

    public function test_authenticate_route_does_not_redispatch_registered(): void
    {
        $source = file_get_contents(base_path('routes/auth.php'));

        $this->assertIsString($source);
        $this->assertStringNotContainsString(
            'event(new Registered',
            $source,
            'WorkOS already dispatches Registered; auth.php must not dispatch it again.',
        );
    }

    public function test_authenticate_without_code_redirects_to_login(): void
    {
        $this->get('/authenticate')
            ->assertRedirect(route('login'));
    }

    public function test_authenticate_with_empty_code_redirects_to_login(): void
    {
        $this->get('/authenticate?code=')
            ->assertRedirect(route('login'));
    }

    public function test_authenticate_state_mismatch_redirects_to_login_not_raw_403(): void
    {
        $response = $this->withSession([
            'state' => json_encode(['state' => 'expected-state', 'previous_url' => base64_encode('/')]),
        ])->get('/authenticate?code=fake-code&state='.urlencode(json_encode(['state' => 'wrong-state'])));

        $response->assertRedirect(route('login'));
        $response->assertStatus(302);
    }

    public function test_authenticate_when_already_signed_in_redirects_to_dashboard(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get('/authenticate?code=fake-code&state='.urlencode(json_encode(['state' => 'anything'])))
            ->assertRedirect(route('dashboard'));
    }

    public function test_authenticate_without_code_when_signed_in_redirects_to_dashboard(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get('/authenticate')
            ->assertRedirect(route('dashboard'));
    }
}
