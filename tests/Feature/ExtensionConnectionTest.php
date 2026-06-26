<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Tests\TestCase;

class ExtensionConnectionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_dashboard_can_generate_extension_connection_json(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->postJson(route('extension.connection.store'))
            ->assertOk()
            ->assertJsonStructure(['connection_json']);

        $connection = json_decode($response->json('connection_json'), true, 512, JSON_THROW_ON_ERROR);

        $this->assertArrayHasKey('token', $connection);
        $this->assertArrayHasKey('api_base', $connection);
        $this->assertSame(rtrim((string) config('app.url'), '/'), $connection['api_base']);
    }
}
