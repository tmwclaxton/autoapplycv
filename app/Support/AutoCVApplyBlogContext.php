<?php

namespace App\Support;

/**
 * Authoritative marketing context for AI-generated AutoCVApply blog posts.
 */
class AutoCVApplyBlogContext
{
    /**
     * Public marketing URL for links inside generated posts (never localhost).
     */
    public static function siteUrl(): string
    {
        return rtrim((string) config('blog.public_site_url', 'https://autocvapply.com'), '/');
    }

    public static function document(): string
    {
        $site = self::siteUrl();
        $chromeStore = (string) config(
            'blog.sources.official_chrome_web_store_url',
            'https://chromewebstore.google.com/detail/autocvapply/mldeodhhcbnhnjklmelneecjpjkjemih',
        );

        return <<<CONTEXT
## How to use this document
This is the single source of truth for facts you may state about **AutoCVApply** in blog posts on autocvapply.com.
If something is not stated here, treat it as unknown rather than guessing.
Do not invent customer counts, success rates, employer partnerships, or unsupported job boards.
Always link to production URLs below - never localhost, staging, or relative-only links.

## What AutoCVApply is
AutoCVApply helps **workers and job seekers** apply for roles faster by storing a structured CV profile once, then using a **Chrome (and Firefox) extension** to:
1. **Autofill** repetitive fields on ATS and employer career sites.
2. **Draft All** AI answers for screening questions and free-text fields, grounded in the saved profile.
3. **Auto Apply** end-to-end on supported job boards from the extension sidebar (search, open, fill, review, submit).

Tagline themes: **"Upload once. Apply everywhere."** and **"Stop retyping your life story."**

Primary audience: UK job seekers by default - graduates, career changers, contractors between contracts, and anyone filling repetitive application forms.

## Core product workflow (use this structure in how-to posts)
1. Upload a PDF or Word CV at {$site}/login - AI extracts an editable profile (free on every plan).
2. Review and edit the profile in the dashboard before trusting any fill.
3. Install the extension and connect with an API token from the dashboard.
4. On an application page, use **AutoFill** for structured fields and/or **Draft All** for unanswered free-text questions.
5. On supported job boards, open the sidebar **Auto Apply** tab to run a user-started session (search filtered jobs, open each posting, fill steps, submit).
6. On ATS / employer career sites, autofill and Draft All fill fields - **the user reviews and clicks Submit**.

## Job board Auto Apply (end-to-end)
Supported today for sidebar Auto Apply:
- **LinkedIn Easy Apply**
- **Indeed Apply**
- **Totaljobs Quick Apply**
- **Glassdoor Easy Apply**
- **Reed Easy Apply**

More job board Auto Apply platforms are on the way. Auto Apply is **user-launched** from the extension - AutoCVApply is not a silent bot that applies without the user starting a run.

## ATS and employer career sites (autofill + Draft All, user submits)
Verified examples include: Workday, Greenhouse, Lever, Ashby, SmartRecruiters, Teamtailor, Oracle, BambooHR, Workable, iCIMS, Trakstar, WordPress, and other major ATS / career sites.
On these sites: autofill and Draft All help fill the form; the user stays in control of the final submit.

## Draft All
- Streams AI-written answers for unanswered free-text / screening questions.
- Answers should stay grounded in the saved CV profile (not generic filler).
- User reviews drafted answers before submit.
- Uses extension credits (prices shown in the extension).

## Credits and pricing (GBP, monthly; allowances reset on the 1st)
Extension AI actions spend **credits** from a monthly allowance.
Examples of credit use: Assist replies, cover letters, ATS scores, Draft All batches (exact prices shown in the extension).

| Plan | Price | Extension credits / month |
|------|-------|---------------------------|
| Free | £0 | 250 |
| Starter | £7/mo | 2,500 |
| Pro | £17/mo | 15,000 |

- CV upload and profile editing are **always free**.
- Paid plans bill via UK Direct Debit (GoCardless). Users can start on Free without a card.

## Product differentiators writers SHOULD emphasise
- Profile once → reuse across many applications ("upload once, apply everywhere").
- Job-board Auto Apply vs ATS autofill (different submit model - be precise).
- Draft All for screening questions with human review.
- Human-like typing / anti-bot behaviour on Auto Apply runs (not "undetectable hacking").
- Honest metering with credits; Free is enough to try the workflow.
- You stay in control: user starts Auto Apply; user submits on ATS sites.

## What AutoCVApply is NOT
- Not a job board.
- Not a silent auto-apply bot that submits without the user starting the run.
- Not unlimited AI usage on Free.
- Not a guarantee of interviews or offers.
- Not black-hat "hack the ATS" keyword stuffing.

## URLs (use verbatim when linking)
- Main site: `{$site}`
- Pricing: `{$site}/pricing`
- How to: `{$site}/how-to`
- Sign in / get started: `{$site}/login`
- Blog: `{$site}/blog`
- About: `{$site}/about`
- Official Chrome Web Store: `{$chromeStore}`

## Tone for blog posts
- Write for UK job seekers; plain, practical, specific.
- Name real product surfaces: AutoFill, Draft All, Auto Apply sidebar, profile upload.
- Prefer concrete workflows over vague "save time / reduce errors" fluff.
- Emphasise dignity of work and reducing admin burden - not misleading shortcuts.
- Be accurate about job-board Auto Apply vs ATS user-submit.

## Glossary
- **Profile**: structured CV data after upload and optional editing.
- **AutoFill**: fills empty form fields from the saved profile.
- **Draft All**: AI drafts answers for unanswered free-text / screening questions.
- **Auto Apply**: user-started sidebar session that searches and completes applications on supported job boards.
- **Credits**: monthly allowance for extension AI actions.
- **Extension**: Chrome/Firefox extension that fills forms in the browser from the connected profile.

CONTEXT;
    }

    public static function summaryForImagePrompt(): string
    {
        return <<<'SUMMARY'
AutoCVApply helps UK job seekers apply faster: upload a CV once, use a Chrome extension to autofill ATS forms, Draft All screening answers, and Auto Apply on LinkedIn, Indeed, Totaljobs, Glassdoor, and Reed. Warm, optimistic, professional - people at laptops completing job applications with less repetitive typing. Postbox-inspired red and navy accents optional; no logos or readable text in the image.
SUMMARY;
    }
}
