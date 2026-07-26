<?php

namespace App\Support;

use Carbon\Carbon;
use Carbon\CarbonInterface;
use InvalidArgumentException;

final class AnalyticsDateRange
{
    public const WINDOW_MONTH = 'month';

    public const WINDOW_7 = '7';

    public const WINDOW_30 = '30';

    /**
     * @var list<string>
     */
    public const WINDOWS = [
        self::WINDOW_7,
        self::WINDOW_30,
        self::WINDOW_MONTH,
    ];

    public const MAX_MONTHS_BACK = 36;

    public function __construct(
        public readonly CarbonInterface $from,
        public readonly CarbonInterface $to,
        public readonly string $month,
        public readonly string $window,
    ) {
        if ($this->to->lt($this->from)) {
            throw new InvalidArgumentException('Analytics date range end must be on or after start.');
        }
    }

    public static function fromInput(?string $month, ?string $window): self
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

        $resolvedWindow = in_array($window, self::WINDOWS, true)
            ? $window
            : self::WINDOW_MONTH;

        $monthEnd = $monthStart->copy()->endOfMonth()->startOfDay();
        $rangeEnd = $monthEnd->lt($today) ? $monthEnd : $today->copy();

        if ($resolvedWindow === self::WINDOW_MONTH) {
            $from = $monthStart->copy();
            $to = $rangeEnd;
        } else {
            $windowDays = (int) $resolvedWindow;
            $to = $rangeEnd->copy();
            $from = $to->copy()->subDays($windowDays - 1);

            if ($from->lt($monthStart)) {
                $from = $monthStart->copy();
            }
        }

        return new self(
            $from,
            $to,
            $monthStart->format('Y-m'),
            $resolvedWindow,
        );
    }

    public static function lastDays(int $days): self
    {
        $days = max(1, min(90, $days));
        $to = now()->startOfDay();
        $from = $to->copy()->subDays($days - 1);

        return new self(
            $from,
            $to,
            $to->format('Y-m'),
            $days <= 7 ? self::WINDOW_7 : self::WINDOW_30,
        );
    }

    public function days(): int
    {
        return ((int) $this->from->diffInDays($this->to)) + 1;
    }

    /**
     * @return array{
     *     month: string,
     *     window: string,
     *     from: string,
     *     to: string,
     *     days: int,
     *     label: string,
     *     prev_month: string|null,
     *     next_month: string|null,
     *     can_go_prev: bool,
     *     can_go_next: bool,
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
            'window' => $this->window,
            'from' => $this->from->toDateString(),
            'to' => $this->to->toDateString(),
            'days' => $this->days(),
            'label' => $monthDate->format('F Y'),
            'prev_month' => $canGoPrev
                ? $monthDate->copy()->subMonthNoOverflow()->format('Y-m')
                : null,
            'next_month' => $canGoNext
                ? $monthDate->copy()->addMonthNoOverflow()->format('Y-m')
                : null,
            'can_go_prev' => $canGoPrev,
            'can_go_next' => $canGoNext,
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
