<?php

namespace App\Services;

use App\Models\AutofillDailyStat;
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
        $days = max(7, min(90, $days ?? (int) config('cv.analytics_chart_days', 30)));
        $start = now()->subDays($days - 1)->startOfDay();

        $rows = AutofillDailyStat::query()
            ->whereDate('date', '>=', $start->toDateString())
            ->orderBy('date')
            ->get();

        $answersByDate = [];
        $questionsByDate = [];
        $cvsByDate = [];

        foreach ($rows as $stat) {
            $date = $stat->date->toDateString();
            $answersByDate[$date] = (int) $stat->answers_count;
            $questionsByDate[$date] = (int) $stat->extension_questions_count;
            $cvsByDate[$date] = (int) $stat->cvs_parsed_count;
        }

        return [
            'days' => $days,
            'metrics' => [
                'answers_autofilled' => $this->buildMetricSeries(
                    $days,
                    $start,
                    $answersByDate,
                    'Answers autofilled',
                    (int) AutofillDailyStat::query()->sum('answers_count'),
                ),
                'extension_questions' => $this->buildMetricSeries(
                    $days,
                    $start,
                    $questionsByDate,
                    'Extension questions',
                    (int) AutofillDailyStat::query()->sum('extension_questions_count'),
                ),
                'cvs_parsed' => $this->buildMetricSeries(
                    $days,
                    $start,
                    $cvsByDate,
                    'CVs parsed',
                    (int) AutofillDailyStat::query()->sum('cvs_parsed_count'),
                ),
            ],
        ];
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
