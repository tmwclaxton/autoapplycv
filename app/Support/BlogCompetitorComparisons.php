<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Curated AutoCVApply vs competitor comparison posts for SEO.
 *
 * Bodies are grounded in (a) Firecrawl research briefs stored on each definition
 * and (b) AutoCVApplyBlogContext product truth. They link competitor and
 * AutoCVApply URLs. They do not invent unverified competitor claims.
 */
class BlogCompetitorComparisons
{
    /**
     * Phrases that must not appear in feature-matrix cells (cop-out hedges).
     *
     * @return list<string>
     */
    public static function bannedMatrixHedgePhrases(): array
    {
        return [
            'See their site',
            'Varies - see crawl',
            'see crawl notes',
            'Not claimed as this exact UK set',
            'verify on usemassive',
            'verify on their',
            'verify on huntr',
            'verify current numbers',
            'Varies - see',
            'treat as unverified until',
        ];
    }

    /**
     * @return array<int, array{
     *     id: string,
     *     competitor: string,
     *     homepage_url: string,
     *     pricing_url: string|null,
     *     features_url: string|null,
     *     category: string,
     *     angle: string,
     *     when_them: string,
     *     who_they_are: string,
     *     crawl_summary: array<int, string>,
     *     pricing_posture: string,
     *     automation_model: string,
     *     feature_matrix: array{
     *         extension: string,
     *         uk_boards: string,
     *         ats_autofill: string,
     *         draft_all: string,
     *         job_tracker: string,
     *         pricing: string
     *     },
     *     title: string,
     *     slug: string,
     *     excerpt: string,
     *     tags: array<int, string>
     * }>
     */
    public static function definitions(): array
    {
        $rows = [
            [
                'id' => 'autoapplymax',
                'competitor' => 'AutoApplyMax',
                'homepage_url' => 'https://www.autoapplymax.com',
                'pricing_url' => 'https://www.autoapplymax.com/#pricing',
                'features_url' => 'https://www.autoapplymax.com/#features',
                'category' => 'auto-apply Chrome extension',
                'angle' => 'AutoApplyMax markets LinkedIn-heavy auto-apply with AI resume/cover tools and autofill on other portals. AutoCVApply ships user-started Auto Apply across LinkedIn, Indeed, Totaljobs, Glassdoor, and Reed, plus AutoFill and Draft All on ATS career sites where you still click Submit.',
                'when_them' => 'You mainly want LinkedIn Easy Apply volume plus their AI resume/cover letter packaging, and you do not need UK boards like Totaljobs or Reed in one sidebar.',
                'who_they_are' => 'A Chrome extension positioned around auto-applying on LinkedIn (and marketing Indeed, Glassdoor, WTTJ, Monster), with AI resume/cover letter generation, ATS scoring, and an application tracker.',
                'crawl_summary' => [
                    'Homepage positions AutoApplyMax as an AI Chrome extension that auto-applies on LinkedIn and autofills on Indeed, Glassdoor, WTTJ, and Monster.',
                    'Feature list includes auto-apply, AI resume generator, AI cover letter, AI autofill on Greenhouse/Lever/Workday-class portals, ATS score checker, and application tracking.',
                    'Pricing on the homepage: Free ($0, 2 AI credits/month), Premium ($6.99/mo annual or similar monthly), Unlimited ($22.99/mo).',
                    'Onboarding copy emphasises install extension, set profile, go to LinkedIn Jobs and click Start.',
                ],
                'pricing_posture' => 'Free forever with limited AI credits (2/mo); paid Premium (~$7/mo) and Unlimited (~$23/mo) for more AI generations (USD).',
                'automation_model' => 'Browser extension auto-apply on supported boards; autofill marketed for broader portals. Volume-oriented LinkedIn workflow.',
                'feature_matrix' => [
                    'extension' => 'Yes - Chrome extension on the Web Store; LinkedIn Jobs "Start" is the core flow',
                    'uk_boards' => 'Partial - markets LinkedIn, Indeed, Glassdoor, WTTJ, Monster; not Totaljobs or Reed',
                    'ats_autofill' => 'Yes - AI autofill marketed for Greenhouse, Lever, Workday, and 100+ portals',
                    'draft_all' => 'Partial - AI answers custom questions from profile/CV; resume and cover letter generation is the headline',
                    'job_tracker' => 'Yes - application tracking dashboard with filters and CSV export',
                    'pricing' => 'Yes - Free with 2 AI credits/mo; Premium ~$7/mo; Unlimited ~$23/mo (USD)',
                ],
            ],
            [
                'id' => 'lazyapply',
                'competitor' => 'LazyApply',
                'homepage_url' => 'https://lazyapply.com',
                'pricing_url' => 'https://lazyapply.com/#pricing',
                'features_url' => 'https://lazyapply.com/#how-it-works',
                'category' => 'mass apply / Job GPT tool',
                'angle' => 'LazyApply pushes high daily application volume across platforms like Indeed, Greenhouse, Dice, and ZipRecruiter, plus referral emails. AutoCVApply pairs controlled board Auto Apply with profile-once autofill, Draft All for screeners, and an honest ATS submit split.',
                'when_them' => 'You want the highest possible raw apply count (tens to hundreds per day) and annual plans priced for that volume, and you accept less per-application review.',
                'who_they_are' => 'A volume-first job application automation product ("Job GPT") that markets one-click applies, referral emails, and multi-profile analytics.',
                'crawl_summary' => [
                    'Homepage claims automated applies on Greenhouse, Dice, Indeed, and ZipRecruiter using Job GPT, plus smart referral emails and a tracking dashboard.',
                    'Marketing emphasises advanced algorithms so profiles "never get blocked" - treat that as marketing, not a guarantee.',
                    'Individual plans shown as yearly: Basic (~$99/yr, 15 apps/day), Premium (~$149/yr, 150 apps/day), Ultimate (~$999/yr, 1500 apps/day), with a 30-day refund policy page.',
                    'Also lists LinkedIn and resume helper tools (cover letter, resume score, etc.).',
                ],
                'pricing_posture' => 'Annual individual plans roughly $99-$999/year with daily application caps (Basic 15/day through Ultimate 1500/day).',
                'automation_model' => 'High-volume automated applies and referral outreach; less emphasis on UK board coverage or human review of every screener.',
                'feature_matrix' => [
                    'extension' => 'Partial - product is Job GPT / mass-apply tooling; LinkedIn helpers listed, not a UK multi-board sidebar like AutoCVApply',
                    'uk_boards' => 'Partial - markets Indeed plus Greenhouse/Dice/ZipRecruiter volume; not Totaljobs, Reed, or Glassdoor as a UK Auto Apply set',
                    'ats_autofill' => 'Yes - automated applies marketed on Greenhouse and similar portals at high daily caps',
                    'draft_all' => 'Partial - Job GPT automates answers at volume; less emphasis on per-screener human review before submit',
                    'job_tracker' => 'Yes - tracking dashboard and multi-profile analytics are part of the pitch',
                    'pricing' => 'Yes - annual plans ~$99-$999/yr with 15-1500 apps/day caps; 30-day refund policy page',
                ],
            ],
            [
                'id' => 'simplify',
                'competitor' => 'Simplify',
                'homepage_url' => 'https://simplify.jobs',
                'pricing_url' => null,
                'features_url' => 'https://simplify.jobs/copilot',
                'category' => 'AI job search / autofill platform',
                'angle' => 'Simplify is a full job-search partner: matches, Copilot autofill, AI resume builder, and a job tracker. AutoCVApply is narrower - upload once, AutoFill ATS fields, Draft All screeners, and user-started Auto Apply on major UK boards.',
                'when_them' => 'You want discovery, matching, networking, and a Kanban tracker as much as form fill - and autofill (not board Auto Apply) is enough.',
                'who_they_are' => 'An AI job-search platform ("one profile") with job matches, Copilot Chrome autofill, AI resume builder, and application tracking used by a large candidate base.',
                'crawl_summary' => [
                    'Homepage: matched jobs, Copilot extension autofill, AI resume builder, and job tracker powered by one profile.',
                    'Copilot is positioned to autofill applications and highlight missing resume keywords; install/learn-more paths at /install and /copilot.',
                    'Tracker markets bookmarking from 50+ boards; resume builder includes ATS score and keyword tips.',
                    'Public /pricing returned 404 at research time - free signup is the headline CTA.',
                ],
                'pricing_posture' => 'Free signup is the headline ("Join Now - It\'s Free"); paid AI extras may exist historically, but no live public pricing table was confirmed.',
                'automation_model' => 'Autofill + tracking + matching; you typically still submit. Strong discovery/CRM surface vs AutoCVApply\'s apply engine focus.',
                'feature_matrix' => [
                    'extension' => 'Yes - Simplify Copilot Chrome extension for autofill and keyword tips',
                    'uk_boards' => 'No - Copilot autofills applications; not marketed as Auto Apply on LinkedIn/Indeed/Totaljobs/Glassdoor/Reed',
                    'ats_autofill' => 'Yes - Copilot autofills repetitive application questions; you typically still submit',
                    'draft_all' => 'Partial - AI resume tailoring and keyword tips; not an in-browser Draft All for every screener with review',
                    'job_tracker' => 'Yes - job tracker with bookmarking from 50+ boards is a core product surface',
                    'pricing' => 'Partial - free signup is the headline; Unclear from public pages whether paid AI tiers are live (no /pricing table found)',
                ],
            ],
            [
                'id' => 'loopcv',
                'competitor' => 'LoopCV',
                'homepage_url' => 'https://www.loopcv.pro',
                'pricing_url' => 'https://www.loopcv.pro/pricing',
                'features_url' => 'https://www.loopcv.pro/autoapply',
                'category' => 'automated job matching / apply platform',
                'angle' => 'LoopCV emphasises cloud-side loops that find jobs and apply (or email recruiters) on your behalf, with optional manual review. AutoCVApply keeps you in the browser: you start Auto Apply on boards, review Draft All answers, and submit yourself on ATS forms.',
                'when_them' => 'You prefer a hands-off matching service that applies or emails recruiters for you, and you are less concerned about reviewing each application in your own browser.',
                'who_they_are' => 'An AI job-search automation platform that searches boards, auto-applies or emails recruiters, tracks results, and offers CV builder/checker tools.',
                'crawl_summary' => [
                    'Homepage: create profile, set titles/locations, LoopCV searches and applies on your behalf or lets you review matches.',
                    'Also markets recruiter email outreach, analytics/A-B CV testing, LinkedIn auto-apply extension, AI CV builder/checker, and a job aggregator.',
                    'Pricing page: Free (Basic Looper), Standard ~$19.99/mo, Premium ~$59.99/mo, Done For You ~$89.99/mo - with monthly application/email caps and job-board limits.',
                    'FAQ states applications go through standard flows; employers should not see an automation label (their claim).',
                ],
                'pricing_posture' => 'Free plan with low monthly caps; paid Standard/Premium/Done-For-You roughly $20-$90/mo with application and email limits.',
                'automation_model' => 'Cloud automation + optional extension; can apply/email without you driving each form. Control is filter/review based rather than per-field browser fill.',
                'feature_matrix' => [
                    'extension' => 'Partial - LinkedIn auto-apply extension exists; core product is cloud loopers that apply/email without you driving each form',
                    'uk_boards' => 'No - cloud matching/apply across boards they support; not the UK Totaljobs/Reed/Glassdoor Auto Apply sidebar set',
                    'ats_autofill' => 'Partial - applies on your behalf through standard flows; not "fill then you Submit" browser AutoFill',
                    'draft_all' => 'Partial - AI CV builder/checker and outreach copy; optional review of matches rather than Draft All per screener',
                    'job_tracker' => 'Yes - analytics, application tracking, and A/B CV testing are marketed',
                    'pricing' => 'Yes - Free Basic Looper; Standard ~$20/mo, Premium ~$60/mo, Done For You ~$90/mo',
                ],
            ],
            [
                'id' => 'applyglide',
                'competitor' => 'ApplyGlide',
                'homepage_url' => 'https://applyglide.com',
                'pricing_url' => null,
                'features_url' => null,
                'category' => 'auto-apply / resume tooling (category listing)',
                'angle' => 'ApplyGlide appears in auto-apply comparison directories, but live site research found the homepage unavailable and indexed pages skewed toward resume/cover-letter templates. AutoCVApply differentiates with a verified Chrome extension workflow: structured CV profile, Draft All, UK board Auto Apply, and clear ATS honesty.',
                'when_them' => 'You specifically need ApplyGlide\'s current product surface (confirm live on their site) and it covers the boards you use - otherwise treat directory mentions as stale.',
                'who_they_are' => 'A product still listed in competitor compare directories; public site status was unreliable during research, so feature claims stay cautious.',
                'crawl_summary' => [
                    'Direct Firecrawl scrape of https://applyglide.com returned a Cloudflare 520 origin error at research time.',
                    'Search indexed applyglide.com pages for role-specific resume and cover-letter templates (e.g. barista resume, customer success cover letter).',
                    'Third-party compare pages still list ApplyGlide in the auto-apply category - those are not primary sources for current features.',
                    'Do not invent board lists, pricing, or automation claims until the live site is readable again.',
                ],
                'pricing_posture' => 'Unclear from public pages; homepage returned Cloudflare 520 during research, so no live plan table was readable.',
                'automation_model' => 'Unclear from public pages - primary crawl failed. Prefer AutoCVApply when you need documented board Auto Apply + ATS autofill behaviour.',
                'feature_matrix' => [
                    'extension' => 'Unclear - homepage Cloudflare 520; cannot confirm a live apply extension from primary pages',
                    'uk_boards' => 'Unclear - no readable board Auto Apply claims from the live site; directory listings are not primary evidence',
                    'ats_autofill' => 'Unclear - indexed pages skew to resume/cover templates rather than documented ATS autofill',
                    'draft_all' => 'Unclear - no verified Draft All / screener-draft product page while the origin was down',
                    'job_tracker' => 'Unclear - tracker features not confirmed from a working primary scrape',
                    'pricing' => 'Unclear - no public plan table readable while applyglide.com returned 520',
                ],
            ],
            [
                'id' => 'jobcopilot',
                'competitor' => 'JobCopilot',
                'homepage_url' => 'https://jobcopilot.com',
                'pricing_url' => 'https://jobcopilot.com/pricing',
                'features_url' => 'https://jobcopilot.com/automate-job-search/',
                'category' => 'AI job application automation',
                'angle' => 'JobCopilot markets a daily AI copilot that finds roles on company career pages and autofills applications for you (with optional review). AutoCVApply combines AutoFill, Draft All, and board Auto Apply under one extension token, with Free credits to try before paying.',
                'when_them' => 'You want a set-and-forget copilot that applies to company career pages at volume, and you already have a separate process for LinkedIn/Indeed-style board runs.',
                'who_they_are' => 'An AI job application automation platform that searches company career pages and submits personalized applications daily based on filters and a one-time profile setup.',
                'crawl_summary' => [
                    'Homepage: configure filters, upload resume once, copilot finds jobs daily and autofills applications; claims up to ~50 personalized applications per day.',
                    'Emphasises verified jobs on official company career pages (not board spam), resume tailoring, and training the copilot from edited answers.',
                    'Feature hub includes job search automation and related job-search products bundled as one solution.',
                    'Pricing: Premium from ~$0.93/day (up to 20 matches) and Elite from ~$1.05/day (up to 50 matches), with weekly/monthly/quarterly billing.',
                ],
                'pricing_posture' => 'Paid Premium (~$0.93/day, up to 20 matches) and Elite (~$1.05/day, up to 50 matches) with weekly/monthly/quarterly options.',
                'automation_model' => 'Background copilot applies to career-page jobs; optional human review. Different from AutoCVApply\'s user-started board Auto Apply in the browser.',
                'feature_matrix' => [
                    'extension' => 'No - cloud copilot that finds and autofills career-page jobs; not a Chrome board Auto Apply sidebar',
                    'uk_boards' => 'No - focuses on official company career pages, not LinkedIn/Indeed/Totaljobs/Glassdoor/Reed Auto Apply',
                    'ats_autofill' => 'Yes - autofills applications on company career pages; optional save-for-review before send',
                    'draft_all' => 'Partial - trains from edited answers and tailors resumes; not the same as in-browser Draft All on every screener',
                    'job_tracker' => 'Yes - job application tracker is listed on paid plans',
                    'pricing' => 'Yes - Premium from ~$0.93/day (20 matches); Elite from ~$1.05/day (50 matches)',
                ],
            ],
            [
                'id' => 'huntr',
                'competitor' => 'Huntr',
                'homepage_url' => 'https://huntr.co',
                'pricing_url' => 'https://huntr.co/pricing',
                'features_url' => 'https://huntr.co/product/job-tracker',
                'category' => 'job tracker / resume CRM',
                'angle' => 'Huntr is primarily a job-search tracker and resume toolkit with optional autofill. AutoCVApply is built for filling and applying: profile once, AutoFill ATS fields, Draft All screeners, Auto Apply on supported boards. They solve different bottlenecks.',
                'when_them' => 'Your pain is pipeline organisation (stages, notes, interviews, tailored resumes) more than multi-board Auto Apply.',
                'who_they_are' => 'A job-search CRM with AI resume/cover tools, job/contact/interview trackers, and Chrome autofill/clipper features.',
                'crawl_summary' => [
                    'Homepage: organize search, tailored resumes/cover letters, one-click application form fill.',
                    'Product surface includes job tracker, contact tracker, interview tracker, AI resume builder/review, resume tailor, and job application autofill extension.',
                    'Pricing: Free tier (limited tailored resumes and 100 tracked jobs) and Pro around $40/mo monthly or lower on longer billing.',
                    'Strong CRM/resume identity - autofill is one module, not the whole product.',
                ],
                'pricing_posture' => 'Free plan (limited tailored resumes, 100 tracked jobs) plus Pro roughly $26-$40/mo depending on billing period.',
                'automation_model' => 'Tracker-first with autofill assist; not positioned as UK multi-board Auto Apply.',
                'feature_matrix' => [
                    'extension' => 'Yes - Chrome extension for autofill and job clipping into the tracker',
                    'uk_boards' => 'No - autofill assist, not Auto Apply sessions on LinkedIn/Indeed/Totaljobs/Glassdoor/Reed',
                    'ats_autofill' => 'Yes - one-click application form fill is marketed alongside the CRM',
                    'draft_all' => 'Partial - AI resume/cover tools and tailored resumes; not Draft All for every free-text screener',
                    'job_tracker' => 'Yes - job, contact, and interview trackers are the product centre of gravity',
                    'pricing' => 'Yes - Free tier plus Pro ~$26-$40/mo depending on billing period',
                ],
            ],
            [
                'id' => 'sonara',
                'competitor' => 'Sonara',
                'homepage_url' => 'https://www.sonara.ai',
                'pricing_url' => null,
                'features_url' => 'https://www.sonara.ai/how-it-works',
                'category' => 'AI job search automation',
                'angle' => 'Sonara markets continuous AI matching and applying until you are hired ("10x applications"). AutoCVApply emphasises browser-native fills, multi-board Auto Apply for UK seekers, Draft All with human review, and explicit ATS submit control.',
                'when_them' => 'You want a set-and-forget matching service that finds and applies for you, and you do not need Totaljobs, Reed, or Glassdoor Auto Apply in one Chrome sidebar.',
                'who_they_are' => 'An AI job-search automation platform that learns preferences, finds matches, and applies on the user\'s behalf until hired.',
                'crawl_summary' => [
                    'Homepage: cast a wider net / 10x applications; AI finds and applies to relevant openings continuously.',
                    'Flow marketed as: get to know you → find jobs → apply for you; wake up to daily matches.',
                    'Shows live-looking job cards and partner branding (e.g. Monster/CareerBuilder style trust strip).',
                    'Public pricing URL was not confirmed in research - signup CTA is "Get Started" without a public plan table.',
                ],
                'pricing_posture' => 'Unclear from public pages; homepage pushes Get Started without a dedicated public pricing table.',
                'automation_model' => 'Hands-off match-and-apply service. AutoCVApply instead keeps you starting board runs and submitting ATS forms.',
                'feature_matrix' => [
                    'extension' => 'No - web autopilot that finds and applies for you; not a browser Auto Apply extension',
                    'uk_boards' => 'No - continuous match-and-apply service; not UK Totaljobs/Reed/Glassdoor Auto Apply in one sidebar',
                    'ats_autofill' => 'Partial - "we apply for you" on matched openings; not fill-then-you-Submit browser AutoFill',
                    'draft_all' => 'Partial - AI handles application grunt work after learning preferences; not Draft All with your review in Chrome',
                    'job_tracker' => 'Partial - daily match lists and apply history implied; not a full CRM like Huntr/Teal',
                    'pricing' => 'Unclear - no dedicated public pricing page confirmed; signup is Get Started',
                ],
            ],
            [
                'id' => 'teal',
                'competitor' => 'Teal',
                'homepage_url' => 'https://www.tealhq.com',
                'pricing_url' => 'https://www.tealhq.com',
                'features_url' => 'https://www.tealhq.com/tools/resume-builder',
                'category' => 'career tracker / resume toolkit',
                'angle' => 'Teal is known for AI resumes, job tracking, and bookmarking from many boards. AutoCVApply is the apply engine after the CV is ready: parse once, AutoFill employer forms, Draft All answers, Auto Apply on boards.',
                'when_them' => 'You need a career CRM and resume builder more than Chrome autofill depth and board Auto Apply.',
                'who_they_are' => 'A resume and job-search toolkit with AI resume builder, job tracker, matching insights, and a Chrome extension to bookmark jobs.',
                'crawl_summary' => [
                    'Homepage: build ATS-friendly resumes, job tracker, matching mode; free signup heavily promoted.',
                    'Chrome extension positioned to bookmark jobs from 40+ boards; resume tools and cover letter examples are core.',
                    'Less emphasis on end-to-end board Auto Apply than on resume quality and organisation.',
                    'Treat Teal as complementary for many seekers who still want a dedicated apply extension.',
                ],
                'pricing_posture' => 'Free signup is the headline ("It\'s 100% Free"); paid upgrades may exist for advanced AI, but free resume/tracker is the pitch.',
                'automation_model' => 'Resume + tracker first; bookmarking/extension assist. Not a UK multi-board Auto Apply sidebar.',
                'feature_matrix' => [
                    'extension' => 'Yes - Chrome extension to bookmark jobs from 40+ boards into the tracker',
                    'uk_boards' => 'No - bookmarking assist, not Auto Apply on LinkedIn/Indeed/Totaljobs/Glassdoor/Reed',
                    'ats_autofill' => 'No - resume builder and tracker lead; not marketed as deep ATS AutoFill + you submit',
                    'draft_all' => 'Partial - AI resume tailoring and keyword recommendations; not Draft All for employer screener boxes',
                    'job_tracker' => 'Yes - job tracker and matching mode are core product surfaces',
                    'pricing' => 'Partial - free signup is the headline; paid AI upgrades may exist for advanced features',
                ],
            ],
            [
                'id' => 'massive',
                'competitor' => 'Massive',
                'homepage_url' => 'https://usemassive.com',
                'pricing_url' => null,
                'features_url' => 'https://usemassive.com/auto-apply-wizard',
                'category' => 'autopilot job apply service',
                'angle' => 'Massive sells "job search on Autopilot": match, apply for you, custom resumes/cover letters, and hiring-team outreach. AutoCVApply sells controlled speed: you start runs, review Draft All, keep ATS submits in your hands, and reuse one profile across Workday-class forms.',
                'when_them' => 'You want maximum hands-off volume on curated company roles and accept that a third party submits applications for you.',
                'who_they_are' => 'An autopilot apply service that matches roles and fills/submits applications (with optional manual selection), including custom resumes and hiring-team messages.',
                'crawl_summary' => [
                    'Homepage: finds and applies to jobs daily; fill profile → get matches → sit back; claims up to ~200 applications/month.',
                    'Features: apply on your behalf, custom resume/cover letter per job, personalized hiring-team messages, visa sponsorship filters.',
                    'FAQ: employers "can\'t detect" Massive (their claim); you can preview submissions; Autopilot or manual job selection.',
                    'www.usemassive.com DNS failed in one crawl attempt; apex usemassive.com succeeded. No public plan table on the homepage.',
                ],
                'pricing_posture' => 'Paid membership implied by signup; homepage markets up to ~200 applications/month without listing a public plan table.',
                'automation_model' => 'Service-side autopilot applies for you. Opposite of AutoCVApply\'s user-started browser extension model.',
                'feature_matrix' => [
                    'extension' => 'No - web autopilot service; applies on your behalf after profile setup, not a Chrome Auto Apply extension',
                    'uk_boards' => 'No - curated company matches and service-side apply; not LinkedIn/Indeed/Totaljobs/Glassdoor/Reed Auto Apply',
                    'ats_autofill' => 'Partial - fills and submits applications for you (you can preview); not browser AutoFill where you keep Submit',
                    'draft_all' => 'Partial - custom resume/cover letter and AI answers per job; preview before send, not in-browser Draft All',
                    'job_tracker' => 'Partial - shows submitted applications and previews; not a full stages/CRM tracker',
                    'pricing' => 'Partial - paid membership via signup; homepage claims up to ~200 apps/month, no public plan table scraped',
                ],
            ],
        ];

        return array_map(function (array $row): array {
            $name = $row['competitor'];
            $title = "AutoCVApply vs {$name}: Which Is Better for Job Applications (2026)?";
            $slug = Str::slug("autocvapply-vs-{$row['id']}");

            return [
                ...$row,
                'title' => $title,
                'slug' => $slug,
                'excerpt' => "A practical AutoCVApply vs {$name} comparison for UK job seekers: boards, ATS autofill, Draft All, control, and pricing - with real links and crawl-backed notes.",
                'tags' => [
                    'autocvapply',
                    'job-search',
                    'careers',
                    'comparison',
                    'vs-'.Str::slug($row['id']),
                    'autofill',
                    'auto-apply',
                ],
            ];
        }, $rows);
    }

