<?php

namespace App\Services;

use App\Support\CvExtractionSchema;
use App\Support\CvFormattedTextBuilder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

class CvExtractionService
{
    public function __construct(private readonly NanoGptService $nanoGpt) {}

    /**
     * @param  array<int, string>  $extractedUrls
     * @return array{data: array<string, mixed>|null, usage: array<string, mixed>|null}
     */
    public function extractWithUsage(
        string $rawText,
        string $filename,
        array $extractedUrls = [],
        bool $ocrUsed = false,
        ?string $contentHash = null,
    ): array {
        $trimmed = trim($rawText);

        if ($trimmed === '') {
            return [
                'data' => null,
                'usage' => null,
            ];
        }

        $model = $this->resolveExtractionModel($ocrUsed);
        $cacheKey = $this->cacheKey($contentHash, $trimmed, $model);

        if ($cacheKey !== null) {
            $cached = $this->readCache($cacheKey);

            if ($cached !== null) {
                return [
                    'data' => $this->finalizeParsed($cached['data'], $trimmed, $extractedUrls, $ocrUsed),
                    'usage' => is_array($cached['usage'] ?? null) ? $cached['usage'] : null,
                ];
            }
        }

        $maxChars = (int) config('cv.max_raw_text_chars', 32000);
        $truncated = mb_strlen($trimmed) > $maxChars
            ? mb_substr($trimmed, 0, $maxChars)."\n\n[Text truncated for processing - end of CV may be missing from source extract.]"
            : $trimmed;

        $result = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => CvExtractionSchema::parseSystemPrompt(),
            ],
            [
                'role' => 'user',
                'content' => CvExtractionSchema::parseUserMessage($truncated, $filename),
            ],
        ], [
            'model' => $model,
            'temperature' => 0.1,
            'timeout' => (int) config('cv.extraction_timeout', 180),
        ]);

        if ($result === null) {
            Log::warning('CvExtractionService: NanoGPT returned no parse result.', [
                'filename' => $filename,
                'raw_length' => mb_strlen($trimmed),
            ]);

            return [
                'data' => null,
                'usage' => null,
            ];
        }

        $usage = is_array($result['_usage'] ?? null) ? $result['_usage'] : null;
        unset($result['_usage'], $result['_tokens_used']);

        $normalized = CvExtractionSchema::normalize($result, $extractedUrls);
        $finalized = $this->finalizeParsed($normalized, $trimmed, $extractedUrls, $ocrUsed);

        if ($cacheKey !== null) {
            $this->writeCache($cacheKey, [
                'data' => $finalized,
                'usage' => $usage,
            ]);
        }

        return [
            'data' => $finalized,
            'usage' => $usage,
        ];
    }

    /**
     * @param  array<int, string>  $extractedUrls
     * @return array<string, mixed>|null
     */
    public function extract(
        string $rawText,
        string $filename,
        array $extractedUrls = [],
        bool $ocrUsed = false,
        ?string $contentHash = null,
    ): ?array {
        return $this->extractWithUsage($rawText, $filename, $extractedUrls, $ocrUsed, $contentHash)['data'];
    }

    /**
     * @param  array<string, mixed>  $parsed
     * @param  array<int, string>  $extractedUrls
     * @return array<string, mixed>
     */
    private function finalizeParsed(array $parsed, string $rawText, array $extractedUrls, bool $ocrUsed): array
    {
        $parsed['formatted_cv_text'] = CvFormattedTextBuilder::fromExtraction($rawText, $parsed, $ocrUsed);

        if (blank($parsed['extra_context'] ?? null)) {
            $parsed['extra_context'] = CvExtractionSchema::buildExtraContextForParsed($parsed);
        }

        return $parsed;
    }

    /**
     * @return array{data: array<string, mixed>, usage: array<string, mixed>|null}|null
     */
    private function readCache(string $cacheKey): ?array
    {
        try {
            $cached = Cache::get($cacheKey);
        } catch (Throwable $exception) {
            Log::debug('CvExtractionService: cache read skipped.', [
                'key' => $cacheKey,
                'message' => $exception->getMessage(),
            ]);

            return null;
        }

        if (! is_array($cached) || ! is_array($cached['data'] ?? null)) {
            return null;
        }

        return $cached;
    }

    /**
     * @param  array{data: array<string, mixed>, usage: array<string, mixed>|null}  $payload
     */
    private function writeCache(string $cacheKey, array $payload): void
    {
        try {
            Cache::put($cacheKey, $payload, now()->addSeconds((int) config('cv.extraction_cache_ttl', 86400)));
        } catch (Throwable $exception) {
            Log::debug('CvExtractionService: cache write skipped.', [
                'key' => $cacheKey,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    public function resolveExtractionModel(bool $ocrUsed): string
    {
        $model = (string) config($ocrUsed ? 'cv.extraction_model_ocr' : 'cv.extraction_model');

        if ($model !== '') {
            return $model;
        }

        return (string) config('cv.extraction_model');
    }

    private function cacheKey(?string $contentHash, string $rawText, string $model): ?string
    {
        $hash = $contentHash ?? hash('sha256', $rawText);

        if ($hash === '' || $model === '') {
            return null;
        }

        return 'cv-extraction:'.hash('sha256', $hash.'|'.$model);
    }
}
