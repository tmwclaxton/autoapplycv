<?php

return [

    'hero_image_disk' => env('BLOG_HERO_IMAGE_DISK', 'public'),

    'hero_image_path_prefix' => 'blogs/heroes',

    'generate' => [
        'max_attempts_per_step' => 3,
        'plan_timeout_seconds' => 90,
        'section_timeout_seconds' => 120,
    ],

    /*
    |--------------------------------------------------------------------------
    | SEO keyword strategy (weekly blog:generate)
    |--------------------------------------------------------------------------
    |
    | Stable product defaults for AutoCVApply content targeting. Each generated
    | post picks one cluster (weighted), then 2-4 supporting keywords from that
    | cluster. Avoids clusters already reflected in recent titles/tags when possible.
    |
    */
    'seo' => [

        'supporting_keywords_per_post' => [2, 4],

        'brand_terms' => [
            'AutoCVApply',
            'autocvapply',
            'autocvapply.com',
            'AutoCVApply Chrome extension',
        ],

        'primary_keywords' => [
            'autofill job applications',
            'auto apply jobs chrome extension',
            'LinkedIn Easy Apply chrome extension',
            'Indeed Apply autofill',
            'CV autofill chrome extension',
            'autofill job application forms',
            'Draft All job applications',
            'Workday application autofill',
        ],

        'topics_to_avoid' => [
            'Guarantees of interviews, offers, or salary outcomes',
            'Black-hat ATS keyword stuffing or "hack the ATS" advice',
            'Fake customer counts, success rates, or employer partnerships',
            'Competitor hit pieces or thin affiliate roundups',
            'Generic career advice with no AutoCVApply product angle',
            'Claiming AutoCVApply submits ATS/career-site applications without the user',
            'Implying Auto Apply runs without the user starting them from the extension',
            'Unrelated lifestyle, newsjacking, or keyword-only posts with no practical value',
        ],

        'thin_content_rules' => [
            'Every post must teach a concrete job-seeker workflow tied to AutoCVApply features.',
            'Do not write under ~450 words of substance (respect the chosen length preset).',
            'Do not repeat the primary keyword in every paragraph; prefer natural variants.',
            'Do not invent features, supported boards, or pricing beyond the research brief.',
            'H2s should map to real reader questions, not keyword lists.',
        ],

        'clusters' => [

            [
                'id' => 'autofill-job-applications',
                'weight' => 3,
                'primary' => 'autofill job applications',
                'supporting' => [
                    'autofill job application forms',
                    'chrome extension autofill CV',
                    'one click autofill job forms',
                    'stop retyping CV details',
                    'upload once apply everywhere',
                ],
                'angle_hints' => [
                    'Time saved and fewer typos when the same profile fills many forms',
                    'How metering works (one autofill = one filled input)',
                ],
            ],

            [
                'id' => 'linkedin-easy-apply',
                'weight' => 3,
                'primary' => 'LinkedIn Easy Apply chrome extension',
                'supporting' => [
                    'LinkedIn Easy Apply autofill',
                    'auto apply LinkedIn jobs',
                    'LinkedIn job application assistant',
                    'Easy Apply screening questions',
                ],
                'angle_hints' => [
                    'Sidebar Auto Apply: search, open, fill, review, submit on Easy Apply',
                    'Stay in control - user starts the run from the extension',
                ],
            ],

            [
                'id' => 'indeed-uk-job-boards',
                'weight' => 3,
                'primary' => 'Indeed Apply autofill',
                'supporting' => [
                    'Totaljobs Quick Apply extension',
                    'Reed Easy Apply autofill',
                    'Glassdoor Easy Apply chrome extension',
                    'UK job board auto apply',
                    'auto apply jobs chrome extension',
                ],
                'angle_hints' => [
                    'UK board coverage: Indeed, Totaljobs, Glassdoor, Reed alongside LinkedIn',
                    'Draft All vs full Auto Apply on supported boards',
                ],
            ],

            [
                'id' => 'ats-employer-autofill',
                'weight' => 2,
                'primary' => 'Workday application autofill',
                'supporting' => [
                    'Greenhouse job application autofill',
                    'Lever application form filler',
                    'ATS form autofill chrome extension',
                    'employer career site autofill',
                    'Ashby SmartRecruiters autofill',
                ],
                'angle_hints' => [
                    'On ATS sites: autofill and Draft All fill fields; user reviews and submits',
                    'Workday-heavy employers and long multi-step forms',
                ],
            ],

            [
                'id' => 'draft-all-screening',
                'weight' => 2,
                'primary' => 'Draft All job applications',
                'supporting' => [
                    'AI answers screening questions',
                    'draft job application answers from CV',
                    'human tone job application answers',
                    'autofill screening questions chrome extension',
                ],
                'angle_hints' => [
                    'Draft All stamps an application then user reviews before submit',
                    'Answers grounded in the saved profile, not generic filler',
                ],
            ],

            [
                'id' => 'cv-parse-profile',
                'weight' => 2,
                'primary' => 'CV parser for job applications',
                'supporting' => [
                    'upload CV autofill profile',
                    'parse CV to job application profile',
                    'AI CV extraction for applications',
                    'editable CV profile for autofill',
                ],
                'angle_hints' => [
                    'CV upload and profile editing are free; extension autofill is metered',
                    'Edit the parsed profile before trusting autofill',
                ],
            ],

            [
                'id' => 'auto-apply-workflow',
                'weight' => 2,
                'primary' => 'auto apply jobs chrome extension',
                'supporting' => [
                    'job application automation chrome extension',
                    'auto apply LinkedIn Indeed',
                    'high volume job applications faster',
                    'application fatigue job search',
                ],
                'angle_hints' => [
                    'Auto Apply is user-launched; not a silent bot',
                    'Free vs Starter vs Pro for search intensity',
                ],
            ],

            [
                'id' => 'ats-score-cover-letter',
                'weight' => 1,
                'primary' => 'ATS score CV against job description',
                'supporting' => [
                    'tailor CV keywords for job description',
                    'cover letter for job applications',
                    'match CV to job posting',
                    'job fit score for applications',
                ],
                'angle_hints' => [
                    'Use ATS/fit scoring as a gate before spending autofills on poor matches',
                    'Cover letters and tailored answers still need human review',
                ],
            ],

        ],

    ],

];
