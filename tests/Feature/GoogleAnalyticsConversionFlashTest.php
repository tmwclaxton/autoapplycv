<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Tests\TestCase;

class GoogleAnalyticsConversionFlashTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_admin_page_shares_sign_up_conversion_flash(): void
    {
        config(['admin.allowed_emails' => ['admin@example.com']]);

        $user = User::factory()->create([
            'email' => 'admin@example.com',
        ]);

        $this->actingAs($user)
            ->withSession([
                'sign_up_conversion' => [
                    'transaction_id' => 'signup_12_1',
                    'method' => 'WorkOS',
                ],
            ])
            ->withHeaders(['X-Inertia' => 'true'])
            ->get(route('admin.dashboard'))
            ->assertOk()
            ->assertJsonPath('props.flash.sign_up_conversion.transaction_id', 'signup_12_1');
    }

    public function test_admin_dashboard_vue_exposes_gclid_attributed_conversion_test(): void
    {
        $dashboard = file_get_contents(resource_path('js/pages/Admin/Dashboard.vue'));
        $analytics = file_get_contents(resource_path('js/lib/googleAnalytics.ts'));

        $this->assertNotFalse($dashboard);
        $this->assertNotFalse($analytics);
        $this->assertStringContainsString('gaTestGclid', (string) $dashboard);
        $this->assertStringContainsString('bindGclidForTesting', (string) $analytics);
        $this->assertStringContainsString('gclid bound', (string) $analytics);
    }
}
