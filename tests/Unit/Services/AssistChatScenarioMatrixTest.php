<?php

namespace Tests\Unit\Services;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\AssistChatActionResolver;
use Tests\Support\AssistChatFixtures as F;
use Tests\TestCase;

class AssistChatScenarioMatrixTest extends TestCase
{
    use RefreshDatabase;

    private AssistChatActionResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();

        $this->resolver = app(AssistChatActionResolver::class);
    }

    /**
     * @return array<string, array{
     *     conversation: array<int, array{role: string, content: string}>,
     *     assistant: string,
     *     extracted: array<int, array{field: string, value: string}>,
     *     expected: array<int, array{field: string, value: string}>,
     *     forbidden?: array<int, string>,
     * }>
     */
    public static function conversationScenarios(): array
    {
        return [
            'empty ai extraction after apply button question' => [
                'conversation' => [
                    ['role' => 'user', 'content' => 'im testing the extension please do'],
                    [
                        'role' => 'assistant',
                        'content' => "Got it. I'll update your profile fields to random values for testing.\n\n- Full name: ".F::NAME_SAM."\n- Location: ".F::CITY_EAST.', UK',
                    ],
                    ['role' => 'user', 'content' => 'where is the apply button'],
                ],
                'assistant' => 'The Apply button appears inside my reply, right after I describe the changes.',
                'extracted' => [],
                'expected' => [],
                'forbidden' => ['full_name', 'location'],
            ],
            'ai extraction for bare name follow up' => [
                'conversation' => [
                    ['role' => 'user', 'content' => 'update my name to '.F::NAME_JORDAN_PARTIAL],
                    ['role' => 'assistant', 'content' => 'I can update your full name to '.F::NAME_JORDAN_PARTIAL.'.'],
                    ['role' => 'user', 'content' => F::NAME_JORDAN],
                ],
                'assistant' => 'I will update your full name to '.F::NAME_JORDAN.'.',
                'extracted' => [['field' => 'full_name', 'value' => F::NAME_JORDAN]],
                'expected' => [['field' => 'full_name', 'value' => F::NAME_JORDAN]],
            ],
            'location field too uses smart location bundle' => [
                'conversation' => [
                    [
                        'role' => 'user',
                        'content' => 'update my name to '.F::PERSON_LOWER.' and my address to '.F::ADDRESS_FULL_RAW,
                    ],
                    [
                        'role' => 'assistant',
                        'content' => 'Your name will update to '.F::PERSON.' and your address to '.F::ADDRESS_FULL_FORMATTED.'.',
                    ],
                    ['role' => 'user', 'content' => 'update my location field though'],
                ],
                'assistant' => 'Your location field will update to '.F::LOCATION_PRIMARY.'.',
                'extracted' => [],
                'expected' => [
                    ['field' => 'location', 'value' => F::LOCATION_PRIMARY],
                    ['field' => 'city', 'value' => F::TOWN_PRIMARY],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_PRIMARY],
                ],
            ],
            'ai extraction for cleared address proposal' => [
                'conversation' => [
                    ['role' => 'user', 'content' => 'all of the location fields'],
                ],
                'assistant' => 'Your address line 1 will be cleared, and your state/region will be set to '.F::COUNTY_SECONDARY.'.',
                'extracted' => [
                    ['field' => 'structured_data.address_line_1', 'value' => ''],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_SECONDARY],
                ],
                'expected' => [
                    ['field' => 'structured_data.address_line_1', 'value' => ''],
                    ['field' => 'structured_data.state_region', 'value' => F::COUNTY_SECONDARY],
                ],
            ],
        ];
    }

    #[DataProvider('conversationScenarios')]
    public function test_conversation_scenarios_resolve_expected_actions(
        array $conversation,
        string $assistant,
        array $extracted,
        array $expected,
        array $forbidden = [],
    ): void {
        $this->mockLocationResolverWhenNeeded($assistant, $expected);

        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create();

        $actions = $this->resolver->resolve($profile, $conversation, $assistant, $extracted);

        $this->assertSame($expected, $actions);

        foreach ($forbidden as $field) {
            $this->assertFalse(
                collect($actions)->contains('field', $field),
                "Field [{$field}] should not appear in actions.",
            );
        }
    }

    /**
     * @param  array<int, array{field: string, value: string}>  $expected
     */
    private function mockLocationResolverWhenNeeded(string $assistant, array $expected): void
    {
        $needsLocationMock = collect($expected)->contains('field', 'location')
            && str_contains($assistant, F::TOWN_PRIMARY);

        if (! $needsLocationMock) {
            return;
        }

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->andReturn(
                F::locationFieldsPayload(F::primaryLocationMock()),
            );
        });

        $this->resolver = app(AssistChatActionResolver::class);
    }
}
