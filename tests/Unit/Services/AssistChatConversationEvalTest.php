<?php

namespace Tests\Unit\Services;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\ApplicationAssistantService;
use App\Services\NanoGptService;
use App\Services\ProfileLocationUpdateResolver;
use App\Services\ProfileWrittenValuePolisher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\Support\AssistChatActionResolver;
use Tests\Support\AssistChatFixtures as F;
use Tests\Support\AssistChatScenarioCatalog;
use Tests\Support\AssistChatScenarioEvaluator;
use Tests\TestCase;

class AssistChatConversationEvalTest extends TestCase
{
    use RefreshDatabase;

    private AssistChatActionResolver $resolver;

    private AssistChatScenarioEvaluator $evaluator;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->andReturnUsing(function (array $messages): array {
                $userContent = (string) ($messages[1]['content'] ?? '');
                $decoded = json_decode($userContent, true);

                if (! is_array($decoded) || ! isset($decoded['target_place'])) {
                    return ['entries' => []];
                }

                $response = F::mockLocationResponseForPlace((string) $decoded['target_place']);

                return $response ?? ['location_fields' => [], 'reason' => 'Unknown place.'];
            });
        });

        $this->resolver = new AssistChatActionResolver(
            app(ProfileLocationUpdateResolver::class),
            app(ProfileWrittenValuePolisher::class),
        );
        $this->evaluator = new AssistChatScenarioEvaluator;
    }

    public function test_catalog_has_hundreds_of_scenarios(): void
    {
        $this->assertGreaterThanOrEqual(
            400,
            AssistChatScenarioCatalog::count(),
            'Expected at least 400 assist chat scenarios in the catalog.',
        );
    }

    public function test_catalog_reports_category_coverage(): void
    {
        $counts = [];

        foreach (AssistChatScenarioCatalog::all() as $scenario) {
            $category = (string) ($scenario['category'] ?? 'unknown');
            $counts[$category] = ($counts[$category] ?? 0) + 1;
        }

        $this->assertGreaterThanOrEqual(10, count($counts));
        $this->assertGreaterThanOrEqual(30, $counts['must_not_parse'] ?? 0);
        $this->assertGreaterThanOrEqual(30, $counts['help_and_draft'] ?? 0);
        $this->assertGreaterThanOrEqual(
            150,
            ($counts['direct_update'] ?? 0) + ($counts['ai_extraction_phrasing'] ?? 0),
        );
        $this->assertGreaterThanOrEqual(3, $counts['mega_change_request'] ?? 0);
    }

    public function test_all_catalog_scenarios_pass_judgment(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'full_name' => F::PERSON,
            'location' => F::LOCATION_PRIMARY,
        ]);

        $failures = [];

        foreach (AssistChatScenarioCatalog::all() as $scenario) {
            $actions = $this->resolveScenarioActions($profile, $scenario);
            $result = $this->evaluator->evaluate($scenario, $actions);

            if (! $result['passed']) {
                $failures[$scenario['id']] = [
                    'category' => $scenario['category'],
                    'reasons' => $result['reasons'],
                    'last_user' => $this->lastUserMessage($scenario['conversation']),
                    'actions' => $actions,
                ];
            }
        }

        $summary = collect($failures)
            ->take(15)
            ->map(function (array $failure, string $id): string {
                return $id.' ['.$failure['category'].']: '.implode(' | ', $failure['reasons']);
            })
            ->implode("\n");

        $this->assertSame(
            [],
            $failures,
            AssistChatScenarioCatalog::count().' scenarios evaluated. Failures ('.count($failures)."):\n".$summary,
        );
    }

    public function test_stream_chat_handles_complex_multi_turn_with_mocked_extraction(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create();

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatStream')->once()->andReturn(
                "Got it. I'll update your profile for testing.\n\n- Full name: Marcus Webb\n- Headline: Full Stack Developer\n- Location: Manchester, UK\n\nTap Apply below.",
            );
            $mock->shouldReceive('chatJson')->andReturn(
                [
                    'profile_updates' => [
                        ['field' => 'full_name', 'label' => 'Full name', 'value' => 'Marcus Webb', 'reason' => 'Test data.'],
                        ['field' => 'headline', 'label' => 'Headline', 'value' => 'Full Stack Developer', 'reason' => 'Test data.'],
                        ['field' => 'location', 'label' => 'Location', 'value' => 'Manchester, UK', 'reason' => 'Test data.'],
                    ],
                    'draft_answer' => null,
                ],
                ['profile_updates' => [], 'draft_answer' => null],
            );
        });

        $events = [];
        $service = app(ApplicationAssistantService::class);

        $ok = $service->streamChat(
            $profile,
            [
                ['role' => 'user', 'content' => 'update my profile fields to random values for testing'],
            ],
            [],
            static function (array $payload) use (&$events): void {
                $events[] = $payload;
            },
        );

        $this->assertTrue($ok);

        $complete = collect($events)->firstWhere('type', 'complete');
        $fields = collect($complete['actions'] ?? [])->pluck('field')->all();

        $this->assertContains('full_name', $fields);
        $this->assertContains('headline', $fields);
        $this->assertContains('location', $fields);
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @return array<int, array{field: string, value: mixed}>
     */
    private function resolveScenarioActions(CvProfile $profile, array $scenario): array
    {
        /** @var array<int, array{field: string, value: mixed}> $extracted */
        $extracted = $scenario['extracted'] ?? [];

        return $this->resolver->resolve(
            $profile,
            $scenario['conversation'],
            (string) ($scenario['assistant'] ?? ''),
            $extracted,
        );
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $conversation
     */
    private function lastUserMessage(array $conversation): ?string
    {
        for ($index = count($conversation) - 1; $index >= 0; $index--) {
            if (($conversation[$index]['role'] ?? '') !== 'user') {
                continue;
            }

            return trim((string) ($conversation[$index]['content'] ?? ''));
        }

        return null;
    }
}