    /**
     * Marketing /compare page entries derived from comparison definitions.
     *
     * @return array<int, array{
     *     id: string,
     *     competitor: string,
     *     slug: string,
     *     category: string,
     *     headline: string,
     *     summary: string,
     *     reasons: array<int, string>,
     *     when_them: string,
     *     homepage_url: string
     * }>
     */
    public static function comparePageEntries(): array
    {
        return array_map(function (array $definition): array {
            return [
                'id' => $definition['id'],
                'competitor' => $definition['competitor'],
                'slug' => $definition['slug'],
                'category' => $definition['category'],
                'headline' => 'AutoCVApply vs '.$definition['competitor'],
                'summary' => $definition['angle'],
                'reasons' => self::compareReasons($definition),
                'when_them' => $definition['when_them'],
                'homepage_url' => $definition['homepage_url'],
            ];
        }, self::definitions());
    }

    /**
     * Punchy, matrix-backed reasons AutoCVApply is the better pick for this competitor.
     *
     * @param  array<string, mixed>  $definition
     * @return list<string>
     */
    public static function compareReasons(array $definition): array
    {
        $competitor = (string) $definition['competitor'];
        /** @var array<string, string> $matrix */
        $matrix = $definition['feature_matrix'] ?? [];
        $reasons = [];

        $ukBoards = self::matrixVerdict($matrix, 'uk_boards');
        if ($ukBoards !== 'Yes') {
            $reasons[] = 'User-started Auto Apply on LinkedIn, Indeed, Totaljobs, Glassdoor, and Reed in one sidebar - the UK board set '.$competitor.' does not match.';
        }

        $extension = self::matrixVerdict($matrix, 'extension');
        if ($extension === 'No' || $extension === 'Unclear') {
            $reasons[] = 'A Chrome and Firefox extension you start yourself - not a silent cloud bot applying without you.';
        } elseif ($extension === 'Partial') {
            $reasons[] = 'One extension token for AutoFill, Draft All, and board Auto Apply - not a LinkedIn-only helper bolted onto another product.';
        }

        $ats = self::matrixVerdict($matrix, 'ats_autofill');
        if ($ats === 'No' || $ats === 'Unclear') {
            $reasons[] = 'ATS AutoFill on Workday/Greenhouse-class forms where you keep Submit - honest about what automation does.';
        } elseif ($ats === 'Partial') {
            $reasons[] = 'Browser AutoFill where you review and submit ATS forms yourself - not a third party submitting on your behalf.';
        } else {
            $reasons[] = 'ATS AutoFill plus Draft All with transparent credits - you edit answers before they leave the browser.';
        }

        $draft = self::matrixVerdict($matrix, 'draft_all');
        if ($draft !== 'Yes') {
            $reasons[] = 'Draft All for free-text screeners grounded in your CV profile, then you edit tone before send.';
        }

        $tracker = self::matrixVerdict($matrix, 'job_tracker');
        if ($tracker === 'Yes') {
            $reasons[] = 'Built as an apply engine (profile once, fill, Auto Apply) - pair with a CRM if you need stages; do not pay twice for the wrong bottleneck.';
        }

        $reasons = array_values(array_unique($reasons));

        if (count($reasons) < 2) {
            $reasons[] = 'Free plan with real monthly credits and clear GBP pricing before you lean on AI.';
            $reasons[] = 'One CV profile powering AutoFill, Draft All, and Auto Apply across boards and ATS forms.';
        }

        return array_slice($reasons, 0, 4);
    }

