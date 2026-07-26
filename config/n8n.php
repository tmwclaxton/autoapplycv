<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Signup webhook
    |--------------------------------------------------------------------------
    |
    | Notifies n8n when a new user registers. Soft-fails when the token is
    | unset. Auth uses Header Auth: Authorization Bearer {N8N_TOKEN}.
    |
    */

    'signup_webhook_url' => 'https://tmwclaxton.app.n8n.cloud/webhook/autocvapply-signup',

    'token' => env('N8N_TOKEN'),

];
