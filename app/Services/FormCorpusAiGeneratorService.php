<?php

namespace App\Services;

use App\Support\FormCorpusManifest;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;

class FormCorpusAiGeneratorService
{
    private const MAX_REPAIR_ROUNDS = 3;

    private const MAX_GENERATE_ATTEMPTS = 3;

    private const GENERATION_TIMEOUT_SECONDS = 300;

    private const HTML_GENERATION_SYSTEM_PROMPT = 'You generate standalone HTML job application forms that mirror REAL production ATS DOM - messy, not semantic tutorials. '
        .'Return JSON: {"html":"...","title":"..."}. '
        .'Rules: complete HTML document with inline CSS only; no external script src or CDN links; '
        .'at least 10 application fields detectable by heuristics; '
        .'FORBIDDEN: a form where every field is clean label[for]+native input only. '
        .'REQUIRED: implement every required_complexity_patterns entry from the brief; '
        .'include at least 3 non-semantic patterns among: div role=textbox/contenteditable, aria-label-only fields, aria-labelledby, '
        .'pill yes/no buttons, custom listbox combobox, decoy secondary form, details/hidden reveal, glued span labels, readonly prefills. '
        .'Use reference_templates DOM excerpts as structural inspiration. Inline JS for reveal/wizard is allowed.';

    private const HTML_REPAIR_SYSTEM_PROMPT = 'You fix HTML job application forms to pass mechanical review. Return JSON: {"html":"...","title":"..."}. '
        .'Keep the apply intent but fix every issue in failure_report. '
        .'When too_semantic or insufficient_complexity: add non-semantic production patterns from the brief - do not simplify to tutorial HTML. '
        .'No external script src. Standalone HTML only.';

    public function __construct(private readonly NanoGptService $nanoGpt) {}

    public function model(): string
    {
        return (string) config('cv.form_corpus_ai_model');
    }

