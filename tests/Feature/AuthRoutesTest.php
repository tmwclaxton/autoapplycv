<?php

namespace Tests\Feature;

use Tests\TestCase;

class AuthRoutesTest extends TestCase
{
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
}
