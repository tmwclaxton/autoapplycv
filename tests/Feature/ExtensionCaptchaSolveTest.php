<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ExtensionCaptchaSolveTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->postJson('/api/extension/captcha/solve', [
            'type' => 'recaptcha_v2',
            'sitekey' => 'test-sitekey',
            'page_url' => 'https://www.indeed.com/viewjob',
        ])->assertUnauthorized();
    }

    public function test_solve_fails_clearly_when_no_keys_configured(): void
    {
        config([
            'services.anticaptcha.key' => '',
            'services.twocaptcha.key' => '',
        ]);

        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/captcha/solve', [
                'type' => 'recaptcha_v2',
                'sitekey' => 'test-sitekey',
                'page_url' => 'https://www.indeed.com/viewjob',
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error', 'No captcha solver API keys are configured.');
    }

    public function test_solve_returns_token_from_anticaptcha(): void
    {
        config([
            'services.anticaptcha.key' => 'anti-key',
            'services.twocaptcha.key' => '',
            'services.anticaptcha.timeout' => 30,
        ]);

        Http::fake([
            'api.anti-captcha.com/createTask' => Http::response([
                'errorId' => 0,
                'taskId' => 99,
            ]),
            'api.anti-captcha.com/getTaskResult' => Http::sequence()
                ->push(['errorId' => 0, 'status' => 'processing'])
                ->push([
                    'errorId' => 0,
                    'status' => 'ready',
                    'solution' => ['gRecaptchaResponse' => 'solved-token'],
                ]),
        ]);

        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/captcha/solve', [
                'type' => 'recaptcha_v2',
                'sitekey' => 'test-sitekey',
                'page_url' => 'https://www.indeed.com/viewjob',
            ])
            ->assertOk()
            ->assertJson([
                'success' => true,
                'token' => 'solved-token',
                'provider' => 'anticaptcha',
            ]);
    }

    public function test_solve_falls_back_to_twocaptcha_when_anticaptcha_fails(): void
    {
        config([
            'services.anticaptcha.key' => 'anti-key',
            'services.twocaptcha.key' => 'two-key',
            'services.anticaptcha.timeout' => 30,
            'services.twocaptcha.timeout' => 30,
        ]);

        Http::fake([
            'api.anti-captcha.com/createTask' => Http::response([
                'errorId' => 1,
                'errorDescription' => 'ERROR_KEY_DOES_NOT_EXIST',
            ]),
            'api.2captcha.com/createTask' => Http::response([
                'errorId' => 0,
                'taskId' => 42,
            ]),
            'api.2captcha.com/getTaskResult' => Http::response([
                'errorId' => 0,
                'status' => 'ready',
                'solution' => ['gRecaptchaResponse' => 'two-token'],
            ]),
        ]);

        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/captcha/solve', [
                'type' => 'recaptcha_v2',
                'sitekey' => 'test-sitekey',
                'page_url' => 'https://www.indeed.com/viewjob',
            ])
            ->assertOk()
            ->assertJson([
                'success' => true,
                'token' => 'two-token',
                'provider' => 'twocaptcha',
            ]);
    }
}
