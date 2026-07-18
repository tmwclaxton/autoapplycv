<?php

namespace App\Services;

use App\Models\AutofillSyntheticDailyStat;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

class SyntheticAnalyticsService
{
    public function isHourlyEnabled(): bool
    {
        return (bool) config('analytics.synthetic_hourly_enabled', true);
    }

    /**
     * @return array{answers: int, extension_questions: int, cvs_parsed: int}
     */
    public function incrementHourly(?int $answers = null, ?int $extensionQuestions = null, ?int $cvsParsed = null): array
    {
        $answers ??= $this->randomIntInclusive(
            (int) config('analytics.synthetic_answers_per_hour_min', 0),
            (int) config('analytics.synthetic_answers_per_hour_max', 5),
        );

        $extensionQuestions ??= $this->randomIntInclusive(
            (int) config('analytics.synthetic_extension_questions_per_hour_min', 0),
            (int) config('analytics.synthetic_extension_questions_per_hour_max', 2),
        );

        if ($cvsParsed === null) {
            $chance = (float) config('analytics.synthetic_cvs_parsed_hourly_chance', 0.12);
            $cvsParsed = (mt_rand(1, 10000) / 10000) <= $chance ? 1 : 0;
        }

        $stat = $this->todayStat();

        if ($answers > 0) {
            $stat->increment('answers_count', $answers);
        }

        if ($extensionQuestions > 0) {
            $stat->increment('extension_questions_count', $extensionQuestions);
        }

        if ($cvsParsed > 0) {
            $stat->increment('cvs_parsed_count', $cvsParsed);
        }

        return [
            'answers' => $answers,
            'extension_questions' => $extensionQuestions,
            'cvs_parsed' => $cvsParsed,
        ];
    }

    /**
     * Replace the synthetic series for the past N days with a deterministic ramp
     * that settles near the expected hourly-job daily rate.
     *
     * @return array{days: int, answers_total: int, extension_questions_total: int, cvs_parsed_total: int}
     */
    public function backfill(?int $days = null): array
    {
        $days = max(1, $days ?? (int) config('analytics.synthetic_backfill_days', 30));
        $steadyAnswers = $this->expectedDailyAnswers();
        $steadyQuestions = $this->expectedDailyExtensionQuestions();
        $steadyCvs = $this->expectedDailyCvsParsed();

        $answersTotal = 0;
        $questionsTotal = 0;
        $cvsTotal = 0;

        $start = now()->subDays($days - 1)->startOfDay();

        for ($offset = 0; $offset < $days; $offset++) {
            $date = $start->copy()->addDays($offset)->startOfDay();
            $progress = $days === 1 ? 1.0 : $offset / ($days - 1);
            // Ease-in quadratic: slow early adoption, then approaches steady state.
            $factor = $progress * $progress;

            $answers = $this->scaledDailyCount($steadyAnswers, $factor, $date, 'answers');
            $questions = $this->scaledDailyCount($steadyQuestions, $factor, $date, 'extension_questions');
            $cvs = $this->scaledDailyCount($steadyCvs, $factor, $date, 'cvs_parsed');

            $this->upsertDay($date, $answers, $questions, $cvs);

            $answersTotal += $answers;
            $questionsTotal += $questions;
            $cvsTotal += $cvs;
        }

        return [
            'days' => $days,
            'answers_total' => $answersTotal,
            'extension_questions_total' => $questionsTotal,
            'cvs_parsed_total' => $cvsTotal,
        ];
    }

    public function expectedDailyAnswers(): float
    {
        return $this->expectedHourlyMid(
            (int) config('analytics.synthetic_answers_per_hour_min', 0),
            (int) config('analytics.synthetic_answers_per_hour_max', 5),
        ) * 24;
    }

    public function expectedDailyExtensionQuestions(): float
    {
        return $this->expectedHourlyMid(
            (int) config('analytics.synthetic_extension_questions_per_hour_min', 0),
            (int) config('analytics.synthetic_extension_questions_per_hour_max', 2),
        ) * 24;
    }

    public function expectedDailyCvsParsed(): float
    {
        return (float) config('analytics.synthetic_cvs_parsed_hourly_chance', 0.12) * 24;
    }

    private function todayStat(): AutofillSyntheticDailyStat
    {
        $date = now()->startOfDay();

        $stat = AutofillSyntheticDailyStat::query()
            ->whereDate('date', $date->toDateString())
            ->first();

        if ($stat !== null) {
            return $stat;
        }

        return AutofillSyntheticDailyStat::query()->create([
            'date' => $date,
            'answers_count' => 0,
            'extension_questions_count' => 0,
            'cvs_parsed_count' => 0,
        ]);
    }

    private function upsertDay(CarbonInterface $date, int $answers, int $questions, int $cvs): void
    {
        $existing = AutofillSyntheticDailyStat::query()
            ->whereDate('date', $date->toDateString())
            ->first();

        if ($existing !== null) {
            $existing->update([
                'answers_count' => $answers,
                'extension_questions_count' => $questions,
                'cvs_parsed_count' => $cvs,
            ]);

            return;
        }

        AutofillSyntheticDailyStat::query()->create([
            'date' => Carbon::parse($date->toDateString())->startOfDay(),
            'answers_count' => $answers,
            'extension_questions_count' => $questions,
            'cvs_parsed_count' => $cvs,
        ]);
    }

    private function expectedHourlyMid(int $min, int $max): float
    {
        if ($max < $min) {
            [$min, $max] = [$max, $min];
        }

        return ($min + $max) / 2;
    }

    private function scaledDailyCount(float $steadyDaily, float $factor, CarbonInterface $date, string $metric): int
    {
        $jitter = $this->deterministicJitter($date->toDateString(), $metric);
        $value = (int) round($steadyDaily * $factor * $jitter);

        return max(0, $value);
    }

    /**
     * Stable 0.85–1.15 jitter so re-running the backfill does not reshape history.
     */
    private function deterministicJitter(string $date, string $metric): float
    {
        $hash = hexdec(substr(hash('crc32b', "synthetic|{$metric}|{$date}"), 0, 8));
        $bucket = $hash % 31;

        return 0.85 + ($bucket / 100);
    }

    private function randomIntInclusive(int $min, int $max): int
    {
        if ($max < $min) {
            [$min, $max] = [$max, $min];
        }

        return mt_rand($min, $max);
    }
}
