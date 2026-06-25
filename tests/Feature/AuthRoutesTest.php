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
}
