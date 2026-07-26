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
    | Competitor comparison posts (blog:seed-competitor-comparisons)
    |--------------------------------------------------------------------------
    |
    | Curated bodies ship by default. Optional --ai / --refresh-research use
    | NanoGPT + Firecrawl scrapes of homepage/pricing/features (and extras).
    |
    */
    'comparisons' => [
        'scrape_max_markdown_chars' => 12000,
        'ai_timeout' => 120,
        'extra_paths' => [
            // Optional extra scrape paths per comparison id (relative or absolute).
            'loopcv' => ['autoapply', 'help'],
            'simplify' => ['copilot', 'install'],
            'autoapplymax' => ['#demo'],
        ],
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
            'blog.loopcv.pro',
            'lazyapply.com',
            'sonara.ai',
            'autojob.io',
            'jobright.ai',
            'jobwizard.ai',
            'simplify.jobs',
            'massapply.com',
            'applyall.com',
            'tealdohr.com',
            'tealhq.com',
            'aiapply.co',
            'easy-apply-automater.com',
            'autoapplymax.com',
            'easyapplymax.com',
            'applyglide.com',
            'huntr.co',
            'usemassive.com',
            'massivjobs.com',
            'kickresume.com',
            'wonsulting.com',
            'careerflow.ai',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Competitor topic import (inspiration only - never republish their copy)
    |--------------------------------------------------------------------------
    |
    | Competitor blog roots were discovered from AutoApplyMax footer Compare
    | links (directory only - AutoApplyMax content is not scraped) plus the
    | explicit LoopCV blog at https://blog.loopcv.pro/.
    |
    | Skipped (no usable public blog): LazyApply, ApplyGlide, Massive.
    |
    | Run order:
    | 1. php artisan blog:import-competitor-topics --refresh-manifest --limit=10
    | 2. Spot-check 2-3 drafts (title variety, length, no competitor brand, honesty)
    | 3. php artisan blog:publish --limit=10
    | 4. php artisan blog:expand-published --skip-image  (once for legacy live posts)
    | 5. Weekly schedule: blog:generate --length=long
    |
    | Prefer hero images on (omit --skip-image) unless NanoGPT rate limits force staging.
    |
    */
    'import' => [
        'manifest_disk' => 'local',
        'manifest_path' => 'blog-imports/competitor-manifest.json',
        'scrape_max_markdown_chars' => 24000,
        'default_length' => 'pillar',
        'sitemap_max_nested_fetches' => 40,
        'index_max_pages' => 8,

        /*
         * Directory-only reference (not scraped for republication).
         * AutoApplyMax footer Compare links used to discover competitors below.
         */
        'directory' => [
            'host' => 'autoapplymax.com',
            'compare_paths' => [
                '/compare/autoapplymax-vs-lazyapply',
                '/compare/autoapplymax-vs-simplify',
                '/compare/autoapplymax-vs-loopcv',
                '/compare/autoapplymax-vs-applyglide',
                '/compare/autoapplymax-vs-jobcopilot',
                '/compare/autoapplymax-vs-huntr',
                '/compare/autoapplymax-vs-sonara',
                '/compare/autoapplymax-vs-teal',
                '/compare/autoapplymax-vs-massive',
                '/compare/autoapplymax-vs-wonsulting',
                '/compare/autoapplymax-vs-kickresume',
                '/compare/autoapplymax-vs-careerflow',
            ],
        ],

        'sources' => [
            [
                'id' => 'loopcv',
                'name' => 'LoopCV',
                'enabled' => true,
                'sitemap_urls' => [
                    'https://blog.loopcv.pro/sitemap-posts.xml',
                ],
                'index_urls' => [],
                'host_suffixes' => ['blog.loopcv.pro'],
                'path_regex' => '#^/[a-z0-9][a-z0-9-]{2,}/?$#i',
                'exclude_path_regexes' => [
                    '#^/(tag|author|page|newsletter|fr|es|pt|tr|gr|ghost)(/|$)#i',
                ],
                'brand_names' => ['LoopCV', 'Loopcv', 'loopcv.pro', 'loopcv.com'],
            ],
            [
                'id' => 'simplify',
                'name' => 'Simplify',
                'enabled' => true,
                'sitemap_urls' => [
                    'https://simplify.jobs/blog/sitemap/posts.xml',
                ],
                'index_urls' => [],
                'host_suffixes' => ['simplify.jobs'],
                'path_regex' => '#^/blog/[^/]+/?$#',
                'exclude_path_regexes' => [],
                'brand_names' => ['Simplify Jobs', 'Simplify.jobs', 'Simplify'],
            ],
            [
                'id' => 'huntr',
                'name' => 'Huntr',
                'enabled' => true,
                'sitemap_urls' => [
                    'https://huntr.co/sitemap.xml',
                ],
                'index_urls' => [],
                'host_suffixes' => ['huntr.co'],
                'path_regex' => '#^/blog/[^/]+/?$#',
                'exclude_path_regexes' => [],
                'brand_names' => ['Huntr', 'huntr.co'],
            ],
            [
                'id' => 'jobcopilot',
                'name' => 'JobCopilot',
                'enabled' => true,
                'sitemap_urls' => [
                    'https://jobcopilot.com/post-sitemap.xml',
                ],
                'index_urls' => [],
                'host_suffixes' => ['jobcopilot.com'],
                'path_regex' => '#^/[a-z0-9][a-z0-9-]{2,}/?$#i',
                'exclude_path_regexes' => [
                    '#^/(de|es|pt|it|nl|fr)(/|$)#i',
                    '#^/(resources|page|category|tag|author)(/|$)#i',
                    '#^/(automate-[a-z0-9-]+-job-applications|how-to-automate-[a-z0-9-]+-job-applications)/?$#i',
                ],
                'brand_names' => ['JobCopilot', 'Job Copilot', 'jobcopilot.com'],
            ],
            [
                'id' => 'wonsulting',
                'name' => 'Wonsulting',
                'enabled' => true,
                'sitemap_urls' => [
                    'https://www.wonsulting.com/sitemap.xml',
                ],
                'index_urls' => [],
                'host_suffixes' => ['wonsulting.com'],
                'path_regex' => '#^/blog/[^/]+/?$#',
                'exclude_path_regexes' => [],
                'brand_names' => ['Wonsulting', 'WonsultingAI', 'wonsulting.com'],
            ],
            [
                'id' => 'careerflow',
                'name' => 'Careerflow',
                'enabled' => true,
                'sitemap_urls' => [
                    'https://www.careerflow.ai/sitemap.xml',
                ],
                'index_urls' => [],
                'host_suffixes' => ['careerflow.ai'],
                'path_regex' => '#^/blog/[^/]+/?$#',
                'exclude_path_regexes' => [
                    '#^/blog-categories(/|$)#i',
                ],
                'brand_names' => ['Careerflow', 'CareerFlow', 'careerflow.ai'],
            ],
            [
                'id' => 'kickresume',
                'name' => 'Kickresume',
                'enabled' => true,
                'sitemap_urls' => [],
                'index_urls' => [
                    'https://www.kickresume.com/en/blog/',
                    'https://www.kickresume.com/en/blog/?page=2',
                    'https://www.kickresume.com/en/blog/?page=3',
                    'https://www.kickresume.com/en/blog/?page=4',
                ],
                'host_suffixes' => ['kickresume.com'],
                'path_regex' => '#^/en/blog/[^/]+/?$#',
                'exclude_path_regexes' => [],
                'brand_names' => ['Kickresume', 'kickresume.com'],
            ],
            [
                'id' => 'sonara',
                'name' => 'Sonara',
                'enabled' => true,
                'sitemap_urls' => [],
                'index_urls' => [
                    'https://www.sonara.ai/blog',
                    'https://www.sonara.ai/blog/page/2',
                    'https://www.sonara.ai/blog/page/3',
                    'https://www.sonara.ai/blog/page/4',
                ],
                'host_suffixes' => ['sonara.ai'],
                'path_regex' => '#^/blog/[^/]+/?$#',
                'exclude_path_regexes' => [
                    '#^/blog/page(/|$)#i',
                ],
                'brand_names' => ['Sonara', 'Sonara.ai', 'sonara.ai'],
            ],
            [
                'id' => 'teal',
                'name' => 'Teal',
                'enabled' => true,
                'sitemap_urls' => [],
                'index_urls' => [
                    'https://www.tealhq.com/career-hub',
                    'https://www.tealhq.com/category/job-search',
                    'https://www.tealhq.com/category/resumes',
                    'https://www.tealhq.com/category/cover-letters',
                ],
                'host_suffixes' => ['tealhq.com'],
                'path_regex' => '#^/post/[^/]+/?$#',
                'exclude_path_regexes' => [],
                'brand_names' => ['Teal HQ', 'TealHQ', 'Teal', 'tealhq.com'],
            ],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | SEO keyword strategy (weekly blog:generate)
    |--------------------------------------------------------------------------
    |
    | Search-intent pillars (AutoApplyMax-style): titles earn the Google click;
    | AutoCVApply appears in body/CTA, not jammed into every title.
    |
    */
    'seo' => [

        'supporting_keywords_per_post' => [2, 4],

        'default_generate_length' => 'long',

        'brand_terms' => [
            'AutoCVApply',
            'autocvapply',
            'autocvapply.com',
            'AutoCVApply Chrome extension',
        ],

        'primary_keywords' => [
            'how to auto apply on LinkedIn',
            'auto apply jobs chrome extension',
            'autofill job applications',
            'LinkedIn Easy Apply',
            'Indeed Apply UK',
            'Workday application form',
            'ATS resume tips',
            'job application burnout',
            'best autofill chrome extension',
        ],

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

        'title_styles' => [
            [
                'id' => 'query-led',
                'label' => 'Search-query led',
                'hint' => 'Write the title as a Google query people type. Year stamp (2026) is fine. Brand optional / rare.',
                'example' => 'How to Auto Apply on LinkedIn Easy Apply (2026)',
            ],
            [
                'id' => 'comparison',
                'label' => 'Comparison',
                'hint' => 'X vs Y or "Best … for …" roundups. Stay honest; do not invent competitor features.',
                'example' => 'Indeed Apply vs LinkedIn Easy Apply for UK job seekers',
            ],
            [
                'id' => 'numbered-specific',
                'label' => 'Numbered and specific',
                'hint' => 'Number + concrete object (tools, mistakes, boards) - not vague "ways to save time".',
                'example' => '7 autofill Chrome extensions for job applications (2026)',
            ],
            [
                'id' => 'situation-hook',
                'label' => 'Situation hook',
                'hint' => 'Lead with the reader problem, then the useful answer. Parenthetical hooks are fine.',
                'example' => 'Job application burnout: when volume stops working',
            ],
            [
                'id' => 'board-or-ats',
                'label' => 'Board or ATS first',
                'hint' => 'Lead with LinkedIn, Indeed, Workday, Greenhouse, or another real platform.',
                'example' => 'Workday application forms: how to stop retyping your CV',
            ],
            [
                'id' => 'question',
                'label' => 'Reader question',
                'hint' => 'Frame as a real question a job seeker would type into Google.',
                'example' => 'What is an ATS and why does it reject CVs?',
            ],
            [
                'id' => 'myth-contrast',
                'label' => 'Myth or contrast',
                'hint' => 'Bust a myth or contrast two modes (board Auto Apply vs ATS user-submit).',
                'example' => 'Autofill is not a silent job bot',
            ],
        ],

        'topics_to_avoid' => [
            'Guarantees of interviews, offers, or salary outcomes',
            'Black-hat ATS keyword stuffing or "hack the ATS" advice',
            'Fake customer counts, success rates, or employer partnerships',
            'Competitor hit pieces or thin affiliate roundups that invent features',
            'Republishing or closely paraphrasing a competitor blog post',
            'Citing AutoApplyMax, EasyApplyMax, or their Chrome Web Store listing as a source or hero product',
            'Claiming AutoCVApply submits ATS/career-site applications without the user',
            'Implying Auto Apply runs without the user starting them from the extension',
            'Unrelated lifestyle or newsjacking with no practical job-search value',
            'Writing localhost, staging, or non-production URLs',
        ],

        'thin_content_rules' => [
            'Write a long, practical SEO article (respect the length preset - default long/pillar).',
            'Include a TL;DR of 3-5 concrete steps near the bottom (after the main sections, before FAQ).',
            'Include a when-it-is-worth-it / when-it-is-not section when the topic is automation or volume applying.',
            'End with an FAQ (3-5 Q&As) and a soft AutoCVApply CTA - not a hard sell in the title.',
            'Product surfaces (AutoFill, Draft All, Auto Apply) belong in the body and CTA; titles should earn the search click first.',
            'Do not invent features, supported boards, stats, or pricing beyond the research brief.',
            'H2s should map to real reader questions or workflow steps.',
            'Link only to https://autocvapply.com paths or the official Chrome Web Store listing for the product.',
        ],

        'clusters' => [

            [
                'id' => 'linkedin-auto-apply',
                'weight' => 3,
                'primary' => 'how to auto apply on LinkedIn',
                'supporting' => [
                    'LinkedIn Easy Apply',
                    'LinkedIn auto apply chrome extension',
                    'Easy Apply screening questions',
                    'auto apply jobs LinkedIn 2026',
                ],
                'angle_hints' => [
                    'Search-intent how-to: filters, caps, screening questions, safety',
                    'Soft CTA: AutoCVApply Auto Apply sidebar - user starts the run',
                ],
                'must_cover' => [
                    'Explain Easy Apply vs external ATS redirects',
                    'Describe a safe, user-started Auto Apply workflow',
                    'Cover screening questions and human review',
                    'Contrast board Auto Apply with ATS sites where the user submits',
                ],
            ],

            [
                'id' => 'autofill-extensions-comparison',
                'weight' => 3,
                'primary' => 'best autofill chrome extension for job applications',
                'supporting' => [
                    'auto apply jobs chrome extension',
                    'job application autofill tools',
                    'chrome extension fill job forms',
                ],
                'angle_hints' => [
                    'Comparison / roundup tone; honest criteria (boards, review control, pricing)',
                    'Position AutoCVApply as one option with clear differentiators',
                ],
                'must_cover' => [
                    'Define what good autofill/auto-apply tools do',
                    'Call out Auto Apply boards vs ATS user-submit honesty',
                    'Mention profile-once workflow without inventing competitor feature tables',
                    'Soft CTA to try AutoCVApply',
                ],
            ],

            [
                'id' => 'indeed-uk-boards',
                'weight' => 3,
                'primary' => 'Indeed Apply UK',
                'supporting' => [
                    'Totaljobs Quick Apply',
                    'Reed Easy Apply',
                    'Glassdoor Easy Apply',
                    'UK job board auto apply',
                ],
                'angle_hints' => [
                    'UK board coverage and how Auto Apply differs per board',
                    'Multi-platform search strategy',
                ],
                'must_cover' => [
                    'Name Indeed plus at least two of Totaljobs, Glassdoor, Reed',
                    'Explain user-launched Auto Apply on those boards',
                    'Note profile quality still matters',
                    'Soft CTA to AutoCVApply sidebar Auto Apply',
                ],
            ],

            [
                'id' => 'ats-workday-forms',
                'weight' => 2,
                'primary' => 'Workday application form',
                'supporting' => [
                    'Greenhouse job application',
                    'ATS form autofill',
                    'employer career site application',
                ],
                'angle_hints' => [
                    'Long multi-step ATS forms; AutoFill + Draft All; user submits',
                ],
                'must_cover' => [
                    'Name Workday and at least one other ATS',
                    'Explain user still clicks Submit on ATS sites',
                    'Recommend a clean profile before a busy week',
                    'Soft CTA to AutoFill / Draft All',
                ],
            ],

            [
                'id' => 'autofill-job-applications',
                'weight' => 2,
                'primary' => 'autofill job applications',
                'supporting' => [
                    'autofill job application forms',
                    'chrome extension autofill CV',
                    'upload once apply everywhere',
                ],
                'angle_hints' => [
                    'Practical how-to for autofill without title brand stuffing',
                ],
                'must_cover' => [
                    'Upload CV and edit profile once',
                    'Use AutoFill on a real form',
                    'ATS user-submit honesty',
                    'Soft CTA with credits mentioned at high level',
                ],
            ],

            [
                'id' => 'resume-cv-uk',
                'weight' => 2,
                'primary' => 'ATS resume tips',
                'supporting' => [
                    'CV parser for job applications',
                    'tailor CV for job description',
                    'UK CV format',
                ],
                'angle_hints' => [
                    'Resume/CV SEO content with soft product CTA to upload/parse',
                ],
                'must_cover' => [
                    'Practical CV/ATS advice without black-hat stuffing',
                    'How a clean parsed profile helps later autofill',
                    'Soft CTA to free CV upload on AutoCVApply',
                ],
            ],

            [
                'id' => 'job-search-strategy',
                'weight' => 2,
                'primary' => 'job application burnout',
                'supporting' => [
                    'how many jobs to apply to per day',
                    'job search strategy UK',
                    'application fatigue',
                ],
                'angle_hints' => [
                    'Strategy / wellbeing / volume applying - product as one lever, not the whole article',
                ],
                'must_cover' => [
                    'When high volume helps vs when targeted applications win',
                    'Practical recovery or pacing tips',
                    'Soft CTA to reduce repetitive form work with AutoCVApply',
                ],
            ],

            [
                'id' => 'draft-all-screening',
                'weight' => 2,
                'primary' => 'AI answers screening questions',
                'supporting' => [
                    'Draft All job applications',
                    'screening questions job application',
                    'why do you want this role answer',
                ],
                'angle_hints' => [
                    'Screening-question fatigue; Draft All with human review',
                ],
                'must_cover' => [
                    'Define Draft All and profile grounding',
                    'Human review before submit',
                    'Pair with AutoFill for structured fields',
                    'Credits note at high level',
                ],
            ],

            [
                'id' => 'ats-score-cover-letter',
                'weight' => 1,
                'primary' => 'ATS score CV against job description',
                'supporting' => [
                    'cover letter for job applications',
                    'match CV to job posting',
                ],
                'angle_hints' => [
                    'Fit scoring and cover letters as gates before spending credits',
                ],
                'must_cover' => [
                    'Scores prioritise; they do not guarantee interviews',
                    'Cover letters need human review',
                    'Soft CTA to AutoCVApply tools',
                ],
            ],

            [
                'id' => 'competitor-comparisons',
                'weight' => 2,
                'primary' => 'AutoCVApply vs autofill chrome extension',
                'supporting' => [
                    'best auto apply jobs chrome extension',
                    'LazyApply alternative',
                    'Simplify jobs alternative',
                    'AutoApplyMax alternative',
                ],
                'angle_hints' => [
                    'Criteria-based vs posts; honest Auto Apply boards vs ATS submit',
                ],
                'must_cover' => [
                    'Use evaluation criteria not invented competitor matrices',
                    'Name AutoCVApply board Auto Apply coverage',
                    'Keep ATS user-submit honesty',
                    'Soft CTA to try Free credits',
                ],
            ],

        ],

    ],

];
