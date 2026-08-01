<?php

namespace App\Http\Requests;

use App\Support\AnalyticsDateRange;
use Illuminate\Foundation\Http\FormRequest;

class AnalyticsPeriodRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'month' => ['sometimes', 'nullable', 'string', 'max:7'],
            'days' => [
                'sometimes',
                'nullable',
                'integer',
                'min:'.AnalyticsDateRange::MIN_DAYS,
                'max:'.AnalyticsDateRange::MAX_DAYS,
            ],
        ];
    }

    public function dateRange(): AnalyticsDateRange
    {
        $month = $this->query('month');
        $days = $this->query('days');

        return AnalyticsDateRange::fromInput(
            is_string($month) ? $month : null,
            is_numeric($days) ? (int) $days : null,
        );
    }
}
