<?php

return [

    'hero_image_disk' => env('BLOG_HERO_IMAGE_DISK', 'public'),

    'hero_image_path_prefix' => 'blogs/heroes',

    'generate' => [
        'max_attempts_per_step' => 3,
        'plan_timeout_seconds' => 90,
        'section_timeout_seconds' => 120,
    ],

];
