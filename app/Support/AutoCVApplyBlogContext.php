<?php

namespace App\Support;

/**
 * Authoritative marketing context for AI-generated AutoCVApply blog posts.
 */
class AutoCVApplyBlogContext
{
    public static function siteUrl(): string
    {
        return rtrim((string) config('app.url', 'https://autocvapply.com'), '/');
    }

    public static function document(): string
    {
        $site = self::siteUrl();

        return <<<CONTEXT
## How to use this document
This is the single source of truth for facts you may state about **AutoCVApply** in blog posts on autocvapply.com.
If something is not stated here, treat it as unknown rather than guessing.
Do not invent customer counts, success rates, or employer partnerships.

## What AutoCVApply is
AutoCVApply helps **workers and job seekers** apply for roles faster by storing a structured CV profile once, then **autofilling job application forms** on major hiring platforms via a Chrome extension.
Tagline themes include **"Upload once. Apply everywhere."** and **"Stop retyping your life story."**

Primary audience: people actively job hunting - graduates, career changers, contractors between contracts, and anyone filling repetitive application forms on employer sites.

## What is free vs what plans pay for
- **Always free on every plan**: uploading a PDF or Word CV, AI-assisted extraction into an editable profile, and editing that profile in the dashboard.
- **Metered by plan**: **extension autofill** - each **successfully filled form input** on a supported job site uses one autofill from the user's monthly allowance.

## How autofill works
1. User uploads a CV and reviews the parsed profile (name, contact, experience, skills, summary, etc.).
2. User installs the Chrome extension and connects with an API token from the dashboard.
3. On a supported job application page, the user clicks **AutoFill**; the extension fills empty fields from the saved profile.
4. **One autofill** = **one input successfully filled** (not one button click). A form with six empty fields filled in one action uses six autofills.

Supported platforms (extension autofill - verified examples include):
- Workday
- Greenhouse
- Lever
- Ashby
- SmartRecruiters
- Teamtailor
- Oracle
- BambooHR
- Workable
- iCIMS
- Trakstar
- WordPress
- Other major ATS and employer career sites

## Pricing (GBP, monthly; allowances reset on the 1st of each month)
| Plan | Price | Extension autofills / month |
|------|-------|-----------------------------|
| Free | £0 | 250 |
| Starter | £7/mo | 2,500 |
| Pro | £17/mo | 15,000 |

Paid plans bill via UK Direct Debit (GoCardless). Users can start on Free without a card.

## Benefits for workers (themes writers may develop)
- **Time saved**: less copy-paste across dozens of similar applications.
- **Fewer errors**: consistent contact details and employment history reduce typos and mismatched dates.
- **Less fatigue**: repetitive fields are draining; autofill lowers friction for each application.
- **Faster ramp-up**: upload a CV once instead of re-keying every profile from scratch.
- **Control**: users edit the parsed profile before anything is sent to forms; the extension reads the profile locally in the browser for autofill.
- **Affordable tiers**: Free is enough to try the workflow; Starter and Pro suit heavier application volumes.

## What AutoCVApply is NOT
- Not a job board and not an auto-apply bot that submits applications without the user.
- Not unlimited autofill on Free - plans have monthly input allowances.
- Not a guarantee of interviews or offers.

## URLs (use verbatim when linking)
- Main site: `{$site}`
- Pricing: `{$site}/pricing`
- Sign in / get started: `{$site}/login`
- Blog: `{$site}/blog`

## Tone for blog posts
- Write for UK job seekers by default; plain, practical, respectful tone.
- Emphasise dignity of work and reducing admin burden - not "hack the system" or misleading shortcuts.
- Be accurate about metering (per input filled) and supported platforms.

## Glossary
- **Profile**: structured CV data stored on AutoCVApply after upload and optional editing.
- **Autofill / autofills**: one successfully populated form input on a supported site.
- **Extension**: Chrome browser extension that detects application forms and fills them from the profile.

## Optional angles (non-exhaustive)
Why job applications ask the same questions repeatedly; preparing a profile before a busy application week; when Free vs Starter vs Pro makes sense; applying on Workday-heavy employers; reducing stress during redundancy or career transition; accessibility and consistency when filling long forms; security basics of API tokens for the extension.

CONTEXT;
    }

    public static function summaryForImagePrompt(): string
    {
        return <<<'SUMMARY'
AutoCVApply helps UK job seekers apply faster: upload a CV once, use a Chrome extension to autofill application forms on major ATS and career sites including Workday, Greenhouse, Lever, Ashby, and SmartRecruiters. Warm, optimistic, professional - people at laptops completing job applications with less repetitive typing. Postbox-inspired red and navy accents optional; no logos or readable text in the image.
SUMMARY;
    }
}
