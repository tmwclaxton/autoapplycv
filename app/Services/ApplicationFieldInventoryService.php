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
     *     source: 'mechanical'|'llm',
     *     usage?: array{prompt_tokens: int, completion_tokens: int, total_tokens: int, model: string},
     * }|null
     */
    public function resolveFields(CvProfile $profile, array $job, array $snapshot, array $settings = []): ?array
    {
        unset($profile);

        $elements = $this->normalizeSnapshotElements($snapshot['elements'] ?? []);

        if ($elements === []) {
            return [
                'fields' => [],
                'complete' => true,
                'next_actions' => [],
                'source' => 'mechanical',
            ];
        }

        $controls = $this->filterNavigationControls($this->normalizeControls($snapshot['controls'] ?? []));
        $mechanicalFields = $this->buildMechanicalFields($elements);

        if ($this->canUseMechanicalInventory($snapshot, $mechanicalFields, $controls)) {
            return [
                'fields' => $mechanicalFields,
                'complete' => true,
                'next_actions' => [],
                'source' => 'mechanical',
            ];
        }

        $userPayload = [
            'job' => $job,
            'page_title' => $snapshot['page_title'] ?? null,
            'page_url' => $snapshot['page_url'] ?? null,
            'elements' => $elements,
            'instructions' => 'Return JSON: {"fields":[{"ref":"exact ref","question":"string","field_type":"text|textarea|radio|checkbox|select","max_chars":number|null,"options":["..."]|null}],"complete":true,"next_actions":[]}. '
                .'Inventory only the application questions visible in this snapshot — do not assume hidden wizard steps or off-screen pages. '
                .'Include every element that is an unanswered application question the candidate still needs to answer. '
                .'Use the exact ref from elements — never invent refs. '
                .'Improve question text when context helps, but keep the same ref. '
                .'Merge duplicate questions only if they truly refer to the same control ref. '
                .'Always set complete to true and return an empty next_actions array. '
                .'Omit file upload fields. For radio/select/checkbox, preserve options exactly from the snapshot.',
        ];

        if ($controls !== []) {
            $userPayload['controls'] = $controls;
        }

        $model = (string) config('cv.inventory_model');
        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => $this->systemPrompt($settings),
            ],
            [
                'role' => 'user',
                'content' => json_encode($userPayload, JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => $model,
            'temperature' => 0.2,
        ]);

        if ($payload === null) {
            return null;
        }

        $normalized = $this->normalizeInventoryPayload($payload, $elements);

        if ($normalized === null) {
            return null;
        }

        $usage = is_array($payload['_usage'] ?? null) ? $payload['_usage'] : null;

        return [
            ...$normalized,
            'source' => 'llm',
            'usage' => $usage ?? [
                'prompt_tokens' => 0,
                'completion_tokens' => 0,
                'total_tokens' => 0,
                'model' => $model,
            ],
        ];
    }

    /**
     * @param  array<int, array{ref: string, question: string, field_type: string, max_chars?: int|null, options?: array<int, string>|null, required?: bool, context?: string|null}>  $elements
     * @return array<int, array{ref: string, question: string, field_type: string, max_chars?: int|null, options?: array<int, string>|null}>
     */
    private function buildMechanicalFields(array $elements): array
    {
        $fields = [];

        foreach ($elements as $element) {
            if (($element['field_type'] ?? '') === 'file') {
                continue;
            }

            $fields[] = [
                'ref' => $element['ref'],
                'question' => $element['question'],
                'field_type' => $element['field_type'],
                'max_chars' => $element['max_chars'],
                'options' => $element['options'],
            ];
        }

        return $fields;
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @param  array<int, array{ref: string, question: string, field_type: string, max_chars?: int|null, options?: array<int, string>|null}>  $fields
     * @param  array<int, array{ref: string, name: string, role?: string|null}>  $controls
     */
    private function canUseMechanicalInventory(array $snapshot, array $fields, array $controls): bool
    {
        if ($fields === []) {
            return false;
        }

        if ($controls !== []) {
            return false;
        }

        $refs = [];

        foreach ($fields as $field) {
            if (isset($refs[$field['ref']])) {
                return false;
            }

            $refs[$field['ref']] = true;
            $question = $this->normalizeQuestionLabel($field['question']);

            if ($question === '' || mb_strlen($question) < 2) {
                return false;
            }

            if (preg_match('/^(field|input|select|choose one|click here)\b/u', $question) === 1) {
                return false;
            }
        }

        $elementCount = count($snapshot['elements'] ?? []);

        return $elementCount >= 3;
    }

    private function normalizeQuestionLabel(string $label): string
    {
        $label = mb_strtolower(trim($label));
        $label = (string) preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $label);
        $label = (string) preg_replace('/\s+/u', ' ', $label);

        return trim($label);
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
     * @param  array<int, array{ref: string, name: string, role?: string|null}>  $controls
     * @return array<int, array{ref: string, name: string, role?: string|null}>
     */
    private function filterNavigationControls(array $controls): array
    {
        return array_values(array_filter(
            $controls,
            fn (array $control): bool => ! $this->isFinalSubmitControl($control['name']),
        ));
    }

    private function isFinalSubmitControl(string $name): bool
    {
        return (bool) preg_match(
            '/\b(submit\s+(?:application|app)|apply\s+now|send\s+(?:application|app))\b/i',
            trim($name),
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, array{ref: string, question: string, field_type: string, max_chars?: int|null, options?: array<int, string>|null, required?: bool, context?: string|null}>  $elements
     * @return array{
     *     fields: array<int, array{ref: string, question: string, field_type: string, max_chars?: int|null, options?: array<int, string>|null}>,
     *     complete: bool,
     *     next_actions: array<int, array{ref: string, reason: string}>,
     * }
     */
    private function normalizeInventoryPayload(array $payload, array $elements): array
    {
        $elementByRef = collect($elements)->keyBy('ref');
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

        return [
            'fields' => array_values($fields),
            'complete' => true,
            'next_actions' => [],
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
    private function systemPrompt(array $settings): string
    {
        unset($settings);

        return 'You inventory unanswered job application form fields from a browser snapshot. '
            .'Return strict JSON only. Never invent form fields or refs that are not in the snapshot.';
    }
}
