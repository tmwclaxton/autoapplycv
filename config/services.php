<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'workos' => [
        'client_id' => env('WORKOS_CLIENT_ID'),
        'secret' => env('WORKOS_API_KEY'),
        'redirect_url' => env('WORKOS_REDIRECT_URL'),
    ],

    'firecrawl' => [
        'api_key' => env('FIRECRAWL_API_KEY'),
        'base_url' => env('FIRECRAWL_API_URL', 'https://api.firecrawl.dev/v1'),
        'timeout' => (int) env('FIRECRAWL_TIMEOUT', 120),
    ],

    'nanogpt' => [
        'api_key' => env('NANOGPT_API_KEY'),
        'base_url' => env('NANOGPT_BASE_URL', 'https://nano-gpt.com/api/v1'),
        // Keep under typical reverse-proxy limits so clients get JSON 503/504 instead of opaque 502/499.
        'timeout' => 45,
        'connect_timeout' => 8,
        // Total HTTP attempts per model for idempotent chat completions on timeout/503/429.
        'retry_attempts' => 3,
        // Longer backoff for provider 503 / all_fallbacks_failed storms.
        'retry_delay_ms' => [7000, 7000],
        /*
         * After retries are exhausted for the requested model (e.g. HTTP 503
         * all_fallbacks_failed), retry the same payload with these models.
         * Entries starting with ":" replace the routing tier on the requested
         * model (only when it already has a tier like :ttfs). Absolute model
         * ids are tried as-is for every request.
         */
        'fallback_models' => [
            ':throughput',
            ':speed',
        ],
        'image_base_url' => env('NANOGPT_IMAGE_BASE_URL', 'https://nano-gpt.com/v1'),
        'image_model' => env('NANOGPT_IMAGE_MODEL', 'recraft-ai/recraft-v4.1/text-to-image'),
        'image_size' => env('NANOGPT_IMAGE_SIZE', '1024x576'),
        // Hard monthly NanoGPT credit budget (Europe/London calendar month).
        'monthly_spend_cap_gbp' => (float) env('NANOGPT_MONTHLY_SPEND_CAP_GBP', 50),
        // NanoGPT prices in USD; convert reported/estimated costs to GBP for the cap.
        'usd_to_gbp_rate' => (float) env('NANOGPT_USD_TO_GBP_RATE', 0.79),
        // Owner alert recipient; falls back to admin.allowed_emails[0] when unset.
        'spend_alert_email' => env('NANOGPT_SPEND_ALERT_EMAIL'),
        'spend_warning_thresholds' => [80, 100],
        // Used when image generation responses omit a cost field.
        'estimated_image_cost_usd' => (float) env('NANOGPT_ESTIMATED_IMAGE_COST_USD', 0.04),
        // Fallback USD rates per 1M tokens when the API does not report cost.
        'fallback_pricing' => [
            'prompt_per_million_usd' => 0.15,
            'completion_per_million_usd' => 0.60,
        ],
        'model_pricing' => [
            'openai/gpt-4.1-mini' => [
                'prompt_per_million_usd' => 0.40,
                'completion_per_million_usd' => 1.60,
            ],
            'google/gemini-3.1-flash-lite' => [
                'prompt_per_million_usd' => 0.10,
                'completion_per_million_usd' => 0.40,
            ],
            'deepseek/deepseek-v4-flash' => [
                'prompt_per_million_usd' => 0.14,
                'completion_per_million_usd' => 0.28,
            ],
        ],
    ],

    'gocardless' => [
        'access_token' => env('GOCARDLESS_ACCESS_TOKEN'),
        'webhook_secret' => env('GOCARDLESS_WEBHOOK_SECRET'),
        'environment' => env('GOCARDLESS_ENVIRONMENT'),
    ],

    'postal' => [
        'key' => env('POSTAL_API_KEY'),
        'base_url' => env('POSTAL_BASE_URL', 'https://postal.grantgunner.org'),
        'webhook_secret' => env('POSTAL_WEBHOOK_SECRET'),
    ],

    'anticaptcha' => [
        'key' => env('ANTICAPTCHA_KEY'),
        'base_url' => 'https://api.anti-captcha.com',
        'timeout' => 120,
    ],

    'twocaptcha' => [
        'key' => env('TWOCAPTCHA_KEY'),
        'base_url' => 'https://api.2captcha.com',
        'timeout' => 120,
    ],

];