    /**
     * @param  array<string, string>  $matrix
     */
    public static function matrixVerdict(array $matrix, string $key): string
    {
        $value = trim((string) ($matrix[$key] ?? ''));

        foreach (['Yes', 'No', 'Partial', 'Unclear'] as $verdict) {
            if (str_starts_with($value, $verdict)) {
                return $verdict;
            }
        }

        return 'Unclear';
    }

    /**
     * @return array{title: string, slug: string, excerpt: string, body: string, tags: array<int, string>}
     */
    public static function postFor(string $id): array
    {
        foreach (self::definitions() as $definition) {
            if ($definition['id'] === $id) {
                return self::toPost($definition);
            }
        }

        throw new \InvalidArgumentException('Unknown competitor comparison id: '.$id);
    }

    /**
     * @return array<int, array{title: string, slug: string, excerpt: string, body: string, tags: array<int, string>}>
     */
    public static function allPosts(): array
    {
        return array_map(fn (array $definition): array => self::toPost($definition), self::definitions());
    }

    /**
     * @param  array<string, mixed>  $definition
     * @return array{title: string, slug: string, excerpt: string, body: string, tags: array<int, string>}
     */
    public static function toPost(array $definition): array
    {
        return [
            'title' => $definition['title'],
            'slug' => $definition['slug'],
            'excerpt' => $definition['excerpt'],
            'body' => self::body($definition),
            'tags' => $definition['tags'],
        ];
    }

