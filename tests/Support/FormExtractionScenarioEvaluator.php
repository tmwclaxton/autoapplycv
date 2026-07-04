<?php

namespace Tests\Support;

final class FormExtractionScenarioEvaluator
{
    /**
     * @param  array<string, mixed>  $expected
     * @param  array<string, mixed>  $snapshot
     * @return array{passed: bool, reasons: array<int, string>}
     */
    public function evaluate(array $expected, array $snapshot): array
    {
        $reasons = [];
        $actualFields = $this->normalizeSnapshotFields($snapshot['elements'] ?? []);
        $expectedFields = $expected['fields'] ?? [];

        $minFields = (int) ($expected['min_fields'] ?? count($expectedFields));

        if (count($actualFields) < $minFields) {
            $reasons[] = "Expected at least {$minFields} fields but got ".count($actualFields).'.';
        }

        if (isset($expected['exact_field_count'])) {
            $exact = (int) $expected['exact_field_count'];

            if (count($actualFields) !== $exact) {
                $reasons[] = "Expected exactly {$exact} fields but got ".count($actualFields).'.';
            }
        }

        foreach ($expectedFields as $expectedField) {
            if (! is_array($expectedField)) {
                continue;
            }

            $match = $this->findMatchingField($expectedField, $actualFields);

            if ($match === null) {
                $reasons[] = 'Missing expected field: '.($expectedField['question'] ?? '?');

                continue;
            }

            if (isset($expectedField['field_type']) && ($match['field_type'] ?? '') !== $expectedField['field_type']) {
                $reasons[] = 'Field type mismatch for '.($expectedField['question'] ?? '?')
                    .': expected '.$expectedField['field_type'].', got '.($match['field_type'] ?? '?');
            }

            if (array_key_exists('max_chars', $expectedField)
                && $expectedField['max_chars'] !== null
                && ($match['max_chars'] ?? null) !== $expectedField['max_chars']) {
                $reasons[] = 'max_chars mismatch for '.($expectedField['question'] ?? '?');
            }

            if (! empty($expectedField['options']) && is_array($expectedField['options'])) {
                $expectedOptions = array_map([$this, 'normalizeQuestion'], $expectedField['options']);
                $actualOptions = array_map([$this, 'normalizeQuestion'], $match['options'] ?? []);

                if (count($expectedOptions) !== count($actualOptions)) {
                    $reasons[] = 'Option count mismatch for '.($expectedField['question'] ?? '?');
                }
            }
        }

        foreach ($expected['controls'] ?? [] as $expectedControl) {
            if (! is_array($expectedControl) || ! isset($expectedControl['name'])) {
                continue;
            }

            if (! $this->controlPresent($expectedControl['name'], $snapshot['controls'] ?? [])) {
                $reasons[] = 'Missing expected control: '.$expectedControl['name'];
            }
        }

        return [
            'passed' => $reasons === [],
            'reasons' => $reasons,
        ];
    }

    /**
     * @param  array<int, mixed>  $elements
     * @return array<int, array<string, mixed>>
     */
    private function normalizeSnapshotFields(array $elements): array
    {
        $fields = [];

        foreach ($elements as $element) {
            if (! is_array($element) || ! isset($element['question'])) {
                continue;
            }

            $fields[] = [
                'question' => $this->normalizeQuestion((string) $element['question']),
                'field_type' => (string) ($element['field_type'] ?? 'text'),
                'max_chars' => $element['max_chars'] ?? null,
                'options' => is_array($element['options'] ?? null) ? $element['options'] : null,
            ];
        }

        return $fields;
    }

    /**
     * @param  array<string, mixed>  $expectedField
     * @param  array<int, array<string, mixed>>  $actualFields
     * @return array<string, mixed>|null
     */
    private function findMatchingField(array $expectedField, array $actualFields): ?array
    {
        foreach ($actualFields as $actualField) {
            if ($this->questionsMatch((string) ($expectedField['question'] ?? ''), (string) ($actualField['question'] ?? ''))) {
                return $actualField;
            }
        }

        return null;
    }

    /**
     * @param  array<int, mixed>  $controls
     */
    private function controlPresent(string $expectedName, array $controls): bool
    {
        $needle = $this->normalizeQuestion($expectedName);

        foreach ($controls as $control) {
            if (! is_array($control)) {
                continue;
            }

            if ($this->questionsMatch($needle, (string) ($control['name'] ?? ''))) {
                return true;
            }
        }

        return false;
    }

    private function normalizeQuestion(string $text): string
    {
        $normalized = preg_replace('/\s+/u', ' ', str_replace('*', '', trim($text)));

        return mb_strtolower($normalized ?? '');
    }

    private function questionsMatch(string $left, string $right): bool
    {
        $a = $this->normalizeQuestion($left);
        $b = $this->normalizeQuestion($right);

        if ($a === $b) {
            return true;
        }

        if (mb_strlen($a) >= 12 && mb_strlen($b) >= 12 && (str_contains($a, $b) || str_contains($b, $a))) {
            return true;
        }

        $prefixLength = min(48, mb_strlen($a), mb_strlen($b));

        return $prefixLength >= 12 && mb_substr($a, 0, $prefixLength) === mb_substr($b, 0, $prefixLength);
    }
}