    /**
     * @return array<string, mixed>|null
     */
    public function composeBrief(string $id, ?string $targetCell = null, ?int $seed = null, string $complexityTier = 'standard'): ?array
    {
        $args = ['node', base_path('scripts/form-corpus/compose-ai-brief.mjs'), "--id={$id}"];

        if ($targetCell !== null && $targetCell !== '') {
            $args[] = "--target-cell={$targetCell}";
        }

        if ($seed !== null) {
            $args[] = "--seed={$seed}";
        }

        if ($complexityTier !== '' && $complexityTier !== 'standard') {
            $args[] = "--complexity-tier={$complexityTier}";
        }

        $result = Process::timeout(30)->run($args);

        if (! $result->successful()) {
            Log::warning('FormCorpusAiGeneratorService: brief composition failed.', [
                'id' => $id,
                'stderr' => $result->errorOutput(),
            ]);

            return null;
        }

        $decoded = json_decode($result->output(), true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @param  array<string, mixed>  $brief
     * @return array{html: string, title: string}|null
     */
    public function generateHtml(array $brief): ?array
    {
        $payload = $this->nanoGpt->chatJsonLoose([
            [
                'role' => 'system',
                'content' => self::HTML_GENERATION_SYSTEM_PROMPT,
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'brief' => $this->briefPayloadForModel($brief),
                    'instructions' => $brief['prompt_summary'] ?? '',
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => $this->model(),
            'temperature' => 0.9,
            'timeout' => self::GENERATION_TIMEOUT_SECONDS,
        ]);

        if ($payload === null || ! is_string($payload['html'] ?? null) || trim($payload['html']) === '') {
            return null;
        }

        return [
            'html' => (string) $payload['html'],
            'title' => (string) ($payload['title'] ?? 'Job Application'),
        ];
    }

    /**
     * @param  array<string, mixed>  $brief
     * @return array{html: string, title: string}|null
     */
    private function generateHtmlWithRetries(array $brief): ?array
    {
        for ($attempt = 1; $attempt <= self::MAX_GENERATE_ATTEMPTS; $attempt++) {
            $generated = $this->generateHtml($brief);

            if ($generated !== null) {
                return $generated;
            }

            if ($attempt < self::MAX_GENERATE_ATTEMPTS) {
                Log::warning('Form corpus HTML generation retry', [
                    'id' => $brief['id'] ?? null,
                    'attempt' => $attempt,
                ]);
                sleep(min(15, 5 * $attempt));
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $brief
     * @param  array<int, array<string, mixed>>  $issues
     * @return array{html: string, title: string}|null
     */
    public function repairHtml(array $brief, string $html, array $issues): ?array
    {
        $payload = $this->nanoGpt->chatJsonLoose([
            [
                'role' => 'system',
                'content' => self::HTML_REPAIR_SYSTEM_PROMPT,
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'brief' => $this->briefPayloadForModel($brief),
                    'html' => mb_substr($html, 0, 120000),
                    'failure_report' => ['issues' => $issues],
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => $this->model(),
            'temperature' => 0.2,
            'timeout' => self::GENERATION_TIMEOUT_SECONDS,
        ]);

        if ($payload === null || ! is_string($payload['html'] ?? null) || trim($payload['html']) === '') {
            return null;
        }

        return [
            'html' => (string) $payload['html'],
            'title' => (string) ($payload['title'] ?? 'Job Application'),
        ];
    }

    /**
     * @param  array<string, mixed>  $brief
     * @return array<string, mixed>
     */
    private function briefPayloadForModel(array $brief): array
    {
        return [
            'id' => $brief['id'] ?? null,
            'variety' => $brief['variety'] ?? [],
            'constraints' => [
                'min_fields' => $brief['constraints']['min_fields'] ?? 10,
                'required_complexity_patterns' => $brief['constraints']['required_complexity_patterns'] ?? [],
                'reference_templates' => array_map(
                    fn (array $row): array => [
                        'title' => $row['title'] ?? '',
                        'notes' => $row['notes'] ?? '',
                    ],
                    is_array($brief['constraints']['reference_templates'] ?? null) ? $brief['constraints']['reference_templates'] : [],
                ),
            ],
            'instructions' => $brief['prompt_summary'] ?? '',
        ];
    }

    /**
     * @param  array<string, mixed>  $brief
     * @return array<string, mixed>|null
     */
    public function enrichMetadata(array $brief, string $html): ?array
    {
        return $this->nanoGpt->chatJsonLoose([
            [
                'role' => 'system',
                'content' => 'Return JSON metadata for a job application HTML fixture: '
                    .'{"page_title":"...","notes":"...","variety":{"ats_style":"...","widgets":[],"structure":"...","field_count_band":"..."},'
                    .'"requires_interaction":false,"interaction_steps":[]}. '
                    .'interaction_steps only when fields are hidden until user action.',
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'brief' => $brief,
                    'html' => mb_substr($html, 0, 120000),
                ], JSON_THROW_ON_ERROR),
            ],
        ], [
            'model' => $this->model(),
            'temperature' => 0.2,
            'timeout' => 90,
        ]);
    }

    /**
     * @return array{passed: bool, issues: array<int, array<string, mixed>>, html?: string, pattern_signature?: string|null}
     */
    public function mechanicalReview(string $id, string $htmlPath, string $pageTitle, ?array $brief = null): array
    {
        $args = [
            'node',
            base_path('scripts/form-corpus/run-mechanical-review.mjs'),
            "--html-file={$htmlPath}",
            "--id={$id}",
            "--page-title={$pageTitle}",
        ];

        $briefPath = FormCorpusManifest::briefPath($id);

        if (is_readable($briefPath)) {
            $args[] = "--brief-file={$briefPath}";
        } elseif ($brief !== null) {
            file_put_contents($briefPath, json_encode($brief, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");
            $args[] = "--brief-file={$briefPath}";
        }

        $result = Process::timeout(60)->run($args);

        $decoded = json_decode($result->output(), true);

        if (! is_array($decoded)) {
            return [
                'passed' => false,
                'issues' => [['code' => 'review_failed', 'message' => trim($result->errorOutput() ?: $result->output()) ?: 'Mechanical review failed']],
            ];
        }

        if (is_string($decoded['html'] ?? null) && $decoded['html'] !== '') {
            file_put_contents($htmlPath, $decoded['html']);
        }

        return [
            'passed' => (bool) ($decoded['passed'] ?? false),
            'issues' => is_array($decoded['issues'] ?? null) ? $decoded['issues'] : [],
            'pattern_signature' => is_string($decoded['pattern_signature'] ?? null) ? $decoded['pattern_signature'] : null,
        ];
    }

    public function resolveAlternateTargetCell(int $batchIndex = 0): ?string
    {
        $result = Process::timeout(15)->run([
            'node',
            base_path('scripts/form-corpus/pick-matrix-target.mjs'),
            "--batch-index={$batchIndex}",
        ]);

        if (! $result->successful()) {
            return null;
        }

        $cell = trim($result->output());

        return $cell !== '' ? $cell : null;
    }

    /**
     * @param  array<string, mixed>  $brief
     * @return array<string, mixed>
     */
    public function generateFixture(string $id, array $brief, ?string $targetCell = null): array
    {
        File::ensureDirectoryExists(base_path(FormCorpusManifest::HTML_DIR));
        File::ensureDirectoryExists(base_path(FormCorpusManifest::BRIEFS_DIR));

        file_put_contents(FormCorpusManifest::briefPath($id), json_encode($brief, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n");

        $report = [
            'id' => $id,
            'repair_rounds' => 0,
            'regenerated' => false,
            'passed' => false,
            'issues' => [],
            'status' => 'draft',
        ];

        $generated = $this->generateHtmlWithRetries($brief);

        if ($generated === null) {
            $report['issues'][] = ['code' => 'generate_failed', 'message' => 'NanoGPT HTML generation returned null'];

            return $report;
        }

        $htmlPath = FormCorpusManifest::htmlPath($id);
        file_put_contents($htmlPath, $generated['html']);
        $title = $generated['title'];

        for ($round = 0; $round <= self::MAX_REPAIR_ROUNDS; $round++) {
            $review = $this->mechanicalReview($id, $htmlPath, $title, $brief);

            if ($review['passed']) {
                $report['passed'] = true;
                $report['pattern_signature'] = $review['pattern_signature'] ?? null;
                break;
            }

            $report['issues'] = $review['issues'];
            $report['repair_rounds'] = $round + 1;

            $hasDuplicate = collect($review['issues'])->contains(
                fn (array $issue): bool => ($issue['code'] ?? '') === 'duplicate_signature',
            );

            if ($hasDuplicate && $targetCell === null) {
                $alternateCell = $this->resolveAlternateTargetCell($round + (int) ($brief['seed'] ?? 0));

                if ($alternateCell !== null) {
                    $altBrief = $this->composeBrief($id, $alternateCell, ($brief['seed'] ?? 0) + 1000 + $round, (string) ($brief['constraints']['complexity_tier'] ?? 'standard'));

                    if ($altBrief !== null) {
                        $brief = $altBrief;
                        $regenerated = $this->generateHtmlWithRetries($brief);

                        if ($regenerated !== null) {
                            file_put_contents($htmlPath, $regenerated['html']);
                            $title = $regenerated['title'];
                            $report['regenerated'] = true;

                            continue;
                        }
                    }
                }
            }

            if ($round === self::MAX_REPAIR_ROUNDS) {
                break;
            }

            $repaired = $this->repairHtml($brief, (string) file_get_contents($htmlPath), $review['issues']);

            if ($repaired === null) {
                continue;
            }

            file_put_contents($htmlPath, $repaired['html']);
            $title = $repaired['title'];
        }

        if (! $report['passed']) {
            $regenBrief = $brief;
            $regenBrief['constraints']['regen'] = true;
            if ($targetCell !== null && $targetCell !== '') {
                $altBrief = $this->composeBrief($id, $targetCell, ($brief['seed'] ?? 0) + 9999, (string) ($brief['constraints']['complexity_tier'] ?? 'standard'));

                if ($altBrief !== null) {
                    $regenBrief = $altBrief;
                }
            }

            $regenerated = $this->generateHtmlWithRetries($regenBrief);

            if ($regenerated !== null) {
                $report['regenerated'] = true;
                file_put_contents($htmlPath, $regenerated['html']);
                $title = $regenerated['title'];

                for ($round = 0; $round < self::MAX_REPAIR_ROUNDS; $round++) {
                    $review = $this->mechanicalReview($id, $htmlPath, $title, $brief);

                    if ($review['passed']) {
                        $report['passed'] = true;
                        $report['pattern_signature'] = $review['pattern_signature'] ?? null;
                        $report['issues'] = [];
                        break;
                    }

                    $report['issues'] = $review['issues'];
                    $repaired = $this->repairHtml($regenBrief, (string) file_get_contents($htmlPath), $review['issues']);

                    if ($repaired !== null) {
                        file_put_contents($htmlPath, $repaired['html']);
                        $title = $repaired['title'];
                    }
                }
            }
        }

        $metadata = $this->enrichMetadata($brief, (string) file_get_contents($htmlPath));
        $this->upsertManifestScenario($id, $brief, $metadata, $report);

        $report['status'] = $report['passed'] ? 'pending' : 'draft';

        return $report;
    }

    /**
     * @param  array<string, mixed>  $brief
     * @param  array<string, mixed>|null  $metadata
     * @param  array<string, mixed>  $report
     */
    private function upsertManifestScenario(string $id, array $brief, ?array $metadata, array $report): void
    {
        $manifest = FormCorpusManifest::load();
        $variety = is_array($metadata['variety'] ?? null)
            ? $metadata['variety']
            : ($brief['variety'] ?? []);
        $index = null;

        foreach ($manifest['scenarios'] as $i => $scenario) {
            if (($scenario['id'] ?? '') === $id) {
                $index = $i;
                break;
            }
        }

        $scenario = [
            'id' => $id,
            'category' => 'ai-synthetic',
            'source' => 'synthetic',
            'status' => $report['passed'] ? 'pending' : 'draft',
            'html_file' => "{$id}.html",
            'page_url' => "https://example.test/forms/{$id}",
            'page_title' => (string) ($metadata['page_title'] ?? 'Job Application'),
            'notes' => (string) ($metadata['notes'] ?? ($brief['prompt_summary'] ?? '')),
            'variety' => $variety,
            'pattern_signature' => $report['pattern_signature'] ?? null,
            'requires_interaction' => (bool) ($metadata['requires_interaction'] ?? false),
            'interaction_steps' => is_array($metadata['interaction_steps'] ?? null) ? $metadata['interaction_steps'] : [],
            'vet_issues' => $report['passed'] ? [] : array_map(
                fn (array $issue): string => (string) ($issue['message'] ?? $issue['code'] ?? 'issue'),
                $report['issues'],
            ),
        ];

        if ($index === null) {
            $manifest['scenarios'][] = $scenario;
        } else {
            $manifest['scenarios'][$index] = array_merge($manifest['scenarios'][$index], $scenario);
        }

        FormCorpusManifest::save($manifest);
    }

    /**
     * @return array<int, string>
     */
    public function resolveIdBatch(string $startId, int $limit): array
    {
        if (! preg_match('/^syn-ai-(\d+)$/', $startId, $matches)) {
            return [];
        }

        $start = (int) $matches[1];
        $ids = [];

        for ($i = 0; $i < $limit; $i++) {
            $ids[] = sprintf('syn-ai-%04d', $start + $i);
        }

        return $ids;
    }
}
