<?php

namespace Tests\Feature\Admin;

use App\Enums\ExtensionAutoApplyEventType;
use App\Models\ExtensionAutoApplyEvent;
use App\Models\ExtensionAutoApplySession;
use App\Models\ExtensionPageCapture;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Tests\TestCase;

class AdminDashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_non_admin_user_is_forbidden(): void
    {
        $user = User::factory()->create([
            'email' => 'someone@example.com',
        ]);

        $this->actingAs($user)
            ->get(route('admin.dashboard'))
            ->assertForbidden();
    }

    public function test_allowed_admin_can_view_dashboard(): void
    {
        $admin = User::factory()->create([
            'email' => 'tmwclaxton@gmail.com',
        ]);

        ExtensionPageCapture::factory()->for($admin)->create([
            'url' => 'https://boards.greenhouse.io/example/jobs/123',
            'page_title' => 'Software Engineer',
            'domain' => 'boards.greenhouse.io',
            'platform' => 'greenhouse',
        ]);

        $this->actingAs($admin)
            ->get(route('admin.dashboard'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Dashboard')
                ->where('stats.total_captures', 1)
                ->has('captures.data', 1)
                ->has('recent_signups')
                ->has('plan_stats')
                ->has('credit_packages')
                ->has('recent_credit_grants')
                ->has('nanogpt_usage_stats')
                ->has('nanogpt_usage_series')
                ->has('power_users')
                ->has('auto_apply_stats')
                ->has('auto_apply_session_series')
                ->has('auto_apply_application_series')
                ->has('auto_apply_sessions')
                ->has('health')
                ->where('health.database.status', 'ok')
                ->has('health.workers.heartbeat_status')
                ->has('health.workers.last_worker_activity_at')
                ->has('health.log_entries'));
    }

    public function test_auto_apply_sessions_ignore_stale_captures_page_param(): void
    {
        $admin = User::factory()->create([
            'email' => 'tmwclaxton@gmail.com',
        ]);

        ExtensionAutoApplySession::factory()->count(2)->for($admin)->create();

        $this->actingAs($admin)
            ->get(route('admin.dashboard', [
                'tab' => 'auto-apply',
                'page' => 2,
            ]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('auto_apply_sessions.data', 2)
                ->where('auto_apply_sessions.total', 2));
    }

    public function test_admin_can_view_and_download_page_capture_html(): void
    {
        $admin = User::factory()->create([
            'email' => 'tobyclaxton@canvassr.org',
        ]);

        $capture = ExtensionPageCapture::factory()->for($admin)->create([
            'html' => '<html><body>Captured page</body></html>',
        ]);

        $this->actingAs($admin)
            ->get(route('admin.page-captures.show', $capture))
            ->assertOk()
            ->assertHeader('Content-Type', 'text/html; charset=UTF-8')
            ->assertSee('Captured page', false);

        $this->actingAs($admin)
            ->get(route('admin.page-captures.download', $capture))
            ->assertOk()
            ->assertDownload();
    }

    public function test_auto_apply_error_event_exposes_page_capture_link_in_dashboard(): void
    {
        $admin = User::factory()->create([
            'email' => 'tmwclaxton@gmail.com',
        ]);

        $session = ExtensionAutoApplySession::factory()->for($admin)->create([
            'status' => 'completed',
        ]);

        $capture = ExtensionPageCapture::factory()->for($admin)->create([
            'url' => 'https://www.linkedin.com/jobs/view/123',
            'platform' => 'linkedin',
            'html' => '<html><body>Failure snapshot</body></html>',
        ]);

        ExtensionAutoApplyEvent::factory()->for($session, 'session')->create([
            'event_type' => ExtensionAutoApplyEventType::Error,
            'job_title' => 'Backend Engineer',
            'company' => 'Acme Corp',
            'job_url' => 'https://www.linkedin.com/jobs/view/123',
            'extension_page_capture_id' => $capture->id,
            'metadata' => ['message' => 'Could not start Easy Apply.'],
        ]);

        $this->actingAs($admin)
            ->get(route('admin.dashboard', ['tab' => 'auto-apply']))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('auto_apply_sessions.data', 1)
                ->where('auto_apply_sessions.data.0.events.0.page_capture_id', $capture->id));
    }
}
