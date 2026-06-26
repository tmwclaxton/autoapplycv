<?php

namespace Tests\Feature\Api;

use App\Models\CvProfile;
use App\Models\JobApplication;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class JobApplicationTest extends TestCase
{
    use RefreshDatabase;

    public function test_extension_can_record_a_job_application(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/applications', [
                'title' => 'Senior Laravel Developer',
                'company' => 'Example Ltd',
                'link' => 'https://www.linkedin.com/jobs/view/1234567890',
                'location' => 'London, UK',
                'source' => 'linkedin',
                'applied_at' => now()->toIso8601String(),
            ])
            ->assertCreated()
            ->assertJsonPath('application.title', 'Senior Laravel Developer');

        $this->assertDatabaseHas('job_applications', [
            'user_id' => $user->id,
            'company' => 'Example Ltd',
        ]);
    }

    public function test_duplicate_application_links_are_updated_not_duplicated(): void
    {
        $user = User::factory()->create();
        CvProfile::factory()->for($user)->create();
        $token = $user->createToken('extension')->plainTextToken;

        JobApplication::factory()->for($user)->create([
            'title' => 'Old title',
            'link' => 'https://www.linkedin.com/jobs/view/1234567890',
        ]);

        $this->withToken($token)
            ->postJson('/api/applications', [
                'title' => 'Updated title',
                'company' => 'Example Ltd',
                'link' => 'https://www.linkedin.com/jobs/view/1234567890',
            ])
            ->assertOk()
            ->assertJsonPath('application.title', 'Updated title');

        $this->assertSame(1, JobApplication::query()->where('user_id', $user->id)->count());
    }

    public function test_extension_can_list_job_applications(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;
        JobApplication::factory()->for($user)->count(2)->create();

        $this->withToken($token)
            ->getJson('/api/applications')
            ->assertOk()
            ->assertJsonCount(2, 'applications');
    }

    public function test_extension_can_update_application_status(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;
        $application = JobApplication::factory()->for($user)->create();

        $this->withToken($token)
            ->patchJson("/api/applications/{$application->id}", [
                'status' => 'interview',
            ])
            ->assertOk()
            ->assertJsonPath('application.status', 'interview');
    }
}
