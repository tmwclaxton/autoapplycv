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
        $usedIndices = [];

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

            $match = $this->findMatchingField($expectedField, $actualFields, $usedIndices);

            if ($match === null) {
                $reasons[] = 'Missing expected field: '.$this->fieldDescription($expectedField);

                continue;
            }

            if (isset($expectedField['field_type']) && ($match['field_type'] ?? '') !== $expectedField['field_type']) {
                $reasons[] = 'Field type mismatch for '.$this->fieldDescription($expectedField)
                    .': expected '.$expectedField['field_type'].', got '.($match['field_type'] ?? '?');
            }

            if (array_key_exists('max_chars', $expectedField)
                && $expectedField['max_chars'] !== null
                && ($match['max_chars'] ?? null) !== $expectedField['max_chars']) {
                $reasons[] = 'max_chars mismatch for '.$this->fieldDescription($expectedField);
            }

            if (! empty($expectedField['options']) && is_array($expectedField['options'])) {
                $expectedOptions = array_map([$this, 'normalizeQuestion'], $expectedField['options']);
                $actualOptions = array_map([$this, 'normalizeQuestion'], $match['options'] ?? []);

                if (count($expectedOptions) !== count($actualOptions)) {
                    $reasons[] = 'Option count mismatch for '.$this->fieldDescription($expectedField);
                }
            }

            foreach (['tag', 'type', 'id', 'name'] as $domKey) {
                if (! array_key_exists('dom', $expectedField) || ! is_array($expectedField['dom'])) {
                    continue;
                }

                if (! array_key_exists($domKey, $expectedField['dom'])) {
                    continue;
                }

                $expectedValue = $expectedField['dom'][$domKey];
                $actualValue = is_array($match['dom'] ?? null) ? ($match['dom'][$domKey] ?? null) : null;

                if ($expectedValue !== $actualValue) {
                    $reasons[] = "dom.{$domKey} mismatch for ".$this->fieldDescription($expectedField)
                        .": expected {$this->stringifyDomValue($expectedValue)}, got {$this->stringifyDomValue($actualValue)}";
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
                'dom' => is_array($element['dom'] ?? null) ? $element['dom'] : null,
            ];
        }

        return $fields;
    }

    /**
     * @param  array<string, mixed>  $expectedField
     * @param  array<int, array<string, mixed>>  $actualFields
     * @param  array<int, bool>  $usedIndices
     * @return array<string, mixed>|null
     */
    private function findMatchingField(array $expectedField, array $actualFields, array &$usedIndices): ?array
    {
        $expectedDomKey = $this->domReferenceKey(
            is_array($expectedField['dom'] ?? null) ? $expectedField['dom'] : null,
            (string) ($expectedField['field_type'] ?? ''),
        );

        if ($expectedDomKey !== null) {
            foreach ($actualFields as $index => $actualField) {
                if (isset($usedIndices[$index])) {
                    continue;
                }

                $actualDomKey = $this->domReferenceKey(
                    is_array($actualField['dom'] ?? null) ? $actualField['dom'] : null,
                    (string) ($actualField['field_type'] ?? ''),
                );

                if ($actualDomKey !== null && $actualDomKey === $expectedDomKey) {
                    $usedIndices[$index] = true;

                    return $actualField;
                }
            }
        }

        foreach ($actualFields as $index => $actualField) {
            if (isset($usedIndices[$index])) {
                continue;
            }

            if ($this->normalizeQuestion((string) ($expectedField['question'] ?? ''))
                === $this->normalizeQuestion((string) ($actualField['question'] ?? ''))) {
                $usedIndices[$index] = true;

                return $actualField;
            }
        }

        foreach ($actualFields as $index => $actualField) {
            if (isset($usedIndices[$index])) {
                continue;
            }

            if ($this->questionsMatch((string) ($expectedField['question'] ?? ''), (string) ($actualField['question'] ?? ''))) {
                $usedIndices[$index] = true;

                return $actualField;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>|null  $dom
     */
    private function domReferenceKey(?array $dom, string $fieldType = ''): ?string
    {
        if ($dom === null || ! isset($dom['tag'])) {
            return null;
        }

        $tag = (string) $dom['tag'];
        $preferName = in_array($fieldType, ['radio', 'checkbox'], true);

        if ($preferName && ! empty($dom['name'])) {
            return "{$tag}[name=".(string) $dom['name'].']';
        }

        if (! empty($dom['id'])) {
            return "{$tag}#".(string) $dom['id'];
        }

        if (! empty($dom['data_testid'])) {
            return "{$tag}[data-testid=".(string) $dom['data_testid'].']';
        }

        if (! empty($dom['name'])) {
            return "{$tag}[name=".(string) $dom['name'].']';
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $field
     */
    private function fieldDescription(array $field): string
    {
        $domKey = $this->domReferenceKey(
            is_array($field['dom'] ?? null) ? $field['dom'] : null,
            (string) ($field['field_type'] ?? ''),
        );

        if ($domKey !== null) {
            return $domKey;
        }

        return (string) ($field['question'] ?? '?');
    }

    private function stringifyDomValue(mixed $value): string
    {
        if ($value === null) {
            return 'null';
        }

        return (string) $value;
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
