<?php

namespace Tests\Unit\Services;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\ApplicationAssistantService;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class ApplicationAssistantServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_stream_chat_emits_direct_profile_update_before_ai_reply(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'location' => 'Wycombe, England',
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatStream')->once()->andReturn('Done. Use Apply below to save it.');
            $mock->shouldReceive('chatJson')->never();
        });

        $events = [];
        $service = app(ApplicationAssistantService::class);

        $ok = $service->streamChat(
            $profile,
            [
                ['role' => 'user', 'content' => 'update my location on my profile to Tewkesbury'],
            ],
            [],
            static function (array $payload) use (&$events): void {
                $events[] = $payload;
            },
        );

        $this->assertTrue($ok);
        $this->assertSame('tools', $events[0]['type'] ?? null);
        $this->assertSame('location', $events[0]['actions'][0]['field'] ?? null);
        $this->assertSame('Tewkesbury', $events[0]['actions'][0]['value'] ?? null);
        $this->assertSame('complete', collect($events)->firstWhere('type', 'complete')['type'] ?? null);
    }

    public function test_stream_chat_emits_multiple_direct_profile_updates(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create();

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatStream')->once()->andReturn('Use Apply below for each change.');
            $mock->shouldReceive('chatJson')->never();
        });

        $events = [];
        $service = app(ApplicationAssistantService::class);

        $ok = $service->streamChat(
            $profile,
            [
                ['role' => 'user', 'content' => 'address blank, region Gloucestershire'],
            ],
            [],
            static function (array $payload) use (&$events): void {
                $events[] = $payload;
            },
        );

        $this->assertTrue($ok);

        $toolsEvent = collect($events)->firstWhere('type', 'tools');
        $this->assertCount(2, $toolsEvent['actions'] ?? []);
        $this->assertSame('structured_data.address_line_1', $toolsEvent['actions'][0]['field'] ?? null);
        $this->assertSame('structured_data.state_region', $toolsEvent['actions'][1]['field'] ?? null);
    }

    public function test_stream_chat_still_uses_extraction_for_suggestions(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'summary' => 'Backend engineer with Laravel experience.',
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatStream')->once()->andReturn('Try emphasising your Laravel API work in your summary.');
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'profile_updates' => [
                    [
                        'field' => 'summary',
                        'label' => 'Professional summary',
                        'value' => 'Backend engineer specialising in Laravel APIs.',
                        'reason' => 'More specific for backend roles.',
                    ],
                ],
                'draft_answer' => null,
            ]);
        });

        $events = [];
        $service = app(ApplicationAssistantService::class);

        $ok = $service->streamChat(
            $profile,
            [
                ['role' => 'user', 'content' => 'Help me improve my summary for backend roles.'],
            ],
            [],
            static function (array $payload) use (&$events): void {
                $events[] = $payload;
            },
        );

        $this->assertTrue($ok);

        $toolsEvent = collect($events)->firstWhere('type', 'tools');
        $this->assertSame('summary', $toolsEvent['actions'][0]['field'] ?? null);
    }
}
