<?php

namespace App\Support;

use Carbon\Carbon;

class ApplicationSettings
{
    /**
     * @return array<string, string>
     */
    public static function defaults(): array
    {
        return [
            'phone_country_code' => '+44',
            'years_of_experience' => '2',
            'expected_salary_weekly' => '',
            'expected_salary_monthly' => '',
            'expected_salary_yearly' => '',
            'visa_sponsorship' => 'no',
            'legally_authorized' => 'yes',
            'willing_to_relocate' => 'yes',
            'drivers_license' => 'yes',
            'notice_period' => '',
            'job_preferences' => '',
        ];
    }

    /**
     * @param  array<string, mixed>|null  $settings
     * @return array<string, string>
     */
    public static function merge(?array $settings): array
    {
        $merged = self::defaults();

        if (! is_array($settings)) {
            return $merged;
        }

        foreach (array_keys($merged) as $key) {
            if (! array_key_exists($key, $settings)) {
                continue;
            }

            $value = $settings[$key];

            if (is_string($value) || is_numeric($value)) {
                $merged[$key] = (string) $value;
            }
        }

        return $merged;
    }

    public static function computeEarliestStart(?string $noticePeriod, ?Carbon $from = null): ?string
    {
        return NoticePeriodParser::computeEarliestStart($noticePeriod, $from);
    }

    /**
     * @return array<string, mixed>
     */
    public static function validationRules(): array
    {
        return [
            'application_settings' => ['nullable', 'array'],
            'application_settings.phone_country_code' => ['nullable', 'string', 'max:8'],
            'application_settings.years_of_experience' => ['nullable', 'string', 'max:3'],
            'application_settings.expected_salary_weekly' => ['nullable', 'string', 'max:100'],
            'application_settings.expected_salary_monthly' => ['nullable', 'string', 'max:100'],
            'application_settings.expected_salary_yearly' => ['nullable', 'string', 'max:100'],
            'application_settings.visa_sponsorship' => ['nullable', 'in:yes,no'],
            'application_settings.legally_authorized' => ['nullable', 'in:yes,no'],
            'application_settings.willing_to_relocate' => ['nullable', 'in:yes,no'],
            'application_settings.drivers_license' => ['nullable', 'in:yes,no'],
            'application_settings.notice_period' => ['nullable', 'string', 'max:100'],
            'application_settings.job_preferences' => ['nullable', 'string', 'max:5000'],
        ];
    }
}
