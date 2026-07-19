<?php

namespace Tests\Feature\Api;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\NanoGptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;
use Mockery\MockInterface;
use Tests\TestCase;

class ApplicationJobContextTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateSessionWithWorkOS::class);
    }

    public function test_extension_can_extract_job_context_from_page_text(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn([
                'title' => 'Senior Laravel Developer',
                'company' => 'Example Ltd',
                'location' => 'London, UK',
                'job_description' => 'Build APIs and queue workers.',
                'source' => 'company careers site',
            ]);
        });

        $response = $this->withToken($token)
            ->postJson('/api/applications/assist/job-context', [
                'page_title' => 'Senior Laravel Developer - Example Ltd',
                'page_url' => 'https://jobs.example.com/apply/123',
                'page_text' => 'We are hiring a Senior Laravel Developer in London.',
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('job.title', 'Senior Laravel Developer')
            ->assertJsonPath('job.company', 'Example Ltd')
            ->assertJsonPath('job.job_description', 'Build APIs and queue workers.');
    }

    public function test_job_context_returns_error_when_ai_fails(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->mock(NanoGptService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('chatJson')->once()->andReturn(null);
        });

        $this->withToken($token)
            ->postJson('/api/applications/assist/job-context', [
                'page_title' => 'Apply',
                'page_url' => 'https://jobs.example.com/apply',
                'page_text' => 'Some posting text.',
            ])
            ->assertStatus(503)
            ->assertJsonPath('success', false);
    }
}
