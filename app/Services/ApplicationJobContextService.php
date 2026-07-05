<?php

namespace App\Services;

class ApplicationJobContextService
{
    public function __construct(
        private readonly NanoGptService $nanoGpt,
    ) {}

    /**
     * @return array{
     *     title: string|null,
     *     company: string|null,
     *     location: string|null,
     *     job_description: string|null,
     *     source: string|null,
     * }|null
     */
    public function extractFromPage(string $pageTitle, string $pageUrl, string $pageText): ?array
    {
        $pageText = trim($pageText);

        if ($pageTitle === '' && $pageUrl === '' && $pageText === '') {
            return null;
        }

        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => 'Extract job posting context from a browser page for a job application assistant. '
                    .'Return JSON only: {"title":"string|null","company":"string|null","location":"string|null","job_description":"string|null","source":"string|null"}. '
                    .'Use the page title, URL, and visible text. Return null for unknown fields - do not invent employers, titles, or requirements. '
                    .'job_description should summarize the posting when enough text is present, otherwise null. '
                    .'source is a short label such as "company careers site" or "job board" when inferable.',
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'page_title' => mb_substr(trim($pageTitle), 0, 500),
                    'page_url' => mb_substr(trim($pageUrl), 0, 2048),
                    'page_text' => mb_substr($pageText, 0, 20000),
                ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE),
            ],
        ], [
            'model' => config('cv.job_context_model'),
            'temperature' => 0.2,
        ]);

        if ($payload === null || ! is_array($payload)) {
            return null;
        }

        return [
            'title' => $this->nullableString($payload['title'] ?? null),
            'company' => $this->nullableString($payload['company'] ?? null),
            'location' => $this->nullableString($payload['location'] ?? null),
            'job_description' => $this->nullableString($payload['job_description'] ?? null),
            'source' => $this->nullableString($payload['source'] ?? null),
        ];
    }

    private function nullableString(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
