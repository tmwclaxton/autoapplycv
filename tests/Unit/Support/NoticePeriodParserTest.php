<?php

namespace Tests\Unit\Support;

use App\Support\NoticePeriodParser;
use Carbon\Carbon;
use PHPUnit\Framework\TestCase;

class NoticePeriodParserTest extends TestCase
{
    public function test_returns_null_for_empty_notice_period(): void
    {
        $this->assertNull(NoticePeriodParser::computeEarliestStart(''));
        $this->assertNull(NoticePeriodParser::computeEarliestStart(null));
    }

    public function test_immediate_notice_period_returns_immediately(): void
    {
        $this->assertSame('Immediately', NoticePeriodParser::computeEarliestStart('immediate'));
        $this->assertSame('Immediately', NoticePeriodParser::computeEarliestStart('Immediately'));
        $this->assertSame('Immediately', NoticePeriodParser::computeEarliestStart('ASAP'));
    }

    public function test_week_notice_period_adds_weeks_from_reference_date(): void
    {
        $from = Carbon::create(2026, 7, 5);

        $this->assertSame(
            '19 July 2026',
            NoticePeriodParser::computeEarliestStart('2 weeks', $from),
        );
    }

    public function test_month_notice_period_adds_months_from_reference_date(): void
    {
        $from = Carbon::create(2026, 7, 5);

        $this->assertSame(
            '5 August 2026',
            NoticePeriodParser::computeEarliestStart('1 month', $from),
        );
    }

    public function test_day_notice_period_adds_days_from_reference_date(): void
    {
        $from = Carbon::create(2026, 7, 5);

        $this->assertSame(
            '8 July 2026',
            NoticePeriodParser::computeEarliestStart('3 days', $from),
        );
    }

    public function test_unparseable_notice_period_returns_null(): void
    {
        $this->assertNull(NoticePeriodParser::computeEarliestStart('negotiable'));
    }
}
