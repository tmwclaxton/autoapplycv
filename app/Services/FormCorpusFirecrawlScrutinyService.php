<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class FormCorpusFirecrawlScrutinyService
{
    private const SYSTEM_PROMPT = 'You scrutinize scraped web pages for inclusion in a job-application form test corpus. '
        .'Return JSON only: {"accept":boolean,"reason":string,"confidence":number,"issues":string[]}. '
        .'ACCEPT when the page contains a real job application form with multiple meaningful inputs '
        .'(name, email, phone, resume/CV upload, work history, or screening questions) a candidate would fill to apply. '
        .'REJECT when: blog/tutorial/template gallery about forms; job listing without apply inputs; '
        .'newsletter/login/contact/search decoy; PDF or apply-via-email with no fillable fields; '
        .'mostly junk/honeypot/search fields despite mechanical counts; paywall or error page. '
        .'Mechanical inventory is a signal, not the sole truth. Known ATS apply URLs may have sparse static HTML '
        .'but real widgets - accept when URL and excerpt indicate a genuine apply flow. '
        .'confidence is 0.0-1.0. issues is a short array of accept/reject factors.';

    public function __construct(private readonly NanoGptService $nanoGpt) {}

    public function model(): string
    {
        return (string) config('cv.form_corpus_firecrawl_scrutiny_model');
    }

    /**
     * @param  array{
     *     url: string,
     *     page_title?: string|null,
     *     html_excerpt: string,
     *     mechanical: array<string, mixed>,
     *     text_signals?: array<string, mixed>,
     * }  $payload
     * @return array{
     *     accept: bool,
     *     reason: string,
     *     confidence: float,
     *     issues: array<int, string>,
     *     model?: string,
     *     error?: string,
     * }
     */
    public function scrutinize(array $payload): array
    {
        $url = trim((string) ($payload['url'] ?? ''));

        if ($url === '') {
            return $this->failure('Missing url in scrutiny payload.');
        }

        $userPayload = [
            'url' => $url,
            'page_title' => $payload['page_title'] ?? null,
            'html_excerpt' => (string) ($payload['html_excerpt'] ?? ''),
            'mechanical' => is_array($payload['mechanical'] ?? null) ? $payload['mechanical'] : [],
            'text_signals' => is_array($payload['text_signals'] ?? null) ? $payload['text_signals'] : [],
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
            'timeout' => (int) config('cv.form_corpus_firecrawl_scrutiny_timeout', 60),
        ]);

        if ($response === null) {
            Log::warning('FormCorpusFirecrawlScrutinyService: NanoGPT returned no JSON.', [
                'url' => $url,
            ]);

            return $this->failure('NanoGPT scrutiny call failed.');
        }

        return $this->normalizeResult($response, $this->model());
    }

    /**
     * @param  array<string, mixed>  $response
     * @return array{
     *     accept: bool,
     *     reason: string,
     *     confidence: float,
     *     issues: array<int, string>,
     *     model?: string,
     * }
     */
    public function normalizeResult(array $response, ?string $model = null): array
    {
        $accept = (bool) ($response['accept'] ?? false);
        $reason = trim((string) ($response['reason'] ?? ''));

        if ($reason === '') {
            $reason = $accept ? 'Accepted by scrutiny model.' : 'Rejected by scrutiny model.';
        }

        $confidence = (float) ($response['confidence'] ?? 0);
        $confidence = max(0.0, min(1.0, $confidence));

        $issues = collect($response['issues'] ?? [])
            ->filter(fn (mixed $issue): bool => is_string($issue) && trim($issue) !== '')
            ->map(fn (string $issue): string => trim($issue))
            ->values()
            ->all();

        $normalized = [
            'accept' => $accept,
            'reason' => $reason,
            'confidence' => $confidence,
            'issues' => $issues,
        ];

        if (is_string($model) && $model !== '') {
            $normalized['model'] = $model;
        }

        return $normalized;
    }

    /**
     * @return array{accept: bool, reason: string, confidence: float, issues: array<int, string>, error: string}
     */
    private function failure(string $message): array
    {
        return [
            'accept' => false,
            'reason' => $message,
            'confidence' => 0.0,
            'issues' => ['scrutiny_error'],
            'error' => $message,
        ];
    }
}
