<?php

$platformFeature = 'Major ATS and career sites (Workday, Greenhouse, Lever, Ashby, and more)';
$antiBotFeature = 'Anti-bot detection - human-like typing, pauses, and LinkedIn navigation';

return [

    'default_tier' => 'free',

    'tiers' => [
        'free' => [
            'name' => 'Free',
            'description' => 'Get started with extension AI credits on supported job sites.',
            'price_pence' => 0,
            'monthly_credits' => 250,
            'available' => true,
            'features' => [
                '250 extension credits per month',
                $platformFeature,
                $antiBotFeature,
            ],
        ],
        'starter' => [
            'name' => 'Starter',
            'description' => 'For active job hunters applying regularly.',
            'price_pence' => 700,
            'monthly_credits' => 2500,
            'available' => true,
            'features' => [
                '2,500 extension credits per month',
                $platformFeature,
                $antiBotFeature,
            ],
        ],
        'pro' => [
            'name' => 'Pro',
            'description' => 'High-volume AI usage for intensive application campaigns.',
            'price_pence' => 1700,
            'monthly_credits' => 15000,
            'available' => true,
            'features' => [
                '15,000 extension credits per month',
                $platformFeature,
                $antiBotFeature,
            ],
        ],
    ],

];