    /**
     * Deterministic comparison body grounded in curated crawl briefs + product truth.
     *
     * @param  array<string, mixed>  $definition
     */
    public static function body(array $definition): string
    {
        $site = AutoCVApplyBlogContext::siteUrl();
        $store = (string) config(
            'blog.sources.official_chrome_web_store_url',
            'https://chromewebstore.google.com/detail/autocvapply/mldeodhhcbnhnjklmelneecjpjkjemih',
        );

        $competitor = (string) $definition['competitor'];
        $category = (string) $definition['category'];
        $angle = (string) $definition['angle'];
        $whenThem = (string) $definition['when_them'];
        $whoTheyAre = (string) $definition['who_they_are'];
        $pricingPosture = (string) $definition['pricing_posture'];
        $automationModel = (string) $definition['automation_model'];
        $homepage = (string) $definition['homepage_url'];
        $pricingUrl = $definition['pricing_url'] ?? null;
        $featuresUrl = $definition['features_url'] ?? null;
        /** @var array<int, string> $crawlSummary */
        $crawlSummary = $definition['crawl_summary'] ?? [];
        /** @var array<string, string> $matrix */
        $matrix = $definition['feature_matrix'] ?? [];

        $competitorLink = "[{$competitor}]({$homepage})";
        $pricingLink = is_string($pricingUrl) && $pricingUrl !== ''
            ? "[pricing]({$pricingUrl})"
            : 'their homepage pricing / signup funnel';
        $featuresLink = is_string($featuresUrl) && $featuresUrl !== ''
            ? "[features]({$featuresUrl})"
            : 'features on their homepage';

        $crawlBullets = '';
        foreach ($crawlSummary as $bullet) {
            $crawlBullets .= '- '.$bullet."\n";
        }
        if ($crawlBullets === '') {
            $crawlBullets = "- No crawl notes stored for {$competitor}; treat claims as unverified.\n";
        }

        $featureMatrix = self::featureMatrixMarkdown(
            $site,
            $store,
            $competitor,
            $competitorLink,
            $matrix,
        );

        return <<<MD
## Who each product is for

### AutoCVApply

UK job seekers who retype the same CV into Workday/Greenhouse-class forms and apply across major boards. Upload once at [{$site}/login]({$site}/login), connect the [Chrome extension]({$store}), then AutoFill, Draft All, or start Auto Apply from the sidebar. See [What is AutoCVApply?]({$site}/blog/what-is-autocvapply).

### {$competitor}

{$whoTheyAre}

Primary site: {$competitorLink}. Related pages: {$featuresLink}; {$pricingLink}.

## How to compare Autofill and Auto Apply tools

Ignore "AI will get you hired" claims. Use a short checklist:

| Criterion | Why it matters |
|-----------|----------------|
| Profile once | You should not rebuild employment history on every portal |
| Board Auto Apply | LinkedIn-only is not enough for many UK searches |
| ATS honesty | On Workday / Greenhouse-class sites, you usually still submit |
| Screening answers | Free-text boxes burn hours without Draft All-style help |
| Human control | You start board runs; you review AI text |
| Transparent metering | Credits or limits should be obvious before you rely on the tool |

AutoCVApply is designed around that checklist. When a competitor wins on one row only (for example pure tracking), say so - and pick the right tool for the bottleneck.

## AutoCVApply vs {$competitor}: the practical angle

{$angle}

### What AutoCVApply does well

- **Upload once**: PDF or Word CV → editable profile (free on every plan) via [sign in]({$site}/login)
- **AutoFill**: structured fields on ATS and employer career sites (Workday, Greenhouse, Lever, Ashby, and similar) - [how-to]({$site}/how-to)
- **Draft All**: screening / free-text answers grounded in your profile, then you edit tone
- **Auto Apply**: user-started sidebar sessions on LinkedIn Easy Apply, Indeed Apply, Totaljobs Quick Apply, Glassdoor Easy Apply, and Reed Easy Apply
- **Clear pricing**: Free (£0 / 1,500 credits), Starter (£7 / 12,500), Pro (£17 / 95,000) - see [AutoCVApply pricing]({$site}/pricing)

### What crawl research found about {$competitor}

Research notes from Firecrawl scrapes of their public pages (products change - re-check links):

{$crawlBullets}
### Feature matrix (honest, link-backed)

{$featureMatrix}

### Automation and privacy model

**AutoCVApply:** automation runs in **your** browser after **you** start it. On ATS sites you keep Submit. Credits meter AI actions transparently.

**{$competitor}:** {$automationModel}

If another tool implies silent apply everywhere with no review, treat that as a risk signal, not a feature win. Related reading: [autofill myths]({$site}/blog) and [how-to]({$site}/how-to).

## When AutoCVApply is the better choice

Choose [AutoCVApply]({$site}) when you:

- Apply across **multiple UK boards**, not only one feed
- Hit long **ATS** forms and want autofill plus Draft All without giving up Submit
- Want **one profile** powering AutoFill, Draft All, and Auto Apply
- Prefer **user-started** automation over a silent background bot
- Want a Free tier with real credits before paying - [pricing]({$site}/pricing)

## When {$competitor} might still fit

{$whenThem}

If that describes you, start at {$competitorLink} for that job - and still keep a clean CV. Tools do not replace targeting and review.

## Pricing posture

**AutoCVApply:** Free includes CV upload, profile editing, and 1,500 monthly extension credits. Paid plans are monthly GBP via UK Direct Debit. Full detail: [pricing]({$site}/pricing).

**{$competitor}:** {$pricingPosture} See {$pricingLink}.

Always compare the **workflow you will use weekly**, not the lowest advertised headline price alone.

## TL;DR

1. Decide what you need: board Auto Apply, ATS autofill, screening-answer drafts, a job tracker, or all of the above.
2. Compare tools on **control** (who starts applies / who clicks Submit), **board coverage**, and **profile reuse** - not marketing slogans.
3. [AutoCVApply]({$site}) is built for UK-style searching: one CV profile, [AutoFill]({$site}/how-to) on ATS forms, Draft All for free-text, Auto Apply on LinkedIn / Indeed / Totaljobs / Glassdoor / Reed.
4. {$competitorLink} sits in the {$category} space - use it if that narrower job matches your bottleneck.
5. Prefer the tool that keeps you reviewing answers; silent mass-apply rarely ages well.

## FAQ

### Is AutoCVApply "better" than {$competitor} for everyone?

No. It is better when your bottleneck is repetitive forms and multi-board apply with review. Tracker-first or fully hands-off matching tools can win for other bottlenecks. Compare {$competitorLink} against [AutoCVApply]({$site}) on control and coverage.

### Does AutoCVApply guarantee more interviews?

No. It reduces retyping and helps you apply consistently. Interview outcomes still depend on fit, CV quality, and the market.

### Will you list every {$competitor} feature?

No. Features change. This post stays inside AutoCVApply's verified product surface plus crawl-backed notes from public pages. Re-check {$competitorLink} before buying.

### Can I use a tracker and AutoCVApply together?

Yes. Many people track stages in a CRM and use AutoCVApply for filling and board Auto Apply.

## Get started

1. [Upload your CV]({$site}/login) and tidy the parsed profile
2. Install the [Chrome extension]({$store}) (Firefox is supported too)
3. Try AutoFill on an ATS form, Draft All on a screener, or Auto Apply on a supported board

More product detail: [What is AutoCVApply?]({$site}/blog/what-is-autocvapply) and [How to]({$site}/how-to). Still comparing tools? Browse more [blog comparisons]({$site}/blog).
MD;
    }

