<?php

namespace App\Services;

use App\Models\CvProfile;

class ApplicationFieldInventoryService
{
    public function __construct(
        private readonly NanoGptService $nanoGpt,
    ) {}

    /**
     * @param  array<string, mixed>  $job
     * @param  array<string, mixed>  $snapshot
     * @param  array<string, mixed>  $settings
     * @return array{
     *     fields: array<int, array{ref: string, question: string, field_type: string, max_chars?: int|null, options?: array<int, string>|null}>,
     *     complete: bool,
     *     next_actions: array<int, array{ref: string, reason: string}>,
     * }|null
     */
    public function resolveFields(CvProfile $profile, array $job, array $snapshot, array $settings = []): ?array
    {
        $elements = $this->normalizeSnapshotElements($snapshot['elements'] ?? []);

        if ($elements === []) {
            return [
                'fields' => [],
                'complete' => true,
                'next_actions' => [],
            ];
        }

        $controls = $this->normalizeControls($snapshot['controls'] ?? []);
        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => $this->systemPrompt($profile, $settings),
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'job' => $job,
                    'page_title' => $snapshot['page_title'] ?? null,
                    'page_url' => $snapshot['page_url'] ?? null,
                    'elements' => $elements,
                    'controls' => $controls,
                    'instructions' => 'Return JSON: {"fields":[{"ref":"exact ref","question":"string","field_type":"text|textarea|radio|checkbox|select","max_chars":number|null,"options":["..."]|null}],"complete":boolean,"next_actions":[{"ref":"control ref","reason":"string"}]}. '
                        .'Include every element that is an unanswered application question the candidate still needs to answer. '
                        .'Use the exact ref from elements or controls — never invent refs. '
                        .'Improve question text when context helps, but keep the same ref. '
                        .'Merge duplicate questions only if they truly refer to the same control ref. '
                        .'Set complete to false when controls suggest hidden steps (Continue, Next, Save and continue) and required questions may still be off-screen. '
                        .'Put up to 2 control refs in next_actions when complete is false. '
                        .'Omit file upload fields. For radio/select/checkbox, preserve options exactly from the snapshot.',
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0.2,
        ]);

        if ($payload === null) {
            return null;
        }

        return $this->normalizeInventoryPayload($payload, $elements, $controls);
    }

    /**
     * @param  array<int, mixed>  $rawElements
     * @return array<int, array{ref: string, question: string, field_type: string, max_chars?: int|null, options?: array<int, string>|null, required?: bool, context?: string|null}>
     */
    private function normalizeSnapshotElements(array $rawElements): array
    {
        $elements = [];

        foreach ($rawElements as $element) {
            if (! is_array($element) || ! isset($element['ref'], $element['question'])) {
                continue;
            }

            $ref = trim((string) $element['ref']);
            $question = trim((string) $element['question']);

            if ($ref === '' || $question === '') {
                continue;
            }

            $elements[] = [
                'ref' => $ref,
                'question' => $question,
                'field_type' => trim((string) ($element['field_type'] ?? 'text')),
                'max_chars' => isset($element['max_chars']) ? (int) $element['max_chars'] : null,
                'options' => $this->normalizeOptions($element['options'] ?? null),
                'required' => (bool) ($element['required'] ?? false),
                'context' => isset($element['context']) && is_string($element['context'])
                    ? trim($element['context'])
                    : null,
            ];
        }

        return $elements;
    }

    /**
     * @param  array<int, mixed>  $rawControls
     * @return array<int, array{ref: string, name: string, role?: string|null}>
     */
    private function normalizeControls(array $rawControls): array
    {
        $controls = [];

        foreach ($rawControls as $control) {
            if (! is_array($control) || ! isset($control['ref'], $control['name'])) {
                continue;
            }

            $ref = trim((string) $control['ref']);
            $name = trim((string) $control['name']);

            if ($ref === '' || $name === '') {
                continue;
            }

            $controls[] = [
                'ref' => $ref,
                'name' => $name,
                'role' => isset($control['role']) ? (string) $control['role'] : null,
            ];
        }

        return $controls;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, array{ref: string, question: string, field_type: string, max_chars?: int|null, options?: array<int, string>|null, required?: bool, context?: string|null}>  $elements
     * @param  array<int, array{ref: string, name: string, role?: string|null}>  $controls
     * @return array{
     *     fields: array<int, array{ref: string, question: string, field_type: string, max_chars?: int|null, options?: array<int, string>|null}>,
     *     complete: bool,
     *     next_actions: array<int, array{ref: string, reason: string}>,
     * }
     */
    private function normalizeInventoryPayload(array $payload, array $elements, array $controls): array
    {
        $elementByRef = collect($elements)->keyBy('ref');
        $controlRefs = collect($controls)->pluck('ref')->all();
        $fields = [];

        foreach ($payload['fields'] ?? [] as $row) {
            if (! is_array($row) || ! isset($row['ref'])) {
                continue;
            }

            $ref = trim((string) $row['ref']);
            $source = $elementByRef->get($ref);

            if ($source === null) {
                continue;
            }

            $question = isset($row['question']) && is_string($row['question']) && trim($row['question']) !== ''
                ? trim($row['question'])
                : $source['question'];

            $fields[] = [
                'ref' => $ref,
                'question' => $question,
                'field_type' => isset($row['field_type']) && is_string($row['field_type'])
                    ? trim($row['field_type'])
                    : $source['field_type'],
                'max_chars' => isset($row['max_chars']) ? (int) $row['max_chars'] : $source['max_chars'],
                'options' => $this->normalizeOptions($row['options'] ?? $source['options']),
            ];
        }

        if ($fields === []) {
            return null;
        }

        $nextActions = [];

        foreach ($payload['next_actions'] ?? [] as $action) {
            if (! is_array($action) || ! isset($action['ref'])) {
                continue;
            }

            $ref = trim((string) $action['ref']);

            if (! in_array($ref, $controlRefs, true)) {
                continue;
            }

            $nextActions[] = [
                'ref' => $ref,
                'reason' => isset($action['reason']) && is_string($action['reason'])
                    ? trim($action['reason'])
                    : 'Reveal the next section of the form.',
            ];
        }

        return [
            'fields' => array_values($fields),
            'complete' => (bool) ($payload['complete'] ?? true),
            'next_actions' => array_slice($nextActions, 0, 2),
        ];
    }

    /**
     * @return array<int, string>|null
     */
    private function normalizeOptions(mixed $options): ?array
    {
        if (! is_array($options)) {
            return null;
        }

        $normalized = [];

        foreach ($options as $option) {
            if (! is_string($option)) {
                continue;
            }

            $text = trim($option);

            if ($text !== '') {
                $normalized[] = $text;
            }
        }

        return $normalized === [] ? null : array_values($normalized);
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    private function systemPrompt(CvProfile $profile, array $settings): string
    {
        unset($profile, $settings);

        return 'You inventory unanswered job application form fields from a browser snapshot. '
            .'Return strict JSON only. Never invent form fields or refs that are not in the snapshot.';
    }
}
