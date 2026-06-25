<?php

namespace App\Services;

use App\Support\CvExtractionSchema;
use Illuminate\Support\Facades\Log;

class CvExtractionService
{
    public function __construct(private readonly NanoGptService $nanoGpt) {}

    /**
     * @param  array<int, string>  $extractedUrls
     * @return array<string, mixed>|null
     */
    public function extract(string $rawText, string $filename, array $extractedUrls = []): ?array
    {
        $trimmed = trim($rawText);

        if ($trimmed === '') {
            return null;
        }

        $maxChars = (int) config('cv.max_raw_text_chars', 32000);
        $truncated = mb_strlen($trimmed) > $maxChars
            ? mb_substr($trimmed, 0, $maxChars)."\n\n[Text truncated for processing - end of CV may be missing from source extract.]"
            : $trimmed;

        $promptParts = CvExtractionSchema::userPrompt($truncated, $filename);

        $result = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => CvExtractionSchema::systemPrompt(),
            ],
            [
                'role' => 'user',
                'content' => <<<PROMPT
Parse this CV file ({$promptParts['filename']}).

Return JSON matching this schema exactly:
{$promptParts['schema']}

The raw text below may be incomplete, out of order, or garbled from PDF/Word/image extraction. Reconstruct faithfully in formatted_cv_text and structured fields. Do not invent facts.

--- RAW CV TEXT START ---
{$promptParts['raw_text']}
--- RAW CV TEXT END ---
PROMPT,
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.1,
            'timeout' => (int) config('cv.extraction_timeout', 180),
        ]);

        if ($result === null) {
            Log::warning('CvExtractionService: NanoGPT returned no parse result.', [
                'filename' => $filename,
                'raw_length' => mb_strlen($trimmed),
            ]);

            return null;
        }

        unset($result['_tokens_used']);

        return CvExtractionSchema::normalize($result, $extractedUrls);
    }
}
