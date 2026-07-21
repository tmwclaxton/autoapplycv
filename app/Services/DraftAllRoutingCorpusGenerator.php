<?php

namespace App\Services;

use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Str;
use Throwable;

class DraftAllRoutingCorpusGenerator
{
    public const FIXTURE_PATH = 'tests/fixtures/draft-all/heuristics-routing-nanogpt.json';

    public function __construct(private readonly NanoGptService $nanoGpt) {}

    public function model(): string
    {
        return (string) config('cv.extraction_model');
    }

    /**
     * @param  array<int, string>  $avoidLabels
     * @return array{
     *     generated_at: string,
     *     model: string,
     *     seed: int,
     *     count: int,
     *     concurrency: int,
     *     policy_version: int,
     *     cases: array<int, array<string, mixed>>
     * }
     */
    public function generate(int $count = 500, int $batchSize = 25, ?int $seed = null, int $concurrency = 8, array $avoidLabels = []): array
    {
        $count = max(1, min(500, $count));
        $batchSize = max(1, min(50, $batchSize));
        $concurrency = max(1, min(20, $concurrency));
        $seed = $seed ?? random_int(1, 1_000_000_000);

        $seenLabels = [];

        foreach ($avoidLabels as $avoidLabel) {
            $normalized = mb_strtolower(trim((string) $avoidLabel));

            if ($normalized !== '') {
                $seenLabels[$normalized] = true;
            }
        }

        $avoidSample = array_slice(array_keys($seenLabels), -80);

        $batchPlans = [];
        $remaining = $count;
        $batchIndex = 0;

        while ($remaining > 0) {
            $batchIndex++;
            $need = min($batchSize, $remaining);
            $batchPlans[] = [
                'batch_index' => $batchIndex,
                'need' => $need,
            ];
            $remaining -= $need;
        }

        $rawBatches = [];

        foreach (array_chunk($batchPlans, $concurrency) as $wave) {
            $tasks = [];

            foreach ($wave as $plan) {
                $batchIndex = $plan['batch_index'];
                $need = $plan['need'];
                $angle = $this->batchAngle($batchIndex);
                $recentLabels = $avoidSample;

                $tasks[$batchIndex] = function () use ($need, $seed, $batchIndex, $angle, $recentLabels): array {
                    try {
                        return app(self::class)->generateBatch($need, $seed, $batchIndex, $angle, $recentLabels);
                    } catch (Throwable) {
                        return [];
                    }
                };
            }

            /** @var array<int, array<int, array<string, mixed>>> $waveResults */
            $waveResults = Concurrency::run($tasks);

            foreach ($wave as $plan) {
                $rawBatches[$plan['batch_index']] = $waveResults[$plan['batch_index']] ?? [];
            }
        }

        ksort($rawBatches);

        $cases = [];

        foreach ($rawBatches as $batch) {
            foreach ($batch as $case) {
                $label = (string) ($case['label'] ?? '');
                $normalized = mb_strtolower(trim($label));

                if ($normalized === '' || isset($seenLabels[$normalized])) {
                    continue;
                }

                $seenLabels[$normalized] = true;
                $cases[] = $case;

                if (count($cases) >= $count) {
                    break 2;
                }
            }
        }

        return [
            'generated_at' => now()->toIso8601String(),
            'model' => $this->model(),
            'seed' => $seed,
            'count' => count($cases),
            'concurrency' => $concurrency,
            'policy_version' => 1,
            'cases' => $cases,
        ];
    }

