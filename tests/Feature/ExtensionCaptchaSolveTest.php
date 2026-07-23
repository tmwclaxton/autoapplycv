<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
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

    public function test_solve_rejects_unsupported_type(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/captcha/solve', [
                'type' => 'funcaptcha',
                'sitekey' => 'test-sitekey',
                'page_url' => 'https://www.indeed.com/viewjob',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['type']);
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: string, 3: string}>
     */
    public static function solvableTypeProvider(): array
    {
        return [
            'recaptcha_v2' => [
                'recaptcha_v2',
                'RecaptchaV2TaskProxyless',
                'gRecaptchaResponse',
                'solved-recaptcha-token',
            ],
            'hcaptcha' => [
                'hcaptcha',
                'HCaptchaTaskProxyless',
                'gRecaptchaResponse',
                'solved-hcaptcha-token',
            ],
            'turnstile' => [
                'turnstile',
                'TurnstileTaskProxyless',
                'token',
                'solved-turnstile-token',
            ],
        ];
    }

    #[DataProvider('solvableTypeProvider')]
    public function test_solve_returns_token_from_anticaptcha_for_each_type(
        string $type,
        string $expectedTaskType,
        string $solutionKey,
        string $expectedToken,
    ): void {
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
                    'solution' => [$solutionKey => $expectedToken],
                ]),
        ]);

        $user = User::factory()->create();
        $token = $user->createToken('extension')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/extension/captcha/solve', [
                'type' => $type,
                'sitekey' => 'test-sitekey',
                'page_url' => 'https://www.indeed.com/viewjob',
            ])
            ->assertOk()
            ->assertJson([
                'success' => true,
                'token' => $expectedToken,
                'provider' => 'anticaptcha',
            ]);

        Http::assertSent(function (Request $request) use ($expectedTaskType) {
            if (! str_ends_with($request->url(), '/createTask')) {
                return false;
            }

            $payload = $request->data();

            return ($payload['task']['type'] ?? null) === $expectedTaskType
                && ($payload['task']['websiteKey'] ?? null) === 'test-sitekey'
                && ($payload['task']['websiteURL'] ?? null) === 'https://www.indeed.com/viewjob';
        });
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
                'type' => 'hcaptcha',
                'sitekey' => 'test-sitekey',
                'page_url' => 'https://www.indeed.com/viewjob',
            ])
            ->assertOk()
            ->assertJson([
                'success' => true,
                'token' => 'two-token',
                'provider' => 'twocaptcha',
            ]);

        Http::assertSent(function (Request $request) {
            if (! str_contains($request->url(), 'api.2captcha.com/createTask')) {
                return false;
            }

            return ($request->data()['task']['type'] ?? null) === 'HCaptchaTaskProxyless';
        });
    }
}
