<?php

return [

    'hero_image_disk' => env('BLOG_HERO_IMAGE_DISK', 'public'),

    'hero_image_path_prefix' => 'blogs/heroes',

    /*
    | Public marketing origin for links inside generated posts.
    | Kept separate from APP_URL so local Sail never writes localhost into content.
    */
    'public_site_url' => 'https://autocvapply.com',

    'generate' => [
        'max_attempts_per_step' => 3,
        'plan_timeout_seconds' => 90,
        'section_timeout_seconds' => 120,
        'firecrawl_search_limit' => 8,
    ],

    /*
    |--------------------------------------------------------------------------
    | Research source filtering (Firecrawl + persisted Blog sources)
    |--------------------------------------------------------------------------
    |
    | Persist a shortlist of reputable sources. Competitor Chrome Web Store
    | listings are always rejected; only the official AutoCVApply listing is kept.
    |
    */
    'sources' => [
        'target_min' => 3,
        'target_max' => 5,
        'min_before_broaden' => 2,
        'official_chrome_extension_id' => 'mldeodhhcbnhnjklmelneecjpjkjemih',
        'official_chrome_web_store_slug' => 'autocvapply',
        'official_chrome_web_store_url' => 'https://chromewebstore.google.com/detail/autocvapply/mldeodhhcbnhnjklmelneecjpjkjemih',
        'preferred_host_suffixes' => [
            'autocvapply.com',
            'linkedin.com',
            'indeed.com',
            'indeed.co.uk',
            'totaljobs.com',
            'reed.co.uk',
            'glassdoor.com',
            'glassdoor.co.uk',
            'cv-library.co.uk',
            'simplyhired.com',
            'gov.uk',
            'prospects.ac.uk',
            'targetjobs.co.uk',
            'theguardian.com',
            'bbc.co.uk',
            'harvard.edu',
            'forbes.com',
            'businessinsider.com',
            'workday.com',
            'greenhouse.io',
            'lever.co',
        ],

        /*
         * Competitor autofill / auto-apply product sites - never persist as Sources.
         * Chrome Web Store listings are handled separately (only official AutoCVApply allowed).
         */
        'blocked_host_suffixes' => [
            'jobcopilot.com',
            'loopcv.pro',
            'loopcv.com',
            'lazyapply.com',
            'sonara.ai',
            'autojob.io',
            'jobright.ai',
            'jobwizard.ai',
            'simplify.jobs',
            'massapply.com',
            'applyall.com',
            'tealdohr.com',
            'aiapply.co',
            'easy-apply-automater.com',
        ],
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
            'what is AutoCVApply',
            'autofill job applications',
            'auto apply jobs chrome extension',
            'LinkedIn Easy Apply chrome extension',
            'Indeed Apply autofill',
            'CV autofill chrome extension',
            'autofill job application forms',
            'Draft All job applications',
            'Workday application autofill',
        ],

        /*
         * Reject topic/title drafts that fall into this generic marketing mush.
         */
        'banned_title_phrases' => [
            'save time and reduce errors',
            'save time and cut errors',
            'save time and avoiding errors',
            'save time and',
            'saving time and',
            'save hours and cut errors',
            'save hours and',
            'cut errors',
            'reduce errors',
            'reducing errors',
            'avoiding errors',
            'streamlines uk job applications',
            'beginner\'s guide',
            'beginners guide',
            'step-by-step guide for uk',
            'for faster uk job hunting',
            'with ease',
            'effortlessly',
            'game-changer',
            'in today\'s competitive job market',
            'discover how',
            'safe smart and puts you in control',
        ],

        /*
         * Rotate title shapes so the blog index does not read as one template.
         * blog:generate picks one style that recent titles have not used.
         */
        'title_styles' => [
            [
                'id' => 'feature-first',
                'label' => 'Feature-first',
                'hint' => 'Lead with AutoFill, Draft All, Auto Apply, or CV parsing - not "Beginner\'s Guide".',
                'example' => 'Draft All for Easy Apply screening questions (then you review)',
            ],
            [
                'id' => 'board-or-ats',
                'label' => 'Board or ATS first',
                'hint' => 'Lead with LinkedIn, Indeed, Workday, Greenhouse, or another real platform.',
                'example' => 'LinkedIn Easy Apply from the Auto Apply sidebar',
            ],
            [
                'id' => 'workflow',
                'label' => 'Concrete workflow',
                'hint' => 'Describe the steps or outcome of the workflow without benefit slogans.',
                'example' => 'Upload a CV once, then AutoFill employer career-site forms',
            ],
            [
                'id' => 'question',
                'label' => 'Reader question',
                'hint' => 'Frame as a real question a job seeker would type into Google.',
                'example' => 'Can you Auto Apply on Indeed and still review every answer?',
            ],
            [
                'id' => 'contrast',
                'label' => 'Contrast',
                'hint' => 'Contrast two modes (board Auto Apply vs ATS user-submit) or myth vs reality.',
                'example' => 'Auto Apply on LinkedIn vs AutoFill on Workday: who clicks Submit?',
            ],
            [
                'id' => 'short-punchy',
                'label' => 'Short punchy',
                'hint' => 'Under ~70 characters. Specific noun phrase. Avoid trailing "with AutoCVApply".',
                'example' => 'Stop retyping your CV on every Workday form',
            ],
            [
                'id' => 'audience-situation',
                'label' => 'Situation-led',
                'hint' => 'Lead with a situation (between gigs, graduate volume) then the product move - not "save time".',
                'example' => 'Between contracts: one profile across employer portals',
            ],
            [
                'id' => 'numbered-specific',
                'label' => 'Numbered and specific',
                'hint' => 'Only if using a listicle. Number + concrete object (boards, steps, myths) - not vague "ways to save time".',
                'example' => '4 Easy Apply boards one Auto Apply sidebar can run end-to-end',
            ],
        ],

        'topics_to_avoid' => [
            'Guarantees of interviews, offers, or salary outcomes',
            'Black-hat ATS keyword stuffing or "hack the ATS" advice',
            'Fake customer counts, success rates, or employer partnerships',
            'Competitor hit pieces or thin affiliate roundups',
            'Generic career advice with no named AutoCVApply workflow (AutoFill, Draft All, or Auto Apply)',
            'Vague "save time and reduce errors" posts that never name product surfaces or boards',
            'Audience-only framing (graduates / career changers) without a specific product workflow',
            'Claiming AutoCVApply submits ATS/career-site applications without the user',
            'Implying Auto Apply runs without the user starting them from the extension',
            'Unrelated lifestyle, newsjacking, or keyword-only posts with no practical value',
            'Writing localhost, staging, or non-production URLs',
        ],

        'thin_content_rules' => [
            'Every post must teach a concrete job-seeker workflow that names AutoFill, Draft All, and/or Auto Apply.',
            'Name at least one real platform family (job-board Easy Apply OR an ATS such as Workday/Greenhouse).',
            'Do not write under ~450 words of substance (respect the chosen length preset).',
            'Do not repeat the primary keyword in every paragraph; prefer natural variants.',
            'Do not invent features, supported boards, or pricing beyond the research brief.',
            'H2s should map to real reader questions or workflow steps, not keyword lists.',
            'At least one section must walk through product steps a reader can do today.',
            'Link only to https://autocvapply.com paths or the official Chrome Web Store listing when citing the product.',
        ],

        'clusters' => [

            [
                'id' => 'what-is-autocvapply',
                'weight' => 2,
                'primary' => 'what is AutoCVApply',
                'supporting' => [
                    'AutoCVApply Chrome extension',
                    'upload once apply everywhere',
                    'job application autofill extension',
                    'Draft All Auto Apply explained',
                ],
                'angle_hints' => [
                    'Pillar explainer: what the product is, the three tools, free vs credits, what it is not',
                    'Link to pricing and how-to; keep control model honest',
                ],
                'must_cover' => [
                    'Define AutoCVApply as extension + web app for job seekers',
                    'Explain AutoFill, Draft All, and Auto Apply as three distinct tools',
                    'List supported Auto Apply boards and note ATS user-submit',
                    'Cover free profile upload vs monthly credits and Free/Starter/Pro',
                ],
            ],

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
                    'Profile once → AutoFill empty fields on ATS forms → user reviews and submits',
                    'Credits meter extension AI usage; CV upload/profile edit stay free',
                ],
                'must_cover' => [
                    'Upload CV once and edit the parsed profile before filling forms',
                    'Install/connect the Chrome extension and use AutoFill on a real application page',
                    'Explain that ATS/career-site fills still require the user to submit',
                    'Mention monthly credits at a high level without inventing per-action prices',
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
                    'Sidebar Auto Apply on LinkedIn Easy Apply: search, open, fill, review, submit',
                    'Draft All helps with Easy Apply screening questions before/during the run',
                ],
                'must_cover' => [
                    'User starts Auto Apply from the extension sidebar (not a silent bot)',
                    'Describe the LinkedIn Easy Apply loop: search → open → fill steps → submit',
                    'Contrast with ATS sites where the user still clicks Submit',
                    'Mention reviewing drafted screening answers before they go out',
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
                    'UK board Auto Apply: Indeed, Totaljobs, Glassdoor, Reed (plus LinkedIn)',
                    'Same sidebar Auto Apply model across boards; form steps differ by board',
                ],
                'must_cover' => [
                    'Name Indeed Apply plus at least two of Totaljobs, Glassdoor, Reed',
                    'Explain Auto Apply is user-launched end-to-end on those boards',
                    'Bust the myth that board autofill alone is enough without a reviewed profile',
                    'Keep competitor Chrome Web Store listings out of Sources',
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
                    'Long multi-step Workday/Greenhouse forms: AutoFill + Draft All, user submits',
                    'Why employer portals repeat the same CV fields',
                ],
                'must_cover' => [
                    'Name Workday and at least one of Greenhouse, Lever, Ashby, SmartRecruiters',
                    'Show AutoFill for structured fields and Draft All for free-text screeners',
                    'State clearly the user reviews and submits on ATS sites',
                    'Recommend editing the profile before a busy application week',
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
                    'Draft All for "Why this role?" and similar screeners, then human review',
                    'Answers grounded in the saved profile - reject generic AI filler',
                ],
                'must_cover' => [
                    'Define Draft All as AI drafts for unanswered free-text / screening questions',
                    'Stress profile grounding and human review before submit',
                    'Pair Draft All with AutoFill for structured fields',
                    'Note Draft All uses extension credits',
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
                    'CV upload + profile edit are free; credits apply to extension AI actions',
                    'Quality-control the parsed profile before AutoFill or Auto Apply',
                ],
                'must_cover' => [
                    'Walk through upload → AI extract → edit profile on the dashboard',
                    'Explain why a clean profile improves every later AutoFill/Draft All/Auto Apply run',
                    'State upload/profile editing are free on every plan',
                    'Link readers to get started at the production login URL',
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
                    'Design a weekly Auto Apply routine the user starts and monitors',
                    'Free vs Starter vs Pro credits for search intensity',
                ],
                'must_cover' => [
                    'Define Auto Apply as user-started sidebar automation on supported boards',
                    'Name LinkedIn and Indeed (and preferably Totaljobs/Glassdoor/Reed)',
                    'Contrast board Auto Apply with ATS user-submit fills',
                    'Cover credit tiers at Free / Starter / Pro without inventing extras',
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
                    'Use ATS/fit scoring before spending credits on weak-fit roles',
                    'Cover letters during Auto Apply still need human review',
                ],
                'must_cover' => [
                    'Explain fit/ATS scoring as a gate before applying',
                    'Mention cover letters can be generated in the extension during Auto Apply',
                    'Keep honest: scores help prioritise, they do not guarantee interviews',
                    'Tie scoring back to credits (ATS scores and cover letters spend credits)',
                ],
            ],

        ],

    ],

];
