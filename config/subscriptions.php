<?php

return [

    'default_tier' => 'free',

    'fair_use_cv_parses_per_month' => 20,

    'tiers' => [
        'free' => [
            'name' => 'Free',
            'description' => 'Upload your CV, edit your profile, and autofill applications on supported job sites.',
            'price_pence' => 0,
            'available' => true,
            'features' => [
                'Unlimited CV parsing',
                'Profile editing',
                'Unlimited extension autofill',
            ],
        ],
        'pro' => [
            'name' => 'Pro',
            'description' => 'Multiple CV profiles and more — coming soon.',
            'price_pence' => 700,
            'available' => false,
            'features' => [
                'Multiple CV profiles',
                'Everything in Free',
            ],
        ],
    ],

];
