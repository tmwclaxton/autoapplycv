<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Discord application (public)
    |--------------------------------------------------------------------------
    |
    | Used for invite links and footer badges. Bot token stays in .env only.
    |
    */

    'application_id' => '1523097041209921706',

    'invite_url' => env('DISCORD_INVITE_URL', 'https://discord.gg/DqqqTv3Spt'),

    'guild_id' => env('DISCORD_GUILD_ID'),

    'updates_channel_id' => '1523103313531240568',

    /*
    |--------------------------------------------------------------------------
    | Incoming webhook (new-user notifications)
    |--------------------------------------------------------------------------
    |
    | When unset, new-user Discord posts are skipped. Never include PII in
    | webhook payloads - message text is aggregate-safe only.
    |
    */

    'webhook_url' => env('DISCORD_WEBHOOK_URL'),

    'new_user_message' => 'New user joined AutoCVApply',

    'portal' => [
        'terms_url' => 'https://autocvapply.com/terms',
        'privacy_url' => 'https://autocvapply.com/privacy',
    ],

];
