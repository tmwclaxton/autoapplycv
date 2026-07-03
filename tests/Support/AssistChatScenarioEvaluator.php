<?php

namespace Tests\Support;

final class AssistChatScenarioEvaluator
{
    /**
     * @param  array<string, mixed>  $scenario
     * @param  array<int, array{field: string, value: mixed}>  $actions
     * @return array{passed: bool, reasons: array<int, string>}
     */
    public function evaluate(array $scenario, array $actions): array
    {
        $reasons = [];

        if (($scenario['must_be_empty'] ?? false) === true && $actions !== []) {
            $reasons[] = 'Expected no Apply actions but got: '.$this->formatActions($actions);
        }

        /** @var array<int, string> $forbidden */
        $forbidden = $scenario['forbid'] ?? [];

        foreach ($forbidden as $field) {
            if ($this->hasField($actions, $field)) {
                $reasons[] = "Forbidden field [{$field}] appeared.";
            }
        }

        /** @var array<int, array{field: string, value: mixed}> $expected */
        $expected = $scenario['expect'] ?? [];

        foreach ($expected as $expectation) {
            if (! $this->containsAction($actions, $expectation['field'], $expectation['value'])) {
                $reasons[] = 'Missing expected action '
                    .$expectation['field'].' → '
                    .$this->stringifyValue($expectation['value'])
                    .'. Actual: '
                    .$this->formatActions($actions);
            }
        }

        if (($scenario['exact'] ?? false) === true && $expected !== []) {
            $expectedFields = array_map(
                static fn (array $expectation): string => $expectation['field'],
                $expected,
            );
            $actualFields = array_map(
                static fn (array $action): string => (string) ($action['field'] ?? ''),
                $actions,
            );

            sort($expectedFields);
            sort($actualFields);

            if ($expectedFields !== $actualFields) {
                $reasons[] = 'Expected exact fields ['.implode(', ', $expectedFields).'] but got ['.implode(', ', $actualFields).'].';
            }
        }

        return [
            'passed' => $reasons === [],
            'reasons' => $reasons,
        ];
    }

    /**
     * @param  array<int, array{field: string, value: mixed}>  $actions
     */
    private function containsAction(array $actions, string $field, mixed $expectedValue): bool
    {
        foreach ($actions as $action) {
            if (($action['field'] ?? '') !== $field) {
                continue;
            }

            if ($this->stringifyValue($action['value'] ?? '') === $this->stringifyValue($expectedValue)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, array{field: string, value: mixed}>  $actions
     */
    private function hasField(array $actions, string $field): bool
    {
        foreach ($actions as $action) {
            if (($action['field'] ?? '') === $field) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, array{field: string, value: mixed}>  $actions
     */
    private function formatActions(array $actions): string
    {
        if ($actions === []) {
            return '(none)';
        }

        $parts = [];

        foreach ($actions as $action) {
            $parts[] = ($action['field'] ?? '?').' → '.$this->stringifyValue($action['value'] ?? '');
        }

        return implode('; ', $parts);
    }

    private function stringifyValue(mixed $value): string
    {
        if (is_array($value)) {
            return json_encode($value, JSON_THROW_ON_ERROR);
        }

        return (string) $value;
    }
}
