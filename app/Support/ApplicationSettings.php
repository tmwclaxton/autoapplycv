<?php

namespace App\Support;

use Carbon\Carbon;

class ApplicationSettings
{
    public const DEFAULT_PAUSE_BEFORE_SUBMIT = false;

    public const DEFAULT_TIMING_LEVEL = 1;

    public const MIN_TIMING_LEVEL = 1;

    public const MAX_TIMING_LEVEL = 5;

    public const DEFAULT_STOP_FOR_COVER_LETTER = false;

    public const DEFAULT_AUTO_GENERATE_COVER_LETTER = true;

    public const DEFAULT_EASY_APPLY_ONLY = true;

    public const DEFAULT_PAUSE_ON_EXTERNAL_APPLY = false;

    /**
     * @return array{
     *     phone_country_code: string,
     *     phone_extension: string,
     *     years_of_experience: string,
     *     expected_salary_weekly: string,
     *     expected_salary_monthly: string,
     *     expected_salary_yearly: string,
     *     visa_sponsorship: string,
     *     legally_authorized: string,
     *     affirm_local_commute: string,
     *     affirm_local_hybrid: string,
     *     willing_to_relocate: string,
     *     drivers_license: string,
     *     notice_period: string,
     *     job_preferences: string,
     *     job_blacklist: string,
     *     pause_before_submit: bool,
     *     timing_level: int,
     *     stop_for_cover_letter: bool,
     *     auto_generate_cover_letter: bool,
     *     easy_apply_only: bool,
     *     pause_on_external_apply: bool,
     * }
     */
    public static function defaults(): array
    {
        return [
            'phone_country_code' => '+44',
            'phone_extension' => '',
            'years_of_experience' => '2',
            'expected_salary_weekly' => '',
            'expected_salary_monthly' => '',
            'expected_salary_yearly' => '',
            'visa_sponsorship' => 'no',
            'legally_authorized' => 'yes',
            'affirm_local_commute' => 'yes',
            'affirm_local_hybrid' => 'yes',
            'willing_to_relocate' => 'yes',
            'drivers_license' => 'yes',
            'notice_period' => '',
            'job_preferences' => '',
            'job_blacklist' => '',
            'pause_before_submit' => self::DEFAULT_PAUSE_BEFORE_SUBMIT,
            'timing_level' => self::DEFAULT_TIMING_LEVEL,
            'stop_for_cover_letter' => self::DEFAULT_STOP_FOR_COVER_LETTER,
            'auto_generate_cover_letter' => self::DEFAULT_AUTO_GENERATE_COVER_LETTER,
            'easy_apply_only' => self::DEFAULT_EASY_APPLY_ONLY,
            'pause_on_external_apply' => self::DEFAULT_PAUSE_ON_EXTERNAL_APPLY,
        ];
    }

    /**
     * @return list<string>
     */
    private static function booleanKeys(): array
    {
        return [
            'pause_before_submit',
            'stop_for_cover_letter',
            'auto_generate_cover_letter',
            'easy_apply_only',
            'pause_on_external_apply',
        ];
    }

    /**
     * @param  array<string, mixed>|null  $settings
     * @return array{
     *     phone_country_code: string,
     *     phone_extension: string,
     *     years_of_experience: string,
     *     expected_salary_weekly: string,
     *     expected_salary_monthly: string,
     *     expected_salary_yearly: string,
     *     visa_sponsorship: string,
     *     legally_authorized: string,
     *     affirm_local_commute: string,
     *     affirm_local_hybrid: string,
     *     willing_to_relocate: string,
     *     drivers_license: string,
     *     notice_period: string,
     *     job_preferences: string,
     *     job_blacklist: string,
     *     pause_before_submit: bool,
     *     timing_level: int,
     *     stop_for_cover_letter: bool,
     *     auto_generate_cover_letter: bool,
     *     easy_apply_only: bool,
     *     pause_on_external_apply: bool,
     * }
     */
    public static function merge(?array $settings): array
    {
        $merged = self::defaults();

        if (! is_array($settings)) {
            return $merged;
        }

        $booleanKeys = self::booleanKeys();

        foreach (array_keys($merged) as $key) {
            if (! array_key_exists($key, $settings)) {
                continue;
            }

            $value = $settings[$key];

            if (in_array($key, $booleanKeys, true)) {
                if (is_bool($value)) {
                    $merged[$key] = $value;
                }

                continue;
            }

            if ($key === 'timing_level') {
                $merged[$key] = self::normalizeTimingLevel($value);

                continue;
            }

            if (is_string($value) || is_numeric($value)) {
                $merged[$key] = (string) $value;
            }
        }

        return $merged;
    }

    public static function normalizeTimingLevel(mixed $value): int
    {
        if (! is_int($value) && ! (is_string($value) && ctype_digit($value))) {
            return self::DEFAULT_TIMING_LEVEL;
        }

        $parsed = (int) $value;

        return max(self::MIN_TIMING_LEVEL, min(self::MAX_TIMING_LEVEL, $parsed));
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
            'application_settings.phone_extension' => ['nullable', 'string', 'max:32'],
            'application_settings.years_of_experience' => ['nullable', 'string', 'max:3'],
            'application_settings.expected_salary_weekly' => ['nullable', 'string', 'max:100'],
            'application_settings.expected_salary_monthly' => ['nullable', 'string', 'max:100'],
            'application_settings.expected_salary_yearly' => ['nullable', 'string', 'max:100'],
            'application_settings.visa_sponsorship' => ['nullable', 'in:yes,no'],
            'application_settings.legally_authorized' => ['nullable', 'in:yes,no'],
            'application_settings.affirm_local_hybrid' => ['nullable', 'in:yes,no'],
            'application_settings.affirm_local_commute' => ['nullable', 'in:yes,no'],
            'application_settings.willing_to_relocate' => ['nullable', 'in:yes,no'],
            'application_settings.drivers_license' => ['nullable', 'in:yes,no'],
            'application_settings.notice_period' => ['nullable', 'string', 'max:100'],
            'application_settings.job_preferences' => ['nullable', 'string', 'max:5000'],
            'application_settings.job_blacklist' => ['nullable', 'string', 'max:5000'],
            'application_settings.pause_before_submit' => ['nullable', 'boolean'],
            'application_settings.timing_level' => [
                'nullable',
                'integer',
                'min:'.self::MIN_TIMING_LEVEL,
                'max:'.self::MAX_TIMING_LEVEL,
            ],
            'application_settings.stop_for_cover_letter' => ['nullable', 'boolean'],
            'application_settings.auto_generate_cover_letter' => ['nullable', 'boolean'],
            'application_settings.easy_apply_only' => ['nullable', 'boolean'],
            'application_settings.pause_on_external_apply' => ['nullable', 'boolean'],
        ];
    }
}
