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

    'nanogpt' => [
        'api_key' => env('NANOGPT_API_KEY'),
        'base_url' => env('NANOGPT_BASE_URL', 'https://nano-gpt.com/api/v1'),
        // Keep under typical reverse-proxy limits so clients get JSON 503/504 instead of opaque 502/499.
        'timeout' => 45,
        'connect_timeout' => 8,
        // Total HTTP attempts for idempotent chat completions on timeout/503/429.
        'retry_attempts' => 3,
        'retry_delay_ms' => [300, 900],
        'image_base_url' => env('NANOGPT_IMAGE_BASE_URL', 'https://nano-gpt.com/v1'),
        'image_model' => env('NANOGPT_IMAGE_MODEL', 'recraft-ai/recraft-v4.1/text-to-image'),
        'image_size' => env('NANOGPT_IMAGE_SIZE', '1024x576'),
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

];
