<?php

return [

    'default_tier' => 'free',

    'tiers' => [
        'free' => [
            'name' => 'Free',
            'description' => 'CV parsing and extension autofill with a starter monthly allowance.',
            'price_pence' => 0,
            'monthly_tokens' => 10_000,
        ],
        'standard' => [
            'name' => 'Standard',
            'description' => 'For regular applications with room for re-parsing and updates.',
            'price_pence' => 900,
            'monthly_tokens' => 100_000,
        ],
        'pro' => [
            'name' => 'Pro',
            'description' => 'Heavy monthly usage for active job hunters.',
            'price_pence' => 1900,
            'monthly_tokens' => 500_000,
        ],
        'power' => [
            'name' => 'Power',
            'description' => 'Maximum AI capacity for intensive application campaigns.',
            'price_pence' => 4900,
            'monthly_tokens' => 2_000_000,
        ],
    ],

];
