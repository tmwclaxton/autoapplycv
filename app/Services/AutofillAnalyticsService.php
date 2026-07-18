<?php

namespace App\Services;

use App\Models\AutofillDailyStat;
use App\Models\AutofillSyntheticDailyStat;
use App\Models\CvProfile;
use App\Models\User;
use Carbon\CarbonInterface;

class AutofillAnalyticsService
{
    public function recordAnswers(int $count): void
    {
        $this->incrementDailyStat('answers_count', $count);
    }

    public function recordExtensionQuestions(int $count = 1): void
    {
        $this->incrementDailyStat('extension_questions_count', $count);
    }

    public function recordCvParsed(int $count = 1): void
    {
        $this->incrementDailyStat('cvs_parsed_count', $count);
    }

    /**
     * @return array{
     *     days: int,
     *     metrics: array{
     *         answers_autofilled: array{
     *             label: string,
     *             total: int,
     *             period_total: int,
     *             series: array<int, array{date: string, count: int}>,
     *         },
     *         extension_questions: array{
     *             label: string,
     *             total: int,
     *             period_total: int,
     *             series: array<int, array{date: string, count: int}>,
     *         },
     *         cvs_parsed: array{
     *             label: string,
     *             total: int,
     *             period_total: int,
     *             series: array<int, array{date: string, count: int}>,
     *         },
     *     },
     * }
     */
    public function publicSummary(?int $days = null): array
    {
        $this->syncLegacyCountersFromUsers();

        $days = max(7, min(90, $days ?? (int) config('cv.analytics_chart_days', 30)));
        $start = now()->subDays($days - 1)->startOfDay();

        $answersByDate = [];
        $questionsByDate = [];
        $cvsByDate = [];

        $this->accumulateDailyCounts(
            AutofillDailyStat::query()
                ->whereDate('date', '>=', $start->toDateString())
                ->orderBy('date')
                ->get(),
            $answersByDate,
            $questionsByDate,
            $cvsByDate,
        );

        $this->accumulateDailyCounts(
            AutofillSyntheticDailyStat::query()
                ->whereDate('date', '>=', $start->toDateString())
                ->orderBy('date')
                ->get(),
            $answersByDate,
            $questionsByDate,
            $cvsByDate,
        );

        return [
            'days' => $days,
            'metrics' => [
                'answers_autofilled' => $this->buildMetricSeries(
                    $days,
                    $start,
                    $answersByDate,
                    'Answers autofilled',
                    (int) AutofillDailyStat::query()->sum('answers_count')
                        + (int) AutofillSyntheticDailyStat::query()->sum('answers_count'),
                ),
                'extension_questions' => $this->buildMetricSeries(
                    $days,
                    $start,
                    $questionsByDate,
                    'Extension questions',
                    (int) AutofillDailyStat::query()->sum('extension_questions_count')
                        + (int) AutofillSyntheticDailyStat::query()->sum('extension_questions_count'),
                ),
                'cvs_parsed' => $this->buildMetricSeries(
                    $days,
                    $start,
                    $cvsByDate,
                    'CVs parsed',
                    (int) AutofillDailyStat::query()->sum('cvs_parsed_count')
                        + (int) AutofillSyntheticDailyStat::query()->sum('cvs_parsed_count'),
                ),
            ],
        ];
    }

    /**
     * @param  iterable<int, AutofillDailyStat|AutofillSyntheticDailyStat>  $rows
     * @param  array<string, int>  $answersByDate
     * @param  array<string, int>  $questionsByDate
     * @param  array<string, int>  $cvsByDate
     */
    private function accumulateDailyCounts(
        iterable $rows,
        array &$answersByDate,
        array &$questionsByDate,
        array &$cvsByDate,
    ): void {
        foreach ($rows as $stat) {
            $date = $stat->date->toDateString();
            $answersByDate[$date] = ($answersByDate[$date] ?? 0) + (int) $stat->answers_count;
            $questionsByDate[$date] = ($questionsByDate[$date] ?? 0) + (int) $stat->extension_questions_count;
            $cvsByDate[$date] = ($cvsByDate[$date] ?? 0) + (int) $stat->cvs_parsed_count;
        }
    }

    /**
     * Backfill global daily stats from per-user counters recorded before
     * autofill_daily_stats existed, or when stats fell behind usage.
     */
    public function syncLegacyCountersFromUsers(): void
    {
        $answersInStats = (int) AutofillDailyStat::query()->sum('answers_count');
        $answersFromUsers = (int) User::query()->sum('ai_tokens_used');
        $answersGap = max(0, $answersFromUsers - $answersInStats);

        if ($answersGap > 0) {
            $this->recordAnswers($answersGap);
        }

        $cvsInStats = (int) AutofillDailyStat::query()->sum('cvs_parsed_count');
        $cvsFromProfiles = (int) CvProfile::query()->where('parsing_complete', true)->count();
        $cvsGap = max(0, $cvsFromProfiles - $cvsInStats);

        if ($cvsGap > 0) {
            $this->recordCvParsed($cvsGap);
        }
    }

    private function incrementDailyStat(string $column, int $count): void
    {
        if ($count < 1) {
            return;
        }

        $stat = AutofillDailyStat::query()->firstOrCreate(
            ['date' => now()->startOfDay()],
            [
                'answers_count' => 0,
                'extension_questions_count' => 0,
                'cvs_parsed_count' => 0,
            ],
        );

        $stat->increment($column, $count);
    }

    /**
     * @param  array<string, int>  $countsByDate
     * @return array{
     *     label: string,
     *     total: int,
     *     period_total: int,
     *     series: array<int, array{date: string, count: int}>,
     * }
     */
    private function buildMetricSeries(
        int $days,
        CarbonInterface $start,
        array $countsByDate,
        string $label,
        int $total,
    ): array {
        $series = [];
        $periodTotal = 0;

        for ($offset = 0; $offset < $days; $offset++) {
            $date = $start->copy()->addDays($offset)->toDateString();
            $count = (int) ($countsByDate[$date] ?? 0);
            $periodTotal += $count;

            $series[] = [
                'date' => $date,
                'count' => $count,
            ];
        }

        return [
            'label' => $label,
            'total' => $total,
            'period_total' => $periodTotal,
            'series' => $series,
        ];
    }
}
