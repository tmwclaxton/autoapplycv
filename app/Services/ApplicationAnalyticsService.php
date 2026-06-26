<?php

namespace App\Services;

use App\Enums\ApplicationStatus;
use App\Models\JobApplication;
use App\Models\User;

class ApplicationAnalyticsService
{
    /**
     * @return array<string, mixed>
     */
    public function summary(User $user): array
    {
        $applications = JobApplication::query()
            ->where('user_id', $user->id)
            ->get();

        $now = now();
        $weekStart = $now->copy()->startOfWeek();
        $monthStart = $now->copy()->startOfMonth();

        $byStatus = [];

        foreach (ApplicationStatus::cases() as $status) {
            $byStatus[$status->value] = $applications->where('status', $status)->count();
        }

        $bySource = $applications
            ->groupBy(fn (JobApplication $application): string => $application->source ?: 'unknown')
            ->map(fn ($group): int => $group->count())
            ->sortDesc()
            ->all();

        $thisWeek = $applications->filter(
            fn (JobApplication $application): bool => $application->applied_at !== null
                && $application->applied_at->greaterThanOrEqualTo($weekStart),
        )->count();

        $thisMonth = $applications->filter(
            fn (JobApplication $application): bool => $application->applied_at !== null
                && $application->applied_at->greaterThanOrEqualTo($monthStart),
        )->count();

        $positiveOutcomes = $applications->whereIn('status', [
            ApplicationStatus::Screening,
            ApplicationStatus::Interview,
            ApplicationStatus::Offer,
        ])->count();

        $responseRate = $applications->count() > 0
            ? round(($positiveOutcomes / $applications->count()) * 100)
            : 0;

        return [
            'total' => $applications->count(),
            'this_week' => $thisWeek,
            'this_month' => $thisMonth,
            'response_rate' => $responseRate,
            'by_status' => $byStatus,
            'by_source' => $bySource,
            'weekly_trend' => $this->weeklyTrend($user, 8),
        ];
    }

    /**
     * @return array<int, array{week: string, count: int}>
     */
    private function weeklyTrend(User $user, int $weeks): array
    {
        $trend = [];

        for ($index = $weeks - 1; $index >= 0; $index--) {
            $start = now()->startOfWeek()->subWeeks($index);
            $end = $start->copy()->endOfWeek();

            $count = JobApplication::query()
                ->where('user_id', $user->id)
                ->whereBetween('applied_at', [$start, $end])
                ->count();

            $trend[] = [
                'week' => $start->format('d M'),
                'count' => $count,
            ];
        }

        return $trend;
    }
}
