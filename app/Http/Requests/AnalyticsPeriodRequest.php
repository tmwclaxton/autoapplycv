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
            'window' => ['sometimes', 'nullable', 'string', 'max:8'],
        ];
    }

    public function dateRange(): AnalyticsDateRange
    {
        $month = $this->query('month');
        $window = $this->query('window');

        return AnalyticsDateRange::fromInput(
            is_string($month) ? $month : null,
            is_string($window) ? $window : null,
        );
    }
}
