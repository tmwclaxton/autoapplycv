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

    /**
     * @return array<string, mixed>
     */
    private function tewkesburyLocationBundlePayload(): array
    {
        return [
            'location_fields' => [
                'location' => 'Tewkesbury, Gloucestershire',
                'city' => 'Tewkesbury',
                'postcode' => null,
                'country' => 'United Kingdom',
                'address_line_1' => '',
                'address_line_2' => '',
                'state_region' => 'Gloucestershire',
            ],
            'reason' => 'Moving home to Tewkesbury.',
        ];
    }

    public function test_stream_chat_emits_actions_only_after_ai_extraction_and_location_bundle(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'location' => 'Wycombe, England',
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatStream')->once()->andReturn('Done. Use Apply below for each change.');
            $mock->shouldReceive('chatJson')->andReturn(
                ['profile_updates' => [], 'draft_answer' => null],
                ['profile_updates' => [], 'draft_answer' => null],
                ['profile_updates' => [], 'draft_answer' => null],
                $this->tewkesburyLocationBundlePayload(),
            );
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

        $processingEvent = collect($events)->firstWhere('type', 'processing');
        $this->assertSame('actions', $processingEvent['phase'] ?? null);

        $toolsEvent = collect($events)->firstWhere('type', 'tools');
        $this->assertNotNull($toolsEvent);
        $this->assertContains('city', collect($toolsEvent['actions'] ?? [])->pluck('field')->all());

        $complete = collect($events)->firstWhere('type', 'complete');
        $this->assertContains('structured_data.state_region', collect($complete['actions'] ?? [])->pluck('field')->all());
    }

    public function test_stream_chat_emits_actions_from_assistant_relocation_proposal(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'location' => 'High Wycombe, Buckinghamshire',
            'structured_data' => [
                'address_line_1' => '343 West Wycombe Road',
                'state_region' => 'Buckinghamshire',
            ],
        ]);

        $assistantReply = "Updating your profile with the following changes:\n"
            ."- Address line 1 cleared (old street address removed)\n"
            ."- Address line 2 left blank\n"
            ."- Town/city set to Harborford\n"
            ."- State/region set to Buckinghamshire\n"
            ."- Application settings updated for UK applications\n\n"
            .'Your full location will now show as Harborford, Buckinghamshire.';

        $this->mock(NanoGptService::class, function (MockInterface $mock) use ($assistantReply): void {
            $mock->shouldReceive('chatStream')->once()->andReturn($assistantReply);
            $mock->shouldReceive('chatJson')->andReturn(
                ['profile_updates' => [], 'draft_answer' => null],
                [
                    'profile_updates' => [
                        ['field' => 'structured_data.address_line_1', 'label' => 'Address line 1', 'value' => '', 'reason' => 'Clear old address.'],
                        ['field' => 'structured_data.address_line_2', 'label' => 'Address line 2', 'value' => '', 'reason' => 'Leave blank.'],
                        ['field' => 'city', 'label' => 'City', 'value' => 'Harborford', 'reason' => 'Relocation.'],
                        ['field' => 'structured_data.state_region', 'label' => 'State / region', 'value' => 'Buckinghamshire', 'reason' => 'Relocation.'],
                        ['field' => 'location', 'label' => 'Location', 'value' => 'Harborford, Buckinghamshire', 'reason' => 'Relocation.'],
                    ],
                    'draft_answer' => null,
                ],
            );
        });

        $events = [];
        $service = app(ApplicationAssistantService::class);

        $ok = $service->streamChat(
            $profile,
            [[
                'role' => 'user',
                'content' => 'I’m moving to Harborford next month. Update my profile for UK applications - new contact details, location, and application preferences. Clear my old street address.',
            ]],
            [],
            static function (array $payload) use (&$events): void {
                $events[] = $payload;
            },
        );

        $this->assertTrue($ok);

        $toolsEvent = collect($events)->firstWhere('type', 'tools');
        $this->assertNotNull($toolsEvent);

        $fields = collect($toolsEvent['actions'] ?? [])->pluck('field')->all();
        $this->assertContains('structured_data.address_line_1', $fields);
        $this->assertContains('city', $fields);
        $this->assertContains('location', $fields);
        $this->assertSame('', collect($toolsEvent['actions'])->firstWhere('field', 'structured_data.address_line_1')['value'] ?? null);
    }

    public function test_stream_chat_uses_ai_extraction_for_multi_field_updates(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create();

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatStream')->once()->andReturn('Use Apply below for each change.');
            $mock->shouldReceive('chatJson')->andReturn(
                [
                    'profile_updates' => [
                        ['field' => 'structured_data.address_line_1', 'label' => 'Address line 1', 'value' => '', 'reason' => 'Clear.'],
                        ['field' => 'structured_data.state_region', 'label' => 'State / region', 'value' => 'Gloucestershire', 'reason' => 'Region.'],
                    ],
                    'draft_answer' => null,
                ],
            );
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

    public function test_stream_chat_emits_smart_location_bundle_for_all_location_fields_follow_up(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'location' => 'High Wycombe, Buckinghamshire',
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatStream')->once()->andReturn(
                'I will update all location fields for Tewkesbury, including clearing your old street address.',
            );
            $mock->shouldReceive('chatJson')->andReturn(
                ['profile_updates' => [], 'draft_answer' => null],
                ['profile_updates' => [], 'draft_answer' => null],
                ['profile_updates' => [], 'draft_answer' => null],
                $this->tewkesburyLocationBundlePayload(),
            );
        });

        $events = [];
        $service = app(ApplicationAssistantService::class);

        $ok = $service->streamChat(
            $profile,
            [
                ['role' => 'user', 'content' => 'update my location to Tewkesbury'],
                ['role' => 'assistant', 'content' => 'I can update your location to Tewkesbury.'],
                ['role' => 'user', 'content' => 'yes update all location fields'],
            ],
            [],
            static function (array $payload) use (&$events): void {
                $events[] = $payload;
            },
        );

        $this->assertTrue($ok);

        $complete = collect($events)->firstWhere('type', 'complete');
        $fields = collect($complete['actions'] ?? [])->pluck('field')->all();

        $this->assertContains('city', $fields);
        $this->assertContains('structured_data.address_line_1', $fields);
        $this->assertContains('structured_data.state_region', $fields);
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

    public function test_stream_chat_does_not_create_profile_update_for_apply_button_question(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'full_name' => 'Toby Claxton',
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatStream')->once()->andReturn(
                'The Apply button appears inside my reply, right after I describe the changes.',
            );
            $mock->shouldReceive('chatJson')->andReturn(
                ['profile_updates' => [], 'draft_answer' => null],
                ['profile_updates' => [], 'draft_answer' => null],
                ['profile_updates' => [], 'draft_answer' => null],
            );
        });

        $events = [];
        $service = app(ApplicationAssistantService::class);

        $ok = $service->streamChat(
            $profile,
            [
                ['role' => 'user', 'content' => 'im testing the extension please do'],
                [
                    'role' => 'assistant',
                    'content' => "Got it. I'll update your profile fields to random values for testing purposes.\n\n- Full name: Marcus Webb",
                ],
                ['role' => 'user', 'content' => 'where is the apply button'],
            ],
            [],
            static function (array $payload) use (&$events): void {
                $events[] = $payload;
            },
        );

        $this->assertTrue($ok);

        $complete = collect($events)->firstWhere('type', 'complete');
        $this->assertSame([], $complete['actions'] ?? []);
    }

    public function test_stream_chat_emits_apply_tags_for_comma_separated_profile_command(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create();

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatStream')->once()->andReturn(
                "I'll update your profile with the new contact details, headline, summary, LinkedIn URL, and postcode.",
            );
            $mock->shouldReceive('chatJson')->andReturn(
                ['profile_updates' => [], 'draft_answer' => null],
                ['profile_updates' => [], 'draft_answer' => null],
            );
        });

        $events = [];
        $service = app(ApplicationAssistantService::class);

        $ok = $service->streamChat(
            $profile,
            [
                [
                    'role' => 'user',
                    'content' => 'update my profile email alex@example.com, phone +44 7700 900123, headline Senior Laravel Developer, summary Backend engineer focused on APIs and queue workers., linkedin https://linkedin.com/in/example-user, postcode ex12 4ab, country united kingdom',
                ],
            ],
            [],
            static function (array $payload) use (&$events): void {
                $events[] = $payload;
            },
        );

        $this->assertTrue($ok);

        $toolsEvent = collect($events)->firstWhere('type', 'tools');
        $this->assertNotNull($toolsEvent);

        $fields = collect($toolsEvent['actions'] ?? [])->pluck('field')->all();
        $this->assertContains('email', $fields);
        $this->assertContains('phone', $fields);
        $this->assertContains('headline', $fields);
        $this->assertContains('summary', $fields);
        $this->assertContains('linkedin_url', $fields);
        $this->assertContains('postcode', $fields);
        $this->assertContains('country', $fields);
    }
}
