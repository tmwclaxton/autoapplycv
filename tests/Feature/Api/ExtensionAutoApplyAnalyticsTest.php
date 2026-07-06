<?php

namespace Tests\Feature\Api;

use App\Enums\ExtensionAutoApplyEventType;
use App\Enums\ExtensionAutoApplySessionStatus;
use App\Models\AutofillDailyStat;
use App\Models\CvProfile;
use App\Models\ExtensionAutoApplyEvent;
use App\Models\ExtensionAutoApplySession;
use App\Models\ExtensionPageCapture;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExtensionAutoApplyAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_session_create_returns_401(): void
    {
        $this->postJson('/api/extension/auto-apply/sessions', [
            'platform' => 'linkedin',
            'role_description' => 'Software Engineer',
        ])->assertUnauthorized();
    }

    public function test_authenticated_user_can_start_auto_apply_session(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/auto-apply/sessions', [
                'platform' => 'linkedin',
                'role_description' => 'Software Engineer',
                'max_applications' => 5,
            ])
            ->assertCreated()
            ->assertJsonPath('success', true);

        $this->assertDatabaseHas('extension_auto_apply_sessions', [
            'user_id' => $user->id,
            'platform' => 'linkedin',
            'role_description' => 'Software Engineer',
            'status' => ExtensionAutoApplySessionStatus::Running->value,
            'max_applications' => 5,
        ]);
    }

    public function test_authenticated_user_can_update_own_session(): void
    {
        $user = User::factory()->create();
        $session = ExtensionAutoApplySession::factory()->for($user)->running()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->patchJson("/api/extension/auto-apply/sessions/{$session->id}", [
                'status' => ExtensionAutoApplySessionStatus::Completed->value,
                'jobs_found' => 12,
                'applied_count' => 3,
                'skipped_count' => 2,
                'error_count' => 1,
                'fields_filled_count' => 24,
                'stopped_at' => now()->toIso8601String(),
            ])
            ->assertOk()
            ->assertJsonPath('success', true);

        $session->refresh();

        $this->assertSame(ExtensionAutoApplySessionStatus::Completed, $session->status);
        $this->assertSame(12, $session->jobs_found);
        $this->assertSame(3, $session->applied_count);
        $this->assertSame(24, $session->fields_filled_count);
        $this->assertNotNull($session->stopped_at);
    }

    public function test_user_cannot_update_another_users_session(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $session = ExtensionAutoApplySession::factory()->for($owner)->running()->create();
        $token = $other->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->patchJson("/api/extension/auto-apply/sessions/{$session->id}", [
                'applied_count' => 99,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['session_id']);
    }

    public function test_authenticated_user_can_store_auto_apply_event(): void
    {
        $user = User::factory()->create();
        $session = ExtensionAutoApplySession::factory()->for($user)->running()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/auto-apply/events', [
                'session_id' => $session->id,
                'event_type' => ExtensionAutoApplyEventType::Submitted->value,
                'job_title' => 'Backend Engineer',
                'company' => 'Acme Corp',
                'job_url' => 'https://www.linkedin.com/jobs/view/123',
                'fields_filled_count' => 8,
                'metadata' => ['step_label' => 'Contact info'],
            ])
            ->assertCreated()
            ->assertJsonPath('success', true);

        $this->assertDatabaseHas('extension_auto_apply_events', [
            'extension_auto_apply_session_id' => $session->id,
            'event_type' => ExtensionAutoApplyEventType::Submitted->value,
            'job_title' => 'Backend Engineer',
            'company' => 'Acme Corp',
            'fields_filled_count' => 8,
        ]);

        $event = ExtensionAutoApplyEvent::query()->first();
        $this->assertSame('Contact info', $event?->metadata['step_label'] ?? null);
    }

    public function test_draft_all_event_records_user_fields_autofilled_without_daily_stat_duplication(): void
    {
        $user = User::factory()->create([
            'fields_autofilled' => 2,
            'ai_tokens_period_start' => now()->startOfMonth(),
        ]);
        $session = ExtensionAutoApplySession::factory()->for($user)->running()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/auto-apply/events', [
                'session_id' => $session->id,
                'event_type' => ExtensionAutoApplyEventType::DraftAll->value,
                'fields_filled_count' => 5,
            ])
            ->assertCreated();

        $user->refresh();

        $this->assertSame(7, $user->fields_autofilled);
        $this->assertNull(AutofillDailyStat::query()->first());
    }

    public function test_auto_apply_event_does_not_increment_global_answers_count(): void
    {
        AutofillDailyStat::factory()->create([
            'date' => now()->toDateString(),
            'answers_count' => 10,
        ]);

        $user = User::factory()->create();
        $session = ExtensionAutoApplySession::factory()->for($user)->running()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/auto-apply/events', [
                'session_id' => $session->id,
                'event_type' => ExtensionAutoApplyEventType::Submitted->value,
                'fields_filled_count' => 8,
            ])
            ->assertCreated();

        $this->assertSame(
            10,
            AutofillDailyStat::query()->whereDate('date', now()->toDateString())->value('answers_count'),
        );
    }

    public function test_user_cannot_store_event_for_another_users_session(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $session = ExtensionAutoApplySession::factory()->for($owner)->running()->create();
        $token = $other->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/auto-apply/events', [
                'session_id' => $session->id,
                'event_type' => ExtensionAutoApplyEventType::Skipped->value,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['session_id']);
    }

    public function test_session_create_requires_platform_and_role_description(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/auto-apply/sessions', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['platform', 'role_description']);
    }

    public function test_error_event_with_failure_html_persists_redacted_page_capture(): void
    {
        $user = User::factory()->create([
            'name' => 'Toby Claxton',
            'email' => 'tmwclaxton@gmail.com',
        ]);

        CvProfile::factory()->for($user)->create([
            'full_name' => 'Toby Claxton',
            'email' => 'tmwclaxton@gmail.com',
        ]);

        $session = ExtensionAutoApplySession::factory()->for($user)->running()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/auto-apply/events', [
                'session_id' => $session->id,
                'event_type' => ExtensionAutoApplyEventType::Error->value,
                'job_title' => 'Backend Engineer',
                'company' => 'Acme Corp',
                'job_url' => 'https://www.linkedin.com/jobs/view/123',
                'metadata' => ['message' => 'Could not start Easy Apply.'],
                'failure_html' => '<html><body>Toby Claxton tmwclaxton@gmail.com</body></html>',
                'page_url' => 'https://www.linkedin.com/jobs/view/123',
                'page_title' => 'Backend Engineer at Acme Corp',
            ])
            ->assertCreated()
            ->assertJsonPath('success', true);

        $event = ExtensionAutoApplyEvent::query()->first();
        $capture = ExtensionPageCapture::query()->first();

        $this->assertNotNull($event);
        $this->assertNotNull($capture);
        $this->assertSame($capture->id, $event->extension_page_capture_id);
        $this->assertSame('https://www.linkedin.com/jobs/view/123', $capture->url);
        $this->assertSame('linkedin', $capture->platform);
        $this->assertStringNotContainsString('Toby Claxton', $capture->html);
        $this->assertStringNotContainsString('tmwclaxton@gmail.com', $capture->html);
        $this->assertStringContainsString('Alex Candidate', $capture->html);
        $this->assertStringContainsString('candidate@example.com', $capture->html);
    }

    public function test_failure_html_is_rejected_for_non_error_events(): void
    {
        $user = User::factory()->create();
        $session = ExtensionAutoApplySession::factory()->for($user)->running()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/auto-apply/events', [
                'session_id' => $session->id,
                'event_type' => ExtensionAutoApplyEventType::Skipped->value,
                'failure_html' => '<html><body>Failure</body></html>',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['failure_html']);

        $this->assertDatabaseCount('extension_page_captures', 0);
    }
}
