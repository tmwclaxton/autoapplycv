<?php

namespace App\Support;

/**
 * Public FAQ content for /faq.
 *
 * Stay inside AutoCVApplyBlogContext facts - no invented board lists or ban guarantees.
 */
class AutoCVApplyFaq
{
    /**
     * @return array<int, array{
     *     id: string,
     *     title: string,
     *     items: array<int, array{slug: string, question: string, paragraphs: array<int, string>, related: array<int, array{label: string, href: string}>}>
     * }>
     */
    public static function sections(): array
    {
        $site = AutoCVApplyBlogContext::siteUrl();
        $store = (string) config(
            'blog.sources.official_chrome_web_store_url',
            'https://chromewebstore.google.com/detail/autocvapply/mldeodhhcbnhnjklmelneecjpjkjemih',
        );
        $discord = 'https://discord.gg/DqqqTv3Spt';

        return [
            [
                'id' => 'general',
                'title' => 'General',
                'items' => [
                    [
                        'slug' => 'what-is-autocvapply',
                        'question' => 'What is AutoCVApply?',
                        'paragraphs' => [
                            'AutoCVApply is a Chrome and Firefox extension plus web app for job seekers. You upload a CV once, edit the parsed profile, then use AutoFill on ATS forms, Draft All for screening questions, and Auto Apply on supported job boards from the extension sidebar.',
                            'It is built for UK job seekers by default, but the same workflow helps anywhere those forms show up.',
                        ],
                        'related' => [
                            ['label' => 'About AutoCVApply', 'href' => $site.'/about'],
                            ['label' => 'How to get started', 'href' => $site.'/how-to'],
                        ],
                    ],
                    [
                        'slug' => 'is-autocvapply-free',
                        'question' => 'Is AutoCVApply free?',
                        'paragraphs' => [
                            'Yes - you can start on Free with no card. CV upload and profile editing are free on every plan. Free includes 1,500 extension credits per month for AI tools.',
                            'Starter (£7/mo) and Pro (£17/mo) raise the monthly credit allowance when you need more Draft All, Assist, cover letters, or ATS scores.',
                        ],
                        'related' => [
                            ['label' => 'See pricing', 'href' => $site.'/pricing'],
                        ],
                    ],
                    [
                        'slug' => 'which-platforms',
                        'question' => 'Which job platforms does AutoCVApply support?',
                        'paragraphs' => [
                            'Sidebar Auto Apply (end-to-end, user-started) works today on LinkedIn Easy Apply, Indeed Apply, Totaljobs Quick Apply, Glassdoor Easy Apply, and Reed Easy Apply. More boards are on the way.',
                            'On ATS and employer career sites (Workday, Greenhouse, Lever, Ashby, and many others), AutoFill and Draft All fill fields - you review and click Submit yourself.',
                        ],
                        'related' => [
                            ['label' => 'Platform details', 'href' => $site.'/how-to'],
                        ],
                    ],
                    [
                        'slug' => 'chrome-and-firefox',
                        'question' => 'Does AutoCVApply work on Mac and Windows?',
                        'paragraphs' => [
                            'Yes. Install the Chrome extension or Firefox add-on on any OS those browsers support (Windows, macOS, Linux, and ChromeOS for Chrome). Connect the extension with an API token from your dashboard after you upload a CV.',
                        ],
                        'related' => [
                            ['label' => 'Chrome Web Store', 'href' => $store],
                            ['label' => 'Install walkthrough', 'href' => $site.'/how-to'],
                        ],
                    ],
                    [
                        'slug' => 'source-available',
                        'question' => 'Is AutoCVApply open source?',
                        'paragraphs' => [
                            'The project is source-available on GitHub under the PolyForm Noncommercial License 1.0.0. Personal and non-commercial use is free; commercial use needs permission.',
                        ],
                        'related' => [
                            ['label' => 'About and licence', 'href' => $site.'/about'],
                        ],
                    ],
                ],
            ],
            [
                'id' => 'how-it-works',
                'title' => 'How it works',
                'items' => [
                    [
                        'slug' => 'how-autofill-works',
                        'question' => 'How does AutoFill work?',
                        'paragraphs' => [
                            'After you upload a PDF or Word CV, AutoCVApply extracts an editable profile. On an application page, AutoFill fills empty structured fields from that profile - contact, work history, education, and similar data.',
                            'Always review the page before you submit, especially on ATS career sites where you click Submit yourself.',
                        ],
                        'related' => [
                            ['label' => 'Three-step setup', 'href' => $site.'/how-to'],
                        ],
                    ],
                    [
                        'slug' => 'what-is-draft-all',
                        'question' => 'What is Draft All?',
                        'paragraphs' => [
                            'Draft All writes answers for unanswered free-text and screening questions, grounded in your saved profile rather than generic filler. You edit tone and facts before anything is submitted.',
                            'Draft All uses extension credits. Exact costs show in the extension.',
                        ],
                        'related' => [
                            ['label' => 'Credits and plans', 'href' => $site.'/pricing'],
                        ],
                    ],
                    [
                        'slug' => 'how-auto-apply-works',
                        'question' => 'How does Auto Apply work?',
                        'paragraphs' => [
                            'Open the extension sidebar Auto Apply tab, pick a supported board, set search filters, and start a run. The extension searches matching Easy Apply / Quick Apply style jobs, opens each posting, fills steps (including Draft All where needed), and can submit when the flow allows.',
                            'You launch every run. Pauses before Submit is on by default so you can check the application before it goes out. You can pause, resume, or stop from the sidebar anytime.',
                        ],
                        'related' => [
                            ['label' => 'Auto Apply walkthrough', 'href' => $site.'/how-to'],
                        ],
                    ],
                    [
                        'slug' => 'customize-jobs',
                        'question' => 'Can I control which jobs get applied to?',
                        'paragraphs' => [
                            'Yes. You set keywords, location, and filters on the board (or in the Auto Apply sidebar settings). You start the session, and you can skip or stop whenever you want.',
                            'AutoCVApply does not silently apply in the background without you starting a run.',
                        ],
                        'related' => [],
                    ],
                    [
                        'slug' => 'ats-vs-boards',
                        'question' => 'What is the difference between board Auto Apply and ATS autofill?',
                        'paragraphs' => [
                            'On supported job boards, Auto Apply can run end-to-end after you start it from the sidebar.',
                            'On ATS / employer career sites, AutoFill and Draft All fill the form; you stay responsible for the final Submit click. That honesty matters for safety and for matching how those sites actually work.',
                        ],
                        'related' => [
                            ['label' => 'Glossary: Auto Apply', 'href' => $site.'/glossary#auto-apply'],
                        ],
                    ],
                ],
            ],
            [
                'id' => 'pricing-credits',
                'title' => 'Pricing and credits',
                'items' => [
                    [
                        'slug' => 'what-uses-credits',
                        'question' => 'What uses credits?',
                        'paragraphs' => [
                            'Extension AI actions spend credits from your monthly allowance - for example Assist replies, cover letters, ATS scores, and Draft All batches. Prices for each action show in the extension.',
                            'CV upload and editing the profile do not spend credits.',
                        ],
                        'related' => [
                            ['label' => 'Pricing page', 'href' => $site.'/pricing'],
                        ],
                    ],
                    [
                        'slug' => 'credits-roll-over',
                        'question' => 'Do unused credits roll over?',
                        'paragraphs' => [
                            'No. Plan allowances reset on the 1st of each month. Bonus credits awarded by support (when applicable) are separate from the monthly allowance.',
                        ],
                        'related' => [],
                    ],
                    [
                        'slug' => 'out-of-credits',
                        'question' => 'What happens when I run out of credits?',
                        'paragraphs' => [
                            'Paid AI tools in the extension stop until your allowance resets next month or you upgrade. Your profile and basic setup remain available.',
                        ],
                        'related' => [
                            ['label' => 'Upgrade options', 'href' => $site.'/pricing'],
                        ],
                    ],
                    [
                        'slug' => 'how-billing-works',
                        'question' => 'How does billing work?',
                        'paragraphs' => [
                            'Paid plans bill monthly in GBP by UK Direct Debit via GoCardless. You can start on Free without a card and upgrade later from billing after you sign in.',
                        ],
                        'related' => [
                            ['label' => 'Pricing and FAQs', 'href' => $site.'/pricing'],
                        ],
                    ],
                ],
            ],
            [
                'id' => 'safety-privacy',
                'title' => 'Safety and privacy',
                'items' => [
                    [
                        'slug' => 'will-i-get-banned',
                        'question' => 'Will Auto Apply get my LinkedIn or Indeed account banned?',
                        'paragraphs' => [
                            'No tool can promise that. AutoCVApply uses human-like pacing on Auto Apply runs and keeps you in control (you start sessions; Pauses before Submit is on by default). Treat volume sensibly and follow each platform\'s rules.',
                            'We do not market "undetectable" or black-hat bypasses.',
                        ],
                        'related' => [],
                    ],
                    [
                        'slug' => 'is-data-safe',
                        'question' => 'Is my CV and profile data safe?',
                        'paragraphs' => [
                            'Your CV profile is stored in your AutoCVApply account so the extension can fill forms after you connect with an API token. We do not sell your data or scrape your inbox.',
                            'Read the Privacy Policy for details on what we process and why.',
                        ],
                        'related' => [
                            ['label' => 'Privacy Policy', 'href' => $site.'/privacy'],
                        ],
                    ],
                    [
                        'slug' => 'silent-bot',
                        'question' => 'Does AutoCVApply apply to jobs without me?',
                        'paragraphs' => [
                            'No. Auto Apply is user-launched from the extension. On ATS sites you submit yourself. It is not a silent background bot that applies while you sleep.',
                        ],
                        'related' => [
                            ['label' => 'What AutoCVApply does not do', 'href' => $site.'/about'],
                        ],
                    ],
                    [
                        'slug' => 'guarantee-interviews',
                        'question' => 'Does AutoCVApply guarantee interviews or offers?',
                        'paragraphs' => [
                            'No. It reduces repetitive form work so you can apply more consistently. Outcomes still depend on fit, your CV, and the market.',
                        ],
                        'related' => [],
                    ],
                ],
            ],
            [
                'id' => 'help',
                'title' => 'Help',
                'items' => [
                    [
                        'slug' => 'where-to-get-help',
                        'question' => 'Where can I get help?',
                        'paragraphs' => [
                            'Join the Discord community, use the contact page, or open an issue on GitHub if something breaks. Product walkthroughs live on How to; definitions live on the Glossary. Try the free browser ATS keyword checker before you apply at volume.',
                        ],
                        'related' => [
                            ['label' => 'Discord', 'href' => $discord],
                            ['label' => 'Contact', 'href' => $site.'/contact'],
                            ['label' => 'Glossary', 'href' => $site.'/glossary'],
                            ['label' => 'Free ATS checker', 'href' => $site.'/tools/ats-score-checker'],
                        ],
                    ],
                ],
            ],
        ];
    }

    public static function itemCount(): int
    {
        $count = 0;
        foreach (self::sections() as $section) {
            $count += count($section['items']);
        }

        return $count;
    }
}