    /**
     * Build the markdown feature matrix with decisive Yes/No/Partial/Unclear cells.
     *
     * @param  array<string, string>  $matrix
     */
    public static function featureMatrixMarkdown(
        string $site,
        string $store,
        string $competitor,
        string $competitorLink,
        array $matrix,
    ): string {
        $extension = self::matrixCell($matrix, 'extension', 'Unclear - public pages did not confirm an apply extension');
        $ukBoards = self::matrixCell($matrix, 'uk_boards', 'Unclear - UK board Auto Apply set not confirmed on public pages');
        $ats = self::matrixCell($matrix, 'ats_autofill', 'Unclear - ATS autofill behaviour not confirmed on public pages');
        $draft = self::matrixCell($matrix, 'draft_all', 'Unclear - screener drafting not confirmed on public pages');
        $tracker = self::matrixCell($matrix, 'job_tracker', 'Unclear - tracker/CRM depth not confirmed on public pages');
        $pricing = self::matrixCell($matrix, 'pricing', 'Unclear - no public plan table confirmed');

        return <<<MD
| Capability | AutoCVApply | {$competitor} (from public pages) |
|------------|-------------|-------------------------------------|
| Primary URL | [autocvapply.com]({$site}) | {$competitorLink} |
| Chrome/Firefox apply extension | Yes - [Chrome Web Store]({$store}) listing; Firefox supported too | {$extension} |
| UK board Auto Apply (LI, Indeed, Totaljobs, Glassdoor, Reed) | Yes - user-started sidebar on all five | {$ukBoards} |
| ATS AutoFill + you submit | Yes - structured fill; you keep Submit on ATS sites | {$ats} |
| Draft All / AI screeners with review | Yes - credit-metered drafts you edit before send | {$draft} |
| Job tracker / CRM | Partial - apply-focused; pair with a CRM if you need stages | {$tracker} |
| Pricing posture | Yes - [GBP monthly credits]({$site}/pricing): Free 1,500 / Starter £7 / Pro £17 | {$pricing} |
MD;
    }

