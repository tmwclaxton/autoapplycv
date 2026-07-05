<?php

namespace App\Services;

class ProfileMappingNanoGptAuditor
{
    public function __construct(
        private readonly NanoGptService $nanoGpt,
    ) {}

    /**
     * @param  array<int, array{
     *     id: string,
     *     label: string,
     *     proposed_profile_path: string|null,
     *     proposed_profile_label: string|null,
     *     field_type?: string|null,
     *     options?: array<int, string>|null,
     * }>  $scenarios
     * @return array<int, array{id: string, appropriate: bool, reason: string}>
     */
    public function vetBatch(array $scenarios): array
    {
        if ($scenarios === []) {
            return [];
        }

        $payload = json_encode([
            'scenarios' => array_map(static function (array $scenario): array {
                return [
                    'id' => $scenario['id'],
                    'question_label' => $scenario['label'],
                    'proposed_profile_path' => $scenario['proposed_profile_path'],
                    'proposed_profile_label' => $scenario['proposed_profile_label'],
                    'field_type' => $scenario['field_type'] ?? null,
                    'options' => $scenario['options'] ?? null,
                ];
            }, $scenarios),
        ], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);

        $response = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => <<<'PROMPT'
You audit whether job application question labels should map to a candidate profile field for "Save to profile" UX.

Return JSON:
{
  "results": [
    { "id": "scenario-id", "appropriate": true|false, "reason": "short explanation" }
  ]
}

Rules:
- Hours per week, time commitment, availability yes/no must NOT map to salary fields.
- EEO/diversity questions must NOT map to profile fields.
- Education history questions must NOT map to profile preference fields.
- Identity questions (name, email, phone) mapping to matching profile fields is appropriate.
- Salary/compensation questions mapping to salary preference fields is appropriate.
- Open-ended motivation questions should NOT map to structured profile fields.
- If proposed_profile_path is null, appropriate means null/no profile mapping is correct.
PROMPT,
            ],
            [
                'role' => 'user',
                'content' => "Audit these scenarios:\n{$payload}",
            ],
        ], [
            'model' => config('cv.extraction_model'),
            'temperature' => 0,
        ]);

        if (! is_array($response) || ! is_array($response['results'] ?? null)) {
            return [];
        }

        $parsed = [];

        foreach ($response['results'] as $row) {
            if (! is_array($row) || ! is_string($row['id'] ?? null)) {
                continue;
            }

            $parsed[] = [
                'id' => $row['id'],
                'appropriate' => filter_var($row['appropriate'] ?? false, FILTER_VALIDATE_BOOL),
                'reason' => trim((string) ($row['reason'] ?? '')),
            ];
        }

        return $parsed;
    }
}
