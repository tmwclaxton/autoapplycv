<?php

namespace App\Support;

use Carbon\Carbon;
use Carbon\CarbonInterface;
use InvalidArgumentException;

final class AnalyticsDateRange
{
    public const DEFAULT_DAYS = 30;

    public const MIN_DAYS = 1;

    public const MAX_DAYS = 90;

    public const MAX_MONTHS_BACK = 36;

    public function __construct(
        public readonly CarbonInterface $from,
        public readonly CarbonInterface $to,
        public readonly string $month,
        public readonly int $selectedDays,
    ) {
        if ($this->to->lt($this->from)) {
            throw new InvalidArgumentException('Analytics date range end must be on or after start.');
        }

        if ($this->selectedDays < self::MIN_DAYS || $this->selectedDays > self::MAX_DAYS) {
            throw new InvalidArgumentException(sprintf(
                'Analytics days must be between %d and %d.',
                self::MIN_DAYS,
                self::MAX_DAYS,
            ));
        }
    }

    public static function fromInput(?string $month, ?int $days): self
    {
        $today = now()->startOfDay();
        $currentMonthStart = $today->copy()->startOfMonth();
        $earliestMonthStart = $currentMonthStart->copy()->subMonthsNoOverflow(self::MAX_MONTHS_BACK);

        $monthStart = self::parseMonth($month) ?? $currentMonthStart->copy();

        if ($monthStart->gt($currentMonthStart)) {
            $monthStart = $currentMonthStart->copy();
        }

        if ($monthStart->lt($earliestMonthStart)) {
            $monthStart = $earliestMonthStart->copy();
        }

        $selectedDays = self::normalizeDays($days);
        $monthEnd = $monthStart->copy()->endOfMonth()->startOfDay();
        $to = $monthEnd->lt($today) ? $monthEnd : $today->copy();
        $from = $to->copy()->subDays($selectedDays - 1);
        $earliestAllowed = $earliestMonthStart->copy();

        if ($from->lt($earliestAllowed)) {
            $from = $earliestAllowed->copy();
        }

        return new self(
            $from,
            $to,
            $monthStart->format('Y-m'),
            $selectedDays,
        );
    }

    public static function lastDays(int $days): self
    {
        $selectedDays = self::normalizeDays($days);
        $to = now()->startOfDay();
        $from = $to->copy()->subDays($selectedDays - 1);

        return new self(
            $from,
            $to,
            $to->format('Y-m'),
            $selectedDays,
        );
    }

    public static function normalizeDays(?int $days): int
    {
        if ($days === null) {
            return self::DEFAULT_DAYS;
        }

        return max(self::MIN_DAYS, min(self::MAX_DAYS, $days));
    }

    public function days(): int
    {
        return ((int) $this->from->diffInDays($this->to)) + 1;
    }

    /**
     * @return array{
     *     month: string,
     *     days: int,
     *     from: string,
     *     to: string,
     *     label: string,
     *     prev_month: string|null,
     *     next_month: string|null,
     *     can_go_prev: bool,
     *     can_go_next: bool,
     *     min_days: int,
     *     max_days: int,
     * }
     */
    public function meta(): array
    {
        $parsedMonth = Carbon::createFromFormat('!Y-m-d', $this->month.'-01');
        $monthDate = $parsedMonth instanceof Carbon
            ? $parsedMonth->startOfMonth()
            : now()->startOfMonth();
        $currentMonth = now()->format('Y-m');
        $earliestMonth = now()->startOfMonth()->subMonthsNoOverflow(self::MAX_MONTHS_BACK)->format('Y-m');

        $canGoPrev = $this->month > $earliestMonth;
        $canGoNext = $this->month < $currentMonth;

        return [
            'month' => $this->month,
            'days' => $this->selectedDays,
            'from' => $this->from->toDateString(),
            'to' => $this->to->toDateString(),
            'label' => $monthDate->format('F Y'),
            'prev_month' => $canGoPrev
                ? $monthDate->copy()->subMonthNoOverflow()->format('Y-m')
                : null,
            'next_month' => $canGoNext
                ? $monthDate->copy()->addMonthNoOverflow()->format('Y-m')
                : null,
            'can_go_prev' => $canGoPrev,
            'can_go_next' => $canGoNext,
            'min_days' => self::MIN_DAYS,
            'max_days' => self::MAX_DAYS,
        ];
    }

    private static function parseMonth(?string $month): ?Carbon
    {
        if ($month === null || $month === '') {
            return null;
        }

        if (! preg_match('/^\d{4}-\d{2}$/', $month)) {
            return null;
        }

        try {
            $parsed = Carbon::createFromFormat('!Y-m-d', $month.'-01');

            return $parsed instanceof Carbon ? $parsed->startOfMonth() : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