    /**
     * @param  array<string, string>  $matrix
     */
    public static function matrixCell(array $matrix, string $key, string $fallback): string
    {
        $value = trim((string) ($matrix[$key] ?? ''));

        if ($value === '') {
            return $fallback;
        }

        return $value;
    }

    /**
     * Extract the Feature matrix markdown table from a comparison body.
     */
    public static function extractFeatureMatrixSection(string $body): string
    {
        if (preg_match('/### Feature matrix[^\n]*\n+([\s\S]*?)(?=\n### |\n## |\z)/u', $body, $matches) !== 1) {
            return '';
        }

        return trim($matches[1]);
    }

    /**
     * Required markdown markers for a valid comparison body (tests + AI validation).
     *
     * @return array<int, string>
     */
    public static function requiredBodyMarkers(string $competitor): array
    {
        $site = AutoCVApplyBlogContext::siteUrl();

        return [
            '## TL;DR',
            '## Who each product is for',
            '## AutoCVApply vs '.$competitor.': the practical angle',
            '### Feature matrix',
            '### Automation and privacy model',
            '## When AutoCVApply is the better choice',
            '## When '.$competitor.' might still fit',
            '## Pricing posture',
            '## FAQ',
            '## Get started',
            $site.'/login',
            $site.'/pricing',
            $site.'/how-to',
            'Does AutoCVApply guarantee more interviews?',
        ];
    }
}
