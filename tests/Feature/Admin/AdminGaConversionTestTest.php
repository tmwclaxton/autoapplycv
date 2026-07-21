<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Tests\TestCase;

class AdminGaConversionTestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_admin_can_open_ga_conversion_test_page(): void
    {
        config([
            'admin.allowed_emails' => ['admin@example.com'],
            'analytics.google_analytics_id' => 'G-XXET6H4VM1',
        ]);

        $admin = User::factory()->create([
            'email' => 'admin@example.com',
        ]);

        $this->actingAs($admin)
            ->get(route('admin.ga-conversion-test', [
                'gclid' => 'test-gclid-123',
                'auto' => 1,
            ]))
            ->assertOk()
            ->assertSee('G-XXET6H4VM1', false)
            ->assertSee('test-gclid-123', false)
            ->assertSee('ads_conversion_Sign_up_1', false)
            ->assertSee('purchase', false);
    }

    public function test_non_admin_cannot_open_ga_conversion_test_page(): void
    {
        $user = User::factory()->create([
            'email' => 'someone@example.com',
        ]);

        $this->actingAs($user)
            ->get(route('admin.ga-conversion-test'))
            ->assertForbidden();
    }
}
