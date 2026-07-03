<?php

namespace Tests\Unit\Services;

use App\Services\NanoGptService;
use App\Services\ProfileWrittenValuePolisher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class ProfileWrittenValuePolisherTest extends TestCase
{
    use RefreshDatabase;

    public function test_format_only_title_cases_values(): void
    {
        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('chatJson');
        });

        $polisher = app(ProfileWrittenValuePolisher::class);

        $updates = $polisher->formatOnly([
            [
                'field' => 'full_name',
                'value' => 'ralph',
            ],
        ]);

        $this->assertSame('Ralph', $updates[0]['value']);
    }

    public function test_polish_updates_uses_spelling_review_when_available(): void
    {
        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'entries' => [
                    ['index' => 0, 'value' => 'Ralph Wiggum'],
                ],
            ]);
        });

        $polisher = app(ProfileWrittenValuePolisher::class);

        $updates = $polisher->polishUpdates([
            [
                'field' => 'full_name',
                'value' => 'ralph wiggums',
            ],
        ]);

        $this->assertSame('Ralph Wiggum', $updates[0]['value']);
    }
}
