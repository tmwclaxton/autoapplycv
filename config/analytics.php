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

];
