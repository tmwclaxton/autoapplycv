<?php

namespace App\Services;

use App\Enums\ExtensionAutoApplyEventType;
use App\Enums\ExtensionAutoApplySessionStatus;
use App\Models\ExtensionAutoApplyEvent;
use App\Models\ExtensionAutoApplySession;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class ExtensionAutoApplyAnalyticsService
{
    public function __construct(
        private readonly ExtensionPageCaptureService $pageCaptures,
    ) {}

    public function startSession(
        User $user,
        string $platform,
        string $roleDescription,
        int $maxApplications,
    ): ExtensionAutoApplySession {
        return ExtensionAutoApplySession::query()->create([
            'user_id' => $user->id,
            'platform' => $platform,
            'role_description' => $roleDescription,
            'status' => ExtensionAutoApplySessionStatus::Running,
            'max_applications' => max(1, min(50, $maxApplications)),
            'started_at' => now(),
        ]);
    }

    /**
     * @param  array{
     *     status?: string,
     *     jobs_found?: int,
     *     applied_count?: int,
     *     skipped_count?: int,
     *     error_count?: int,
     *     fields_filled_count?: int,
     *     stopped_at?: string|null,
     *     last_error?: string|null,
     * }  $payload
     */
    public function updateSession(
        ExtensionAutoApplySession $session,
        array $payload,
    ): ExtensionAutoApplySession {
        $updates = [];

        if (array_key_exists('status', $payload)) {
            $updates['status'] = ExtensionAutoApplySessionStatus::from((string) $payload['status']);
        }

        foreach (['jobs_found', 'applied_count', 'skipped_count', 'error_count', 'fields_filled_count'] as $field) {
            if (array_key_exists($field, $payload)) {
                $updates[$field] = max(0, (int) $payload[$field]);
            }
        }

        if (array_key_exists('stopped_at', $payload)) {
            $updates['stopped_at'] = $payload['stopped_at'] !== null
                ? now()->parse((string) $payload['stopped_at'])
                : null;
        }

        if (array_key_exists('last_error', $payload)) {
            $updates['last_error'] = $payload['last_error'] !== null
                ? mb_substr((string) $payload['last_error'], 0, 1024)
                : null;
        }

        if ($updates !== []) {
            $session->update($updates);
        }

        return $session->fresh();
    }

    /**
     * @param  array<string, mixed>|null  $metadata
     */
    public function recordEvent(
        ExtensionAutoApplySession $session,
        ExtensionAutoApplyEventType $eventType,
        ?string $jobTitle = null,
        ?string $company = null,
        ?string $jobUrl = null,
        int $fieldsFilledCount = 0,
        ?array $metadata = null,
        ?string $failureHtml = null,
        ?string $pageUrl = null,
        ?string $pageTitle = null,
    ): ExtensionAutoApplyEvent {
        $pageCaptureId = null;

        if ($eventType === ExtensionAutoApplyEventType::Error && filled($failureHtml)) {
            $session->loadMissing('user');

            $captureUrl = filled($pageUrl)
                ? (string) $pageUrl
                : ($jobUrl ?? '');

            $capture = $this->pageCaptures->store(
                user: $session->user,
                url: mb_substr($captureUrl, 0, 2048),
                pageTitle: mb_substr((string) ($pageTitle ?? ''), 0, 512),
                html: $failureHtml,
            );

            $pageCaptureId = $capture->id;
        }

        return ExtensionAutoApplyEvent::query()->create([
            'extension_auto_apply_session_id' => $session->id,
            'event_type' => $eventType,
            'job_title' => $jobTitle !== null ? mb_substr($jobTitle, 0, 512) : null,
            'company' => $company !== null ? mb_substr($company, 0, 512) : null,
            'job_url' => $jobUrl !== null ? mb_substr($jobUrl, 0, 2048) : null,
            'fields_filled_count' => max(0, $fieldsFilledCount),
            'metadata' => $metadata,
            'extension_page_capture_id' => $pageCaptureId,
            'created_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $queryAppends
     * @return array<string, mixed>
     */
    public function adminDashboardData(array $queryAppends = []): array
    {
        $chartDays = max(7, min(90, (int) config('admin.dashboard_chart_days', 30)));
        $start = now()->subDays($chartDays - 1)->startOfDay();

        $sessionsByDate = ExtensionAutoApplySession::query()
            ->where('started_at', '>=', $start)
            ->selectRaw('DATE(started_at) as session_date, COUNT(*) as total')
            ->groupBy('session_date')
            ->pluck('total', 'session_date')
            ->all();

        $applicationsByDate = ExtensionAutoApplySession::query()
            ->where('started_at', '>=', $start)
            ->selectRaw('DATE(started_at) as session_date, SUM(applied_count) as total')
            ->groupBy('session_date')
            ->pluck('total', 'session_date')
            ->all();

        $sessionSeries = [];
        $applicationSeries = [];
        $periodSessions = 0;
        $periodApplications = 0;

        for ($offset = 0; $offset < $chartDays; $offset++) {
            $date = $start->copy()->addDays($offset)->toDateString();
            $sessionCount = (int) ($sessionsByDate[$date] ?? 0);
            $applicationCount = (int) ($applicationsByDate[$date] ?? 0);
            $periodSessions += $sessionCount;
            $periodApplications += $applicationCount;

            $sessionSeries[] = [
                'date' => $date,
                'count' => $sessionCount,
            ];

            $applicationSeries[] = [
                'date' => $date,
                'count' => $applicationCount,
            ];
        }

        return [
            'auto_apply_stats' => [
                'total_sessions' => (int) ExtensionAutoApplySession::query()->count(),
                'period_sessions' => $periodSessions,
                'total_applications' => (int) ExtensionAutoApplySession::query()->sum('applied_count'),
                'period_applications' => $periodApplications,
                'active_auto_apply_users' => (int) ExtensionAutoApplySession::query()
                    ->where('started_at', '>=', $start)
                    ->distinct('user_id')
                    ->count('user_id'),
                'sessions_today' => (int) ExtensionAutoApplySession::query()
                    ->whereDate('started_at', now()->toDateString())
                    ->count(),
            ],
            'auto_apply_session_series' => [
                'days' => $chartDays,
                'series' => $sessionSeries,
            ],
            'auto_apply_application_series' => [
                'days' => $chartDays,
                'series' => $applicationSeries,
            ],
            'auto_apply_sessions' => $this->paginatedSessions($queryAppends),
        ];
    }

    /**
     * @param  array<string, mixed>  $queryAppends
     * @return LengthAwarePaginator<int, ExtensionAutoApplySession>
     */
    public function paginatedSessions(array $queryAppends = []): LengthAwarePaginator
    {
        return ExtensionAutoApplySession::query()
            ->with([
                'user:id,name,email',
                'events' => fn ($query) => $query
                    ->whereIn('event_type', [
                        ExtensionAutoApplyEventType::Submitted,
                        ExtensionAutoApplyEventType::Skipped,
                        ExtensionAutoApplyEventType::Error,
                    ])
                    ->with('pageCapture:id')
                    ->latest('created_at')
                    ->limit(20),
            ])
            ->latest('started_at')
            ->paginate(
                (int) config('admin.auto_apply_sessions_per_page', 25),
                ['*'],
                'auto_apply_page',
            )
            ->appends($queryAppends)
            ->through(fn (ExtensionAutoApplySession $session): array => $session->toAdminDetailArray());
    }
}
