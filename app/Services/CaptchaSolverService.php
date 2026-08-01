<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use RuntimeException;

class CaptchaSolverService
{
    public const TYPE_RECAPTCHA_V2 = 'recaptcha_v2';

    public const TYPE_HCAPTCHA = 'hcaptcha';

    public const TYPE_TURNSTILE = 'turnstile';

    /**
     * @var array<string, string>
     */
    private const TASK_TYPES = [
        self::TYPE_RECAPTCHA_V2 => 'RecaptchaV2TaskProxyless',
        self::TYPE_HCAPTCHA => 'HCaptchaTaskProxyless',
        self::TYPE_TURNSTILE => 'TurnstileTaskProxyless',
    ];

    /**
     * Solve a widget captcha. Tries AntiCaptcha first, then 2Captcha.
     *
     * @param  self::TYPE_*  $type
     * @return array{token: string, provider: string}
     */
    public function solve(string $type, string $sitekey, string $pageUrl): array
    {
        if (! isset(self::TASK_TYPES[$type])) {
            throw new InvalidArgumentException("Unsupported captcha type: {$type}");
        }

        $taskType = self::TASK_TYPES[$type];
        $errors = [];

        if ($this->anticaptchaKey() !== '') {
            try {
                return [
                    'token' => $this->solveWithAntiCaptcha($taskType, $sitekey, $pageUrl),
                    'provider' => 'anticaptcha',
                ];
            } catch (RuntimeException $exception) {
                $errors[] = 'anticaptcha: '.$exception->getMessage();
            }
        }

        if ($this->twocaptchaKey() !== '') {
            try {
                return [
                    'token' => $this->solveWithTwoCaptcha($taskType, $sitekey, $pageUrl),
                    'provider' => 'twocaptcha',
                ];
            } catch (RuntimeException $exception) {
                $errors[] = 'twocaptcha: '.$exception->getMessage();
            }
        }

        if ($errors === []) {
            throw new RuntimeException('No captcha solver API keys are configured.');
        }

        throw new RuntimeException(implode(' | ', $errors));
    }

    private function anticaptchaKey(): string
    {
        return trim((string) config('services.anticaptcha.key', ''));
    }

    private function twocaptchaKey(): string
    {
        return trim((string) config('services.twocaptcha.key', ''));
    }

    private function solveWithAntiCaptcha(string $taskType, string $sitekey, string $pageUrl): string
    {
        return $this->solveWithJsonApi(
            providerLabel: 'AntiCaptcha',
            baseUrl: rtrim((string) config('services.anticaptcha.base_url'), '/'),
            clientKey: $this->anticaptchaKey(),
            timeout: max(30, (int) config('services.anticaptcha.timeout', 120)),
            taskType: $taskType,
            sitekey: $sitekey,
            pageUrl: $pageUrl,
        );
    }

    private function solveWithTwoCaptcha(string $taskType, string $sitekey, string $pageUrl): string
    {
        return $this->solveWithJsonApi(
            providerLabel: '2Captcha',
            baseUrl: rtrim((string) config('services.twocaptcha.base_url'), '/'),
            clientKey: $this->twocaptchaKey(),
            timeout: max(30, (int) config('services.twocaptcha.timeout', 120)),
            taskType: $taskType,
            sitekey: $sitekey,
            pageUrl: $pageUrl,
        );
    }

    private function solveWithJsonApi(
        string $providerLabel,
        string $baseUrl,
        string $clientKey,
        int $timeout,
        string $taskType,
        string $sitekey,
        string $pageUrl,
    ): string {
        $task = [
            'type' => $taskType,
            'websiteURL' => $pageUrl,
            'websiteKey' => $sitekey,
        ];

        // AntiCaptcha hCaptcha / Turnstile workers expect a browser UA for session emulation.
        if (in_array($taskType, ['HCaptchaTaskProxyless', 'TurnstileTaskProxyless'], true)) {
            $task['userAgent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
        }

        $create = Http::timeout(30)
            ->acceptJson()
            ->post("{$baseUrl}/createTask", [
                'clientKey' => $clientKey,
                'task' => $task,
            ]);

        if (! $create->successful()) {
            throw new RuntimeException("{$providerLabel} createTask HTTP ".$create->status());
        }

        $createJson = $create->json();
        $errorId = (int) ($createJson['errorId'] ?? 1);

        if ($errorId !== 0) {
            throw new RuntimeException((string) ($createJson['errorDescription'] ?? $createJson['errorCode'] ?? 'createTask failed'));
        }

        $taskId = $createJson['taskId'] ?? null;

        if (! $taskId) {
            throw new RuntimeException("{$providerLabel} did not return a taskId.");
        }

        $maxPolls = max(1, (int) ceil($timeout / 3));

        for ($poll = 0; $poll < $maxPolls; $poll++) {
            if ($poll > 0) {
                $this->waitBetweenPolls();
            }

            $result = Http::timeout(30)
                ->acceptJson()
                ->post("{$baseUrl}/getTaskResult", [
                    'clientKey' => $clientKey,
                    'taskId' => $taskId,
                ]);

            if (! $result->successful()) {
                throw new RuntimeException("{$providerLabel} getTaskResult HTTP ".$result->status());
            }

            $resultJson = $result->json();
            $resultErrorId = (int) ($resultJson['errorId'] ?? 1);

            if ($resultErrorId !== 0) {
                throw new RuntimeException((string) ($resultJson['errorDescription'] ?? $resultJson['errorCode'] ?? 'getTaskResult failed'));
            }

            $status = (string) ($resultJson['status'] ?? '');

            if ($status === 'processing') {
                continue;
            }

            if ($status === 'ready') {
                $token = $this->extractSolutionToken($resultJson['solution'] ?? null);

                if ($token === '') {
                    throw new RuntimeException("{$providerLabel} returned an empty token.");
                }

                return $token;
            }

            throw new RuntimeException("{$providerLabel} unexpected status: {$status}");
        }

        throw new RuntimeException("{$providerLabel} timed out waiting for a solution.");
    }

    private function extractSolutionToken(mixed $solution): string
    {
        if (! is_array($solution)) {
            return '';
        }

        foreach (['gRecaptchaResponse', 'token', 'response'] as $key) {
            $value = trim((string) ($solution[$key] ?? ''));

            if ($value !== '') {
                return $value;
            }
        }

        return '';
    }

    private function waitBetweenPolls(): void
    {
        if (app()->environment('testing')) {
            return;
        }

        sleep(3);
    }
}
