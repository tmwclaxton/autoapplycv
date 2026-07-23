<?php

namespace App\Support;

/**
 * Hand-written markdown bodies for the public blog catalog.
 */
class BlogCatalogBodies
{
    public static function whatIsAutocvapply(): string
    {
        $site = AutoCVApplyBlogContext::siteUrl();

        return <<<MD
## What AutoCVApply is

AutoCVApply is a Chrome and Firefox extension plus a web app that helps job seekers stop retyping the same CV details on every application.

You upload a CV once, turn it into an editable profile, then use that profile to:

1. **AutoFill** structured fields on ATS and employer career sites
2. **Draft All** answers for screening questions and free-text boxes
3. **Auto Apply** end-to-end on supported job boards from the extension sidebar

The short version: [upload once, apply everywhere]({$site}).

## Who it is for

Anyone filling repetitive application forms - graduates running volume schemes, contractors between gigs, career changers, and people bouncing between Workday, Greenhouse, LinkedIn Easy Apply, and Indeed Apply.

It is built for UK job seekers by default, but the workflow is the same wherever those forms show up.

## The three tools, clearly

### AutoFill

On an application page, AutoFill fills empty fields from your saved profile - name, contact, work history, education, and similar structured data.

On ATS and employer career sites (Workday, Greenhouse, Lever, Ashby, and others), you still review the form and click Submit yourself.

### Draft All

Draft All writes answers for unanswered free-text and screening questions, grounded in your saved profile rather than generic filler. You review the tone before anything goes out.

### Auto Apply

On supported job boards, the sidebar **Auto Apply** tab can search, open roles, fill steps, and submit. You start the run. It is not a silent bot applying in the background.

Supported today for end-to-end Auto Apply:

- LinkedIn Easy Apply
- Indeed Apply
- Totaljobs Quick Apply
- Glassdoor Easy Apply
- Reed Easy Apply

More boards are on the way.

## What is free vs what uses credits

Always free on every plan:

- Uploading a PDF or Word CV
- AI extraction into an editable profile
- Editing that profile in the dashboard

Extension AI actions use monthly **credits** (Assist, Draft All, cover letters, ATS scores, and similar tools - prices show in the extension).

| Plan | Price | Credits / month |
|------|-------|-----------------|
| Free | £0 | 250 |
| Starter | £7/mo | 2,500 |
| Pro | £17/mo | 15,000 |

Allowances reset on the 1st. Paid plans bill by UK Direct Debit via GoCardless. See [pricing]({$site}/pricing).

## What AutoCVApply is not

- Not a job board
- Not a guarantee of interviews or offers
- Not a silent auto-apply bot that submits without you starting the run
- Not "hack the ATS" keyword stuffing

## How to start

1. [Create an account]({$site}/login) and upload your CV
2. Review the parsed profile
3. Install the [Chrome](https://chromewebstore.google.com/detail/autocvapply/mldeodhhcbnhnjklmelneecjpjkjemih) or Firefox extension and connect it
4. Open a real application and try AutoFill, Draft All, or Auto Apply

For a walkthrough of the product surfaces, see [How to]({$site}/how-to).
MD;
    }

    public static function workdayAutofill(): string
    {
        $site = AutoCVApplyBlogContext::siteUrl();

        return <<<MD
## Why Workday forms feel endless

Employer career sites built on Workday, Greenhouse, Lever, or Ashby ask for the same contact details, dates, and employment history you already put on your CV. Doing that by hand across dozens of roles is where applications stall.

## AutoFill on ATS sites

With AutoCVApply:

1. Upload and edit your profile on [autocvapply.com]({$site}/login)
2. Connect the Chrome or Firefox extension
3. Open the employer application
4. Run **AutoFill** so empty fields pull from your profile

AutoFill targets structured fields. It does not invent answers for open "Why do you want this role?" boxes - that is what **Draft All** is for.

## You still click Submit

On ATS and employer career sites, AutoCVApply fills the form in your browser. You review the page and submit yourself. That is intentional. Board **Auto Apply** (LinkedIn, Indeed, and similar) is a different mode where you start an end-to-end run from the sidebar.

## A practical Workday week

- Clean the profile once before a heavy application day
- AutoFill the repeated fields on each employer site
- Use Draft All only on the free-text screeners that actually need prose
- Spend credits where they help; skip weak-fit roles if you use ATS scoring

Upload once, then stop rebuilding your life story on every Workday wizard.
MD;
    }

    public static function linkedinAutoApply(): string
    {
        $site = AutoCVApplyBlogContext::siteUrl();

        return <<<MD
## LinkedIn Easy Apply is still a multi-step form

Easy Apply is faster than a full ATS wizard, but you still hit contact steps, resume cards, and screening questions. Doing that one job at a time adds up.

## Auto Apply from the sidebar

AutoCVApply's extension sidebar **Auto Apply** tab can run LinkedIn Easy Apply end-to-end:

1. Search with Easy Apply filters
2. Open each role
3. Fill the steps from your profile
4. Draft or review screening answers
5. Submit

You launch the session. Nothing applies while the extension sits idle.

## Draft All on screening questions

When LinkedIn asks free-text screeners, Draft All can propose answers grounded in your saved CV. Read them before they go out. Generic AI filler is worse than a short honest answer.

## Easy Apply vs ATS submits

| Mode | Platforms | Who submits |
|------|-----------|-------------|
| Auto Apply | LinkedIn Easy Apply (and other supported boards) | Extension run you started |
| AutoFill + Draft All | Workday, Greenhouse, and other ATS sites | You click Submit |

Same profile either way. Different control model. Start from [the dashboard]({$site}/login), then open LinkedIn with the extension connected.
MD;
    }

    public static function graduateVolume(): string
    {
        $site = AutoCVApplyBlogContext::siteUrl();

        return <<<MD
## Graduate schemes ask the same things

Contact details, education, work history, right-to-work, and a handful of competency questions show up on almost every scheme portal. The content barely changes; the HTML does.

## One profile, many schemes

Upload your CV to [AutoCVApply]({$site}/login), fix the parsed profile once, then AutoFill the repeated fields on each employer form. When a free-text screener appears, use Draft All and edit the answer so it sounds like you.

## Volume without autopilot

High volume does not mean unsupervised. On ATS sites you still submit. On supported job boards you start Auto Apply yourself. The win is not skipping judgment - it is skipping retyping.

## A sane graduate week

1. Fix the profile on Sunday
2. Batch applications on the boards and portals you care about
3. Review Draft All answers before send
4. Track credits so Free vs Starter matches your intensity

If you are new to the product, read [What is AutoCVApply?]({$site}/blog/what-is-autocvapply) first.
MD;
    }

    public static function contractorBetweenGigs(): string
    {
        $site = AutoCVApplyBlogContext::siteUrl();

        return <<<MD
## Between contracts, applications spike

When a contract ends, you often apply across several employer portals in a short window. Each one wants the same employment history with slightly different field names.

## Keep one profile warm

Store the current CV in AutoCVApply, keep dates and client names accurate, and AutoFill career-site forms instead of rebuilding the timeline from scratch every evening.

Contractors usually hit ATS sites (Workday, Greenhouse, Lever, Ashby) more than consumer job boards. On those sites AutoFill and Draft All help; you still click Submit.

## What to update between gigs

- Latest role title and dates
- Skills that match the brief you want next
- Right-to-work and notice period answers you reuse often

Then apply. The profile is the reusable asset; each application is still your call.

Get started at [{$site}/login]({$site}/login).
MD;
    }

    public static function autofillControlMyth(): string
    {
        $site = AutoCVApplyBlogContext::siteUrl();

        return <<<MD
## The myth

"If I install an autofill extension, it will spray applications without me."

That is not how AutoCVApply works.

## What actually happens

- The extension fills fields **in your browser** from your saved profile
- On ATS and employer career sites, **you** review and click Submit
- On supported job boards, **Auto Apply** only runs after you start it from the sidebar
- Draft All proposes answers; it does not silently send them

## Why that design

Job applications are still your name on the line. Automation should remove retyping, not remove consent.

## Practical control checklist

1. Edit the profile before a busy day
2. Watch the first AutoFill on a new ATS
3. Read Draft All answers before submit
4. Only start Auto Apply when you mean to run a session

If you want the product overview first, see [What is AutoCVApply?]({$site}/blog/what-is-autocvapply).
MD;
    }

    public static function draftAllWorkday(): string
    {
        $site = AutoCVApplyBlogContext::siteUrl();

        return <<<MD
## The blank box problem

Workday and Greenhouse forms are not only contact fields. They also drop in "Why this role?", competency, and motivation questions. Staring at an empty box after you already AutoFilled the structured fields is where people stall.

## What Draft All does

Draft All writes answers for unanswered free-text and screening questions using your saved AutoCVApply profile. It is meant to sound like you, not like a generic cover-letter bot.

You still:

1. Read every drafted answer
2. Edit anything that feels off
3. Click Submit yourself on ATS sites

## Pair it with AutoFill

- **AutoFill** for name, history, education, and other structured fields
- **Draft All** for the prose questions
- **You** for the final submit

Credits apply to Draft All batches (prices show in the extension). Profile upload and editing stay free.

New here? Start with [What is AutoCVApply?]({$site}/blog/what-is-autocvapply).
MD;
    }

    public static function ukBoardsAutoApply(): string
    {
        $site = AutoCVApplyBlogContext::siteUrl();

        return <<<MD
## UK boards, one sidebar

AutoCVApply can run end-to-end Auto Apply on:

- Indeed Apply
- Totaljobs Quick Apply
- Glassdoor Easy Apply
- Reed Easy Apply
- LinkedIn Easy Apply

You open the extension sidebar, start Auto Apply, and the session searches, opens roles, fills steps, and submits. You launch it. It does not run while you sleep.

## Same profile, different boards

Your uploaded CV profile feeds every board. Screening questions can use Draft All. Structured fields use AutoFill under the hood during the run.

## Boards vs ATS

On these job boards, Auto Apply can complete the flow. On employer ATS sites (Workday, Greenhouse, and similar), AutoFill and Draft All help, but you still click Submit.

Overview: [What is AutoCVApply?]({$site}/blog/what-is-autocvapply). Get started at [{$site}/login]({$site}/login).
MD;
    }
}
