<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class CaptchaSolverService
{
    /**
     * Solve a reCAPTCHA v2 challenge. Tries AntiCaptcha first, then 2Captcha.
     *
     * @return array{token: string, provider: string}
     */
    public function solveRecaptchaV2(string $sitekey, string $pageUrl): array
    {
        $errors = [];

        if ($this->anticaptchaKey() !== '') {
            try {
                return [
                    'token' => $this->solveWithAntiCaptcha($sitekey, $pageUrl),
                    'provider' => 'anticaptcha',
                ];
            } catch (RuntimeException $exception) {
                $errors[] = 'anticaptcha: '.$exception->getMessage();
            }
        }

        if ($this->twocaptchaKey() !== '') {
            try {
                return [
                    'token' => $this->solveWithTwoCaptcha($sitekey, $pageUrl),
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

    private function solveWithAntiCaptcha(string $sitekey, string $pageUrl): string
    {
        return $this->solveWithJsonApi(
            providerLabel: 'AntiCaptcha',
            baseUrl: rtrim((string) config('services.anticaptcha.base_url'), '/'),
            clientKey: $this->anticaptchaKey(),
            timeout: max(30, (int) config('services.anticaptcha.timeout', 120)),
            sitekey: $sitekey,
            pageUrl: $pageUrl,
        );
    }

    private function solveWithTwoCaptcha(string $sitekey, string $pageUrl): string
    {
        return $this->solveWithJsonApi(
            providerLabel: '2Captcha',
            baseUrl: rtrim((string) config('services.twocaptcha.base_url'), '/'),
            clientKey: $this->twocaptchaKey(),
            timeout: max(30, (int) config('services.twocaptcha.timeout', 120)),
            sitekey: $sitekey,
            pageUrl: $pageUrl,
        );
    }

    private function solveWithJsonApi(
        string $providerLabel,
        string $baseUrl,
        string $clientKey,
        int $timeout,
        string $sitekey,
        string $pageUrl,
    ): string {
        $create = Http::timeout(30)
            ->acceptJson()
            ->post("{$baseUrl}/createTask", [
                'clientKey' => $clientKey,
                'task' => [
                    'type' => 'RecaptchaV2TaskProxyless',
                    'websiteURL' => $pageUrl,
                    'websiteKey' => $sitekey,
                ],
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
                $token = (string) ($resultJson['solution']['gRecaptchaResponse'] ?? '');

                if ($token === '') {
                    throw new RuntimeException("{$providerLabel} returned an empty token.");
                }

                return $token;
            }

            throw new RuntimeException("{$providerLabel} unexpected status: {$status}");
        }

        throw new RuntimeException("{$providerLabel} timed out waiting for a solution.");
    }

    private function waitBetweenPolls(): void
    {
        if (app()->environment('testing')) {
            return;
        }

        sleep(3);
    }
}
