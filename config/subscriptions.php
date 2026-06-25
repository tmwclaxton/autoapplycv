<?php

return [

    'default_tier' => 'free',

    'tiers' => [
        'free' => [
            'name' => 'Free',
            'description' => 'Get started with extension autofill on supported job sites.',
            'price_pence' => 0,
            'monthly_autofills' => 250,
            'available' => true,
            'features' => [
                '250 extension autofills per month',
                'Workday, Indeed, LinkedIn, Greenhouse & Lever',
            ],
        ],
        'starter' => [
            'name' => 'Starter',
            'description' => 'For active job hunters applying regularly.',
            'price_pence' => 700,
            'monthly_autofills' => 2500,
            'available' => true,
            'features' => [
                '2,500 extension autofills per month',
                'Workday, Indeed, LinkedIn, Greenhouse & Lever',
            ],
        ],
        'pro' => [
            'name' => 'Pro',
            'description' => 'High-volume autofill for intensive application campaigns.',
            'price_pence' => 1700,
            'monthly_autofills' => 15000,
            'available' => true,
            'features' => [
                '15,000 extension autofills per month',
                'Workday, Indeed, LinkedIn, Greenhouse & Lever',
            ],
        ],
    ],

];
