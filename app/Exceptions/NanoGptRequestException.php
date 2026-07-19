<?php

namespace App\Exceptions;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use RuntimeException;
use Throwable;

class NanoGptRequestException extends RuntimeException
{
    public const CODE_TIMEOUT = 'nanogpt_timeout';

    public const CODE_UNAVAILABLE = 'nanogpt_unavailable';

    public function __construct(
        string $message,
        public readonly int $statusCode,
        public readonly string $errorCode,
        public readonly ?int $providerStatus = null,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, $statusCode, $previous);
    }

    public static function fromTimeout(ConnectionException $exception, int $timeoutSeconds): self
    {
        return new self(
            message: "AI request timed out after {$timeoutSeconds}s. Please try again shortly.",
            statusCode: 504,
            errorCode: self::CODE_TIMEOUT,
            previous: $exception,
        );
    }

    public static function fromResponse(Response $response): self
    {
        $providerStatus = $response->status();

        $message = match (true) {
            $providerStatus === 429 => 'AI is rate limited right now. Please try again shortly.',
            $providerStatus >= 500 => 'AI is temporarily unavailable. Please try again shortly.',
            default => 'AI request failed. Please try again shortly.',
        };

        return new self(
            message: $message,
            statusCode: 503,
            errorCode: self::CODE_UNAVAILABLE,
            providerStatus: $providerStatus,
        );
    }

    public static function fromThrowable(Throwable $exception, int $timeoutSeconds = 0): self
    {
        if ($exception instanceof self) {
            return $exception;
        }

        if ($exception instanceof ConnectionException) {
            return self::fromTimeout($exception, max(1, $timeoutSeconds));
        }

        return new self(
            message: 'AI request failed. Please try again shortly.',
            statusCode: 503,
            errorCode: self::CODE_UNAVAILABLE,
            previous: $exception,
        );
    }

    /**
     * @return array{success: false, error: string, code: string, provider_status?: int}
     */
    public function toApiPayload(): array
    {
        $payload = [
            'success' => false,
            'error' => $this->getMessage(),
            'code' => $this->errorCode,
        ];

        if ($this->providerStatus !== null) {
            $payload['provider_status'] = $this->providerStatus;
        }

        return $payload;
    }
}