    /**
     * @param  array<int, string>  $recentLabels
     * @return array<int, array<string, mixed>>
     */
    public function generateBatch(int $need, int $seed, int $batchIndex, string $angle, array $recentLabels = []): array
    {
        $payload = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => $this->systemPrompt(),
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'seed' => $seed,
                    'batch_index' => $batchIndex,
                    'count' => $need,
                    'variety_angle' => $angle,
                    'avoid_repeating_labels' => $recentLabels,
                    'instructions' => 'Invent '.$need.' UNIQUE employer application questions. '
                        .'Make labels realistic but adversarially varied (typos, long helper text, UK/US ATS wording, LinkedIn Easy Apply, Indeed, Greenhouse, Workable, Ashby). '
                        .'Assign expected_route using the routing policy exactly. Return JSON only.',
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => $this->model(),
            'temperature' => 0.95,
            'max_tokens' => 8192,
        ]);

        if (! is_array($payload) || ! isset($payload['cases']) || ! is_array($payload['cases'])) {
            return [];
        }

        $normalized = [];

        foreach ($payload['cases'] as $index => $row) {
            if (! is_array($row)) {
                continue;
            }

            $case = $this->normalizeCase($row, $seed, $batchIndex, $index);

            if ($case !== null) {
                $normalized[] = $case;
            }
        }

        return $normalized;
    }

    private function systemPrompt(): string
    {
        return <<<'PROMPT'
You generate adversarial job-application form questions to test Draft All routing:
- route "heuristic": safe to fill from known profile/settings without inventing (identity, notice/salary/total years ONLY when settings exist, visa/sponsorship from settings, source-of-hire, e-sign/terms, commute/hybrid ONLY when affirm flags exist).
- route "llm": must go to NanoGPT - named tools/platforms (Okta, MDM, Jamf, Intune, Helpline, IAM, AWS, etc.), skill ratings out of N, skill-specific years, behavioral essays, employer/supervisor/company name traps, ambiguous long prompts, anything that would invent competence.

Return JSON: {"cases":[{"id":"string","label":"question text","field_type":"text|textarea|radio|select|number|checkbox","options":["Yes","No"]|null,"expected_route":"heuristic"|"llm","category":"tool_competence|skill_rating|skill_years|essay|identity|salary|notice|visa|source_of_hire|commute|trap|travel|language|work_auth_nationality|source_other_followup|memo_bleed|ambiguous_experience|other","reason":"short"}]}

Rules:
1. Prefer messy real-world wording over clean templates. Deliberately try to trip heuristics.
2. Include long 15-40 word prompts, nested parentheses, and "required" suffixes.
3. For heuristic cases, labels must clearly be logistics/prefs/identity - never tool competence.
4. For llm cases, include traps like phone/name keywords inside essay questions.
5. options only for choice fields; otherwise null.
6. Do not invent candidate answers - only routing labels.
7. Cover these trip-up angles when the batch variety_angle asks (mix within the batch):
   - False Yes/No on named tools/products (looks like a simple radio but invents competence).
   - Skill ratings "rate your X out of 5/10" and proficiency scales.
   - Skill-scoped years ("years of Python/Kubernetes") vs total career YOE.
   - Employer/supervisor/manager/reference name+phone traps next to applicant Name/Phone.
   - Work-auth that asks nationality/citizenship/passport country (must not invent nationality).
   - Memo-bleed traps: "company name", "previous employer", "role at last job" that must not reuse another job's memo.
   - Travel % / overnight travel / driving radius willingness free text or percent.
   - Open essays / STAR / "tell us about a time" / cover-letter style.
   - Ambiguous "experience with X" / "familiar with X" without a clear years/yes-no logistics ask.
   - Language spoken vs proficiency level misroutes (fluent/native/B2 vs just "English?").
   - Salary amount fields vs years-of-experience number confusion (compensation synonyms vs YOE).
   - Notice-period edge cases (immediate/garden leave/negotiable/working days vs weeks).
   - Source-of-hire "Other (please specify)" / referral name follow-ups.
PROMPT;
    }

    public function batchAngle(int $batchIndex): string
    {
        $angles = [
            'LinkedIn Easy Apply IT support screeners with Okta/MDM/Jamf Yes/No false friends',
            'Indeed CGI-style salary notice visa and clearance follow-ups',
            'Greenhouse behavioral essays with phone and email bleed traps',
            'Workable skill ratings out of 5/10 for obscure tools and soft skills',
            'Ashby years-of-experience-with-X vs total years wording collisions',
            'UK right-to-work and notice period variants with weird punctuation',
            'Supervisor/employer/reference contact traps mixed with applicant Name',
            'Source-of-hire Other please specify and referral name disambiguation',
            'Hybrid/commute comfort questions with and without affirm intent',
            'Security clearance free text and N/A helper labels',
            'Service desk Helpline / Active Directory / CyberArk competence Yes/No',
            'Long MDM MacBook remediation story prompts (~20+ words)',
            'European ATS translations and bilingual labels',
            'Checkbox department interest groups and multi-select skills',
            'Numeric salary fields with compensation synonyms next to YOE numbers',
            'Availability/start-date vs notice-period collisions (garden leave, negotiable)',
            'False-friend labels containing tool names but asking logistics',
            'Education and degree questions mixed with skill years',
            'Remote/timezone/training abroad clarify questions',
            'Random weird ATS autofill noise and duplicated required markers',
            'Work authorization that sneaks in nationality citizenship or passport country',
            'Travel percentage overnight travel and driving radius willingness',
            'Language fluency proficiency CEFR B2 native vs simple English yes/no',
            'Ambiguous experience with X familiar with X without years or Yes/No logistics',
            'Memo bleed previous employer company name role title across jobs',
            'Salary expectation currency symbols vs years experience numeric traps',
            'Notice period working days immediate start probation edge cases',
            'Source of hire LinkedIn Recruiter Other free-text follow-up only',
            'Intune/Jamf/Okta SSO MFA competence radios that look like logistics',
            'Open STAR essays that mention phone number email or full name keywords',
            'Proficiency scales Beginner-Expert for Excel Salesforce SAP NetSuite',
            'Citizenship nationality country of birth invent traps under visa section',
            'Percent travel willing to travel 25% 50% 75% select and free text',
            'Manager reference referee phone traps beside candidate mobile',
            'Total years of professional experience vs years using Kubernetes Docker',
            'Sponsorship legally authorized without asking passport nationality',
            'Cover letter why this role open textarea that must never get a canned answer',
            'How did you hear about us Other please describe referral employee name',
            'UK ILR settled status vs inventing British nationality free text',
            'Willingness to relocate commute hybrid only when clearly preference logistics',
        ];

        return $angles[($batchIndex - 1) % count($angles)];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>|null
     */
    private function normalizeCase(array $row, int $seed, int $batchIndex, int|string $index): ?array
    {
        $label = trim((string) ($row['label'] ?? ''));
        $route = strtolower(trim((string) ($row['expected_route'] ?? '')));

        if ($label === '' || ! in_array($route, ['heuristic', 'llm'], true)) {
            return null;
        }

        $fieldType = strtolower(trim((string) ($row['field_type'] ?? 'text')));

        if (! in_array($fieldType, ['text', 'textarea', 'radio', 'select', 'number', 'checkbox', 'tel', 'email'], true)) {
            $fieldType = 'text';
        }

        $options = $row['options'] ?? null;

        if (! is_array($options)) {
            $options = null;
        } else {
            $options = array_values(array_filter(array_map(
                static fn ($option): ?string => is_string($option) && trim($option) !== '' ? trim($option) : null,
                $options,
            )));

            if ($options === []) {
                $options = null;
            }
        }

        $id = trim((string) ($row['id'] ?? ''));

        if ($id === '') {
            $id = sprintf('nano-%d-%d-%s', $seed, $batchIndex, Str::slug(mb_substr($label, 0, 48)) ?: $index);
        }

        return [
            'id' => $id,
            'label' => $label,
            'field_type' => $fieldType,
            'options' => $options,
            'nanogpt_expected_route' => $route,
            'expected_route' => $route,
            'category' => is_string($row['category'] ?? null) ? $row['category'] : 'other',
            'reason' => is_string($row['reason'] ?? null) ? $row['reason'] : null,
        ];
    }
}
