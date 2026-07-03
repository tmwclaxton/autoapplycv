<?php

namespace Tests\Unit\Services;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\Support\AssistChatActionResolver;
use Tests\Support\AssistChatScenarioCatalog;
use Tests\TestCase;

class AssistChatProbeTest extends TestCase
{
    use RefreshDatabase;

    public function test_must_not_parse_scenarios_stay_empty_with_empty_ai_extraction(): void
    {
        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->andReturn(['entries' => []]);
        });

        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create();
        $resolver = app(AssistChatActionResolver::class);

        $failures = [];

        foreach (AssistChatScenarioCatalog::all() as $scenario) {
            if (($scenario['must_be_empty'] ?? false) !== true) {
                continue;
            }

            $actions = $resolver->resolve(
                $profile,
                $scenario['conversation'],
                (string) ($scenario['assistant'] ?? ''),
                $scenario['extracted'] ?? [],
            );

            if ($actions !== []) {
                $failures[] = $scenario['id'].': '.json_encode($actions);
            }
        }

        $this->assertSame([], $failures, implode("\n", $failures));
    }
}
