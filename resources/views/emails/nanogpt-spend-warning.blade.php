<x-mail::message>
# NanoGPT spend {{ $isExhausted ? 'cap reached' : 'warning' }}

Monthly period (Europe/London): **{{ $period }}**

@if ($isExhausted)
NanoGPT spend has reached **100%** of the monthly budget. Further NanoGPT calls are blocked until the 1st of next month.
@else
NanoGPT spend has reached **{{ $thresholdPercent }}%** of the monthly budget.
@endif

- Spent: **£{{ number_format($spentGbp, 2) }}**
- Cap: **£{{ number_format($capGbp, 2) }}**
- Remaining: **£{{ number_format($remainingGbp, 2) }}**

This alert is sent once per threshold per calendar month.

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
