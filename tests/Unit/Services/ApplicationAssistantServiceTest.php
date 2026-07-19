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

    public function test_answer_questions_includes_location_and_motivation_guidance(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'city' => 'Belfast',
            'location' => 'Belfast, Belfast, Northern Ireland, United Kingdom',
            'summary' => 'Backend engineer with Laravel experience.',
        ]);

        $capturedUserPayload = null;

        $this->mock(NanoGptService::class, function (MockInterface $mock) use (&$capturedUserPayload): void {
            $mock->shouldReceive('chatJson')
                ->once()
                ->withArgs(function (array $messages): bool {
                    return ($messages[1]['role'] ?? null) === 'user';
                })
                ->andReturnUsing(function (array $messages) use (&$capturedUserPayload): array {
                    $capturedUserPayload = json_decode($messages[1]['content'], true);

                    return [
                        'answers' => [
                            [
                                'label' => 'location (city)',
                                'ref' => 'loc-city',
                                'answer' => 'Belfast',
                            ],
                            [
                                'label' => 'Why are you interested in this role?',
                                'ref' => 'motivation',
                                'answer' => 'I want to work on APIs that ship to production quickly.',
                            ],
                        ],
                    ];
                });
        });

        $service = app(ApplicationAssistantService::class);

        $result = $service->answerQuestions(
            $profile,
            ['title' => 'Engineer', 'company' => 'Acme'],
            [
                [
                    'label' => 'location (city)',
                    'ref' => 'loc-city',
                    'field_type' => 'text',
                ],
                [
                    'label' => 'Why are you interested in this role?',
                    'ref' => 'motivation',
                    'field_type' => 'textarea',
                    'max_chars' => 1000,
                ],
            ],
        );

        $this->assertNotNull($result);
        $this->assertSame('Belfast', $result['answers'][0]['answer'] ?? null);

        $instructions = (string) ($capturedUserPayload['instructions'] ?? '');
        $this->assertStringContainsString('city name', $instructions);
        $this->assertStringContainsString('Never paste raw profile fields', $instructions);
        $this->assertStringContainsString('Never invent a candidate name', $instructions);
        $this->assertStringContainsString('culture-values', $instructions);
        $this->assertStringContainsString(
            'not for open-ended motivation or culture-values essays',
            $instructions,
        );
    }

    public function test_answer_questions_overrides_hallucinated_identity_with_profile_values(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'full_name' => 'Toby Claxton',
            'email' => 'toby@example.com',
            'phone' => '+44 7700 900123',
            'city' => 'High Wycombe',
            'experience' => [
                [
                    'title' => 'Senior Engineer',
                    'company' => 'Acme Corp',
                    'start_date' => '2020-01',
                    'end_date' => 'Present',
                    'highlights' => ['Built Laravel APIs for internal tools'],
                    'technologies' => ['PHP', 'Laravel'],
                ],
            ],
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'answers' => [
                    ['label' => 'First name', 'ref' => 'f1', 'answer' => 'Alex'],
                    ['label' => 'Last name', 'ref' => 'f2', 'answer' => 'Andersson'],
                    ['label' => 'Email', 'ref' => 'f3', 'answer' => 'alex.andersson@email.com'],
                    [
                        'label' => 'In short, what is your main interest in this role?',
                        'ref' => 'f4',
                        'answer' => 'At Acme Corp I have built Laravel APIs and want to bring that backend work to this role.',
                    ],
                ],
            ]);
        });

        $service = app(ApplicationAssistantService::class);

        $result = $service->answerQuestions(
            $profile,
            ['title' => 'Marketing Manager', 'company' => 'Vekst'],
            [
                ['label' => 'First name', 'ref' => 'f1', 'field_type' => 'text'],
                ['label' => 'Last name', 'ref' => 'f2', 'field_type' => 'text'],
                ['label' => 'Email', 'ref' => 'f3', 'field_type' => 'email'],
                [
                    'label' => 'In short, what is your main interest in this role?',
                    'ref' => 'f4',
                    'field_type' => 'textarea',
                    'max_chars' => 500,
                ],
            ],
        );

        $this->assertNotNull($result);

        $answersByRef = collect($result['answers'])->keyBy('ref');

        $this->assertSame('Toby', $answersByRef->get('f1')['answer'] ?? null);
        $this->assertSame('Claxton', $answersByRef->get('f2')['answer'] ?? null);
        $this->assertSame('toby@example.com', $answersByRef->get('f3')['answer'] ?? null);
        $this->assertSame(
            'At Acme Corp I have built Laravel APIs and want to bring that backend work to this role.',
            $answersByRef->get('f4')['answer'] ?? null,
        );
    }

    public function test_answer_questions_uses_full_profile_for_portfolio_questions(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'experience' => [
                [
                    'title' => 'Senior Engineer',
                    'company' => 'Acme Corp',
                    'start_date' => '2020-01',
                    'end_date' => 'Present',
                    'highlights' => ['Built Laravel APIs for internal tools'],
                    'technologies' => ['PHP', 'Laravel'],
                ],
            ],
        ]);

        $capturedSystemPrompt = null;

        $this->mock(NanoGptService::class, function (MockInterface $mock) use (&$capturedSystemPrompt): void {
            $mock->shouldReceive('chatJson')
                ->once()
                ->andReturnUsing(function (array $messages) use (&$capturedSystemPrompt): array {
                    $capturedSystemPrompt = $messages[0]['content'] ?? null;

                    return [
                        'answers' => [[
                            'label' => 'Share your GitHub or portfolio work',
                            'ref' => 'portfolio',
                            'answer' => 'Most of my work at Acme Corp is private, but I built Laravel APIs for internal tools there.',
                        ]],
                    ];
                });
        });

        $service = app(ApplicationAssistantService::class);

        $result = $service->answerQuestions(
            $profile,
            ['title' => 'Engineer', 'company' => 'Micro1'],
            [[
                'label' => 'Share your GitHub or portfolio work',
                'ref' => 'portfolio',
                'field_type' => 'text',
                'max_chars' => 500,
            ]],
        );

        $this->assertNotNull($result);
        $this->assertStringContainsString('Acme Corp', (string) $capturedSystemPrompt);
        $this->assertStringContainsString('experience', (string) $capturedSystemPrompt);
        $this->assertStringContainsString('Acme Corp', (string) ($result['answers'][0]['answer'] ?? ''));
    }

    public function test_answer_questions_includes_full_profile_for_simple_field_batches(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'email' => 'toby@example.com',
            'phone' => '+447700900123',
            'linkedin_url' => 'https://linkedin.com/in/toby',
            'website_url' => 'https://toby.dev',
            'postcode' => 'HP11 1AA',
            'raw_cv_text' => 'SECRET_RAW_CV_SHOULD_NOT_APPEAR',
            'formatted_cv_text' => 'SECRET_FORMATTED_CV_SHOULD_NOT_APPEAR',
            'extra_context' => 'Open to hybrid London roles.',
            'application_settings' => [
                'notice_period' => '1 month',
                'years_of_experience' => '8',
            ],
            'experience' => [
                [
                    'title' => 'Senior Engineer',
                    'company' => 'Riverbank Systems',
                    'start_date' => '2019-01',
                    'end_date' => 'Present',
                    'highlights' => ['Led Laravel platform work'],
                    'technologies' => ['PHP', 'Laravel'],
                ],
            ],
            'education' => [
                [
                    'institution' => 'Example University',
                    'degree' => 'BSc Computer Science',
                ],
            ],
        ]);

        $capturedSystemPrompt = null;

        $this->mock(NanoGptService::class, function (MockInterface $mock) use (&$capturedSystemPrompt): void {
            $mock->shouldReceive('chatJson')
                ->once()
                ->andReturnUsing(function (array $messages) use (&$capturedSystemPrompt): array {
                    $capturedSystemPrompt = $messages[0]['content'] ?? null;

                    return [
                        'answers' => [[
                            'label' => 'LinkedIn profile URL',
                            'ref' => 'li',
                            'answer' => 'https://linkedin.com/in/toby',
                        ]],
                    ];
                });
        });

        $service = app(ApplicationAssistantService::class);

        $result = $service->answerQuestions(
            $profile,
            ['title' => 'Engineer', 'company' => 'Acme', 'job_description' => 'Long JD that should stay compact for simple batches.'],
            [[
                'label' => 'LinkedIn profile URL',
                'ref' => 'li',
                'field_type' => 'text',
            ]],
            ['yearsOfExperience' => '8'],
        );

        $this->assertNotNull($result);
        $prompt = (string) $capturedSystemPrompt;

        $this->assertStringContainsString('toby@example.com', $prompt);
        $this->assertStringContainsString('+447700900123', $prompt);
        $this->assertStringContainsString('linkedin.com', $prompt);
        $this->assertStringContainsString('toby.dev', $prompt);
        $this->assertStringContainsString('HP11 1AA', $prompt);
        $this->assertStringContainsString('Riverbank Systems', $prompt);
        $this->assertStringContainsString('Example University', $prompt);
        $this->assertStringContainsString('Open to hybrid London roles.', $prompt);
        $this->assertStringContainsString('1 month', $prompt);
        $this->assertStringNotContainsString('SECRET_RAW_CV_SHOULD_NOT_APPEAR', $prompt);
        $this->assertStringNotContainsString('SECRET_FORMATTED_CV_SHOULD_NOT_APPEAR', $prompt);
    }

    public function test_answer_questions_rejects_ungrounded_security_answer(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'experience' => [
                [
                    'title' => 'Senior Engineer',
                    'company' => 'Acme Corp',
                    'start_date' => '2020-01',
                    'end_date' => 'Present',
                    'highlights' => ['Built Laravel APIs for internal tools'],
                    'technologies' => ['PHP', 'Laravel'],
                ],
            ],
        ]);

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'answers' => [[
                    'label' => 'Describe your security experience',
                    'ref' => 'secops',
                    'answer' => 'I built OAuth2 for a fintech platform using Node.js and PostgreSQL.',
                ]],
            ]);
        });

        $service = app(ApplicationAssistantService::class);

        $result = $service->answerQuestions(
            $profile,
            ['title' => 'SecOps Engineer', 'company' => 'Micro1'],
            [[
                'label' => 'Describe your security experience',
                'ref' => 'secops',
                'field_type' => 'text',
                'max_chars' => 500,
            ]],
        );

        $this->assertNotNull($result);
        $this->assertCount(1, $result['answers']);
        $this->assertNull($result['answers'][0]['answer']);
    }

    public function test_answer_questions_coerces_age_statement_to_yes_no_select_with_placeholder(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create();

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'answers' => [[
                    'label' => 'are you over the age of 18?',
                    'ref' => 'f9',
                    'answer' => 'I am 23',
                ]],
            ]);
        });

        $service = app(ApplicationAssistantService::class);

        $result = $service->answerQuestions(
            $profile,
            ['title' => 'Account Manager', 'company' => 'SunSource'],
            [[
                'label' => 'are you over the age of 18?',
                'ref' => 'f9',
                'field_type' => 'select',
                'options' => ['Select...', 'Yes', 'No'],
            ]],
        );

        $this->assertNotNull($result);
        $this->assertCount(1, $result['answers']);
        $this->assertSame('Yes', $result['answers'][0]['answer']);
    }

    public function test_cover_letter_and_form_prompts_require_naming_job_company(): void
    {
        $source = (string) file_get_contents(app_path('Services/ApplicationAssistantService.php'));

        $this->assertStringContainsString(
            'MUST name that company in the opening',
            $source,
        );
        $this->assertStringContainsString(
            'MUST name the target employer (job.company)',
            $source,
        );
    }
}
