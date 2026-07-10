<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class FormCorpusInventoryOracleService
{
    private const SYSTEM_PROMPT = 'You extract fillable job-application form fields from HTML only. '
        .'Return JSON only: {"fields":[{"question":string,"field_type":string,"required":boolean,"options":string[]|null}],"notes":string}. '
        .'Include every meaningful candidate input: name, email, phone, location, resume/CV file upload, '
        .'LinkedIn/portfolio URLs, pronouns, screening questions, selects, radios, checkboxes, textareas. '
        .'field_type must be one of: text, email, tel, url, number, date, textarea, select, radio, checkbox, file, combobox, other. '
        .'Do not invent fields that are not present. Ignore nav, footer, cookie banners, search boxes, and honeypots. '
        .'Resume/CV file inputs count as fields. options is null unless the control has visible choices. '
        .'notes is a short string about ambiguity or SPA widgets that may be incomplete in static HTML.';

    public function __construct(private readonly NanoGptService $nanoGpt) {}

    public function model(): string
    {
        return (string) config('cv.form_corpus_inventory_oracle_model');
    }

    /**
     * @param  array{
     *     url: string,
     *     page_title?: string|null,
     *     html_excerpt: string,
     * }  $payload
     * @return array{
     *     fields: list<array{question: string, field_type: string, required: bool, options: list<string>|null}>,
     *     notes: string,
     *     model?: string,
     *     error?: string,
     * }
     */
    public function extract(array $payload): array
    {
        $url = trim((string) ($payload['url'] ?? ''));
        $htmlExcerpt = trim((string) ($payload['html_excerpt'] ?? ''));

        if ($url === '') {
            return $this->failure('Missing url in inventory oracle payload.');
        }

        if ($htmlExcerpt === '') {
            return $this->failure('Missing html_excerpt in inventory oracle payload.');
        }

        $userPayload = [
            'url' => $url,
            'page_title' => $payload['page_title'] ?? null,
            'html_excerpt' => $htmlExcerpt,
        ];

        $response = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => self::SYSTEM_PROMPT,
            ],
            [
                'role' => 'user',
                'content' => json_encode($userPayload, JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => $this->model(),
            'temperature' => 0.1,
            'timeout' => (int) config('cv.form_corpus_inventory_oracle_timeout', 60),
        ]);

        if ($response === null) {
            Log::warning('FormCorpusInventoryOracleService: NanoGPT returned no JSON.', [
                'url' => $url,
            ]);

            return $this->failure('NanoGPT inventory oracle call failed.');
        }

        return $this->normalizeResult($response, $this->model());
    }

    /**
     * @param  array<string, mixed>  $response
     * @return array{
     *     fields: list<array{question: string, field_type: string, required: bool, options: list<string>|null}>,
     *     notes: string,
     *     model?: string,
     * }
     */
    public function normalizeResult(array $response, ?string $model = null): array
    {
        $fields = [];

        foreach ($response['fields'] ?? [] as $row) {
            if (! is_array($row)) {
                continue;
            }

            $question = trim((string) ($row['question'] ?? ''));

            if ($question === '') {
                continue;
            }

            $fieldType = strtolower(trim((string) ($row['field_type'] ?? 'text')));

            if ($fieldType === '') {
                $fieldType = 'text';
            }

            $options = null;

            if (array_key_exists('options', $row) && is_array($row['options'])) {
                $normalizedOptions = collect($row['options'])
                    ->filter(fn (mixed $option): bool => is_string($option) && trim($option) !== '')
                    ->map(fn (string $option): string => trim($option))
                    ->values()
                    ->all();

                $options = $normalizedOptions === [] ? null : $normalizedOptions;
            }

            $fields[] = [
                'question' => $question,
                'field_type' => $fieldType,
                'required' => (bool) ($row['required'] ?? false),
                'options' => $options,
            ];
        }

        $notes = trim((string) ($response['notes'] ?? ''));

        $normalized = [
            'fields' => $fields,
            'notes' => $notes,
        ];

        if (is_string($model) && $model !== '') {
            $normalized['model'] = $model;
        }

        return $normalized;
    }

    /**
     * @return array{
     *     fields: list<array{question: string, field_type: string, required: bool, options: list<string>|null}>,
     *     notes: string,
     *     error: string,
     * }
     */
    private function failure(string $message): array
    {
        return [
            'fields' => [],
            'notes' => '',
            'error' => $message,
        ];
    }
}
