<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Synthetic public analytics
    |--------------------------------------------------------------------------
    |
    | Vanity increments for the public /analytics page. Stored in
    | autofill_synthetic_daily_stats and merged with real AutofillDailyStat
    | totals - never creates fake users or applications.
    |
    */

    'synthetic_hourly_enabled' => true,

    'synthetic_answers_per_hour_min' => 0,
    'synthetic_answers_per_hour_max' => 5,

    'synthetic_extension_questions_per_hour_min' => 0,
    'synthetic_extension_questions_per_hour_max' => 2,

    /*
     * CV parses are rarer than answers. Each hour has this chance (0-1) of
     * recording one synthetic parse when the hourly job runs.
     */
    'synthetic_cvs_parsed_hourly_chance' => 0.12,

    'synthetic_backfill_days' => 30,

    /*
    |--------------------------------------------------------------------------
    | Google Analytics (gtag.js)
    |--------------------------------------------------------------------------
    |
    | Measurement ID injected on every Inertia page via the root Blade layout.
    | SPA pageviews are sent from resources/js/lib/googleAnalytics.ts.
    | Leave empty to disable the tag.
    |
    | Consent UI categories and localStorage key live in
    | resources/js/lib/cookieConsent.ts (Pinia store + modal). Blade sets
    | Consent Mode defaults to denied; the store updates gtag on Accept/Save.
    |
    */

    'google_analytics_id' => 'G-XXET6H4VM1',

    /*
    |--------------------------------------------------------------------------
    | Google Ads (gtag.js conversion tags)
    |--------------------------------------------------------------------------
    |
    | Native website conversion actions for Ads attribution. Labels come from
    | conversionActions/7692708224 (sign-up) and 7692708227 (purchase).
    | Leave google_ads_id empty to disable the AW config + conversion pings.
    |
    */

    'google_ads_id' => 'AW-18219075665',

    'google_ads_conversions' => [
        'sign_up' => 'AW-18219075665/xFpFCIDTldQcENGQxO9D',
        'purchase' => 'AW-18219075665/_yFvCIPTldQcENGQxO9D',
    ],

];
