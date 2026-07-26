<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Curated AutoCVApply vs competitor comparison posts for SEO.
 *
 * Bodies emphasise AutoCVApply's verified strengths and evaluation criteria.
 * They do not invent competitor feature matrices, pricing, or unsupported claims.
 */
class BlogCompetitorComparisons
{
    /**
     * @return array<int, array{
     *     id: string,
     *     competitor: string,
     *     title: string,
     *     slug: string,
     *     excerpt: string,
     *     category: string,
     *     angle: string,
     *     when_them: string,
     *     tags: array<int, string>
     * }>
     */
    public static function definitions(): array
    {
        $rows = [
            [
                'id' => 'autoapplymax',
                'competitor' => 'AutoApplyMax',
                'category' => 'auto-apply extension',
                'angle' => 'AutoApplyMax markets LinkedIn-heavy auto-apply with autofill elsewhere. AutoCVApply ships user-started Auto Apply across LinkedIn, Indeed, Totaljobs, Glassdoor, and Reed, plus AutoFill and Draft All on ATS career sites where you still click Submit.',
                'when_them' => 'You only care about LinkedIn Easy Apply volume and do not need UK board coverage or Draft All for Workday-style screening questions.',
            ],
            [
                'id' => 'lazyapply',
                'competitor' => 'LazyApply',
                'category' => 'mass apply tool',
                'angle' => 'LazyApply-style tools push high application volume. AutoCVApply pairs volume on supported boards with a profile-once workflow, Draft All for screeners, and an honest split: board Auto Apply vs ATS sites where you submit.',
                'when_them' => 'You want the highest possible raw apply count and are willing to accept less control over answers and board coverage trade-offs.',
            ],
            [
                'id' => 'simplify',
                'competitor' => 'Simplify',
                'category' => 'autofill / job search extension',
                'angle' => 'Simplify is often evaluated as a job-search and autofill companion. AutoCVApply focuses on upload-once profiles, Draft All for free-text screeners, and end-to-end Auto Apply on major UK boards from one sidebar.',
                'when_them' => 'You mainly want light autofill or discovery features and do not need multi-board Auto Apply or credit-based Draft All.',
            ],
            [
                'id' => 'loopcv',
                'competitor' => 'LoopCV',
                'category' => 'automated job matching / apply',
                'angle' => 'LoopCV-style products emphasise automated matching and outreach. AutoCVApply keeps you in the browser: you start Auto Apply on boards, review Draft All answers, and submit yourself on ATS forms.',
                'when_them' => 'You prefer a fully hands-off matching service and are less concerned about reviewing each application in your own browser.',
            ],
            [
                'id' => 'applyglide',
                'competitor' => 'ApplyGlide',
                'category' => 'auto-apply tool',
                'angle' => 'ApplyGlide sits in the auto-apply category. AutoCVApply differentiates with a structured CV profile, Draft All grounded in that profile, UK board Auto Apply coverage, and clear ATS honesty (you still submit).',
                'when_them' => 'You already like ApplyGlide\'s workflow and only apply on platforms it covers well.',
            ],
            [
                'id' => 'jobcopilot',
                'competitor' => 'JobCopilot',
                'category' => 'AI apply assistant',
                'angle' => 'JobCopilot-style assistants help draft and apply faster. AutoCVApply combines AutoFill, Draft All, and board Auto Apply under one extension token, with Free credits to try before paying.',
                'when_them' => 'You only need AI drafting help and already have a separate process for board applies and ATS forms.',
            ],
            [
                'id' => 'huntr',
                'competitor' => 'Huntr',
                'category' => 'job tracker / CRM',
                'angle' => 'Huntr is primarily a job-search tracker and CRM. AutoCVApply is built for filling and applying: profile once, AutoFill ATS fields, Draft All screeners, Auto Apply on supported boards. They solve different bottlenecks.',
                'when_them' => 'Your pain is pipeline organisation (stages, notes, reminders) more than repetitive form filling.',
            ],
            [
                'id' => 'sonara',
                'competitor' => 'Sonara',
                'category' => 'AI job apply',
                'angle' => 'Sonara competes in AI job apply. AutoCVApply emphasises browser-native fills, multi-board Auto Apply for UK seekers, Draft All with human review, and explicit ATS submit control.',
                'when_them' => 'You prefer Sonara\'s product packaging and do not need Totaljobs, Reed, or Glassdoor Auto Apply in one sidebar.',
            ],
            [
                'id' => 'teal',
                'competitor' => 'Teal',
                'category' => 'career tracker / resume toolkit',
                'angle' => 'Teal is known for career tracking and resume tooling. AutoCVApply is the apply engine after the CV is ready: parse once, AutoFill employer forms, Draft All answers, Auto Apply on boards.',
                'when_them' => 'You need a career CRM and resume builder more than Chrome autofill and board Auto Apply.',
            ],
            [
                'id' => 'massive',
                'competitor' => 'Massive',
                'category' => 'mass apply / automation',
                'angle' => 'Massive-style automation sells speed at volume. AutoCVApply sells controlled speed: you start runs, review Draft All, keep ATS submits in your hands, and reuse one profile across Workday-class forms.',
                'when_them' => 'You want maximum automation with minimal per-application review and accept that trade-off.',
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
                'excerpt' => "A practical AutoCVApply vs {$name} comparison for UK job seekers: boards, ATS autofill, Draft All, control, and pricing - without invented competitor claims.",
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
     * @param  array{
     *     id: string,
     *     competitor: string,
     *     title: string,
     *     slug: string,
     *     excerpt: string,
     *     category: string,
     *     angle: string,
     *     when_them: string,
     *     tags: array<int, string>
     * }  $definition
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
     * @param  array{
     *     competitor: string,
     *     category: string,
     *     angle: string,
     *     when_them: string
     * }  $definition
     */
    public static function body(array $definition): string
    {
        $site = AutoCVApplyBlogContext::siteUrl();
        $store = (string) config(
            'blog.sources.official_chrome_web_store_url',
            'https://chromewebstore.google.com/detail/autocvapply/mldeodhhcbnhnjklmelneecjpjkjemih',
        );
        $competitor = $definition['competitor'];
        $category = $definition['category'];
        $angle = $definition['angle'];
        $whenThem = $definition['when_them'];

        return <<<MD
## TL;DR

1. Decide what you need: board Auto Apply, ATS autofill, screening-answer drafts, a job tracker, or all of the above.
2. Compare tools on **control** (who starts applies / who clicks Submit), **board coverage**, and **profile reuse** - not marketing slogans.
3. AutoCVApply is built for UK-style searching: one CV profile, AutoFill on ATS forms, Draft All for free-text, Auto Apply on LinkedIn / Indeed / Totaljobs / Glassdoor / Reed.
4. {$competitor} sits in the {$category} space - use it if that narrower job matches your bottleneck.
5. Prefer the tool that keeps you reviewing answers; silent mass-apply rarely ages well.

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

- **Upload once**: PDF or Word CV → editable profile (free on every plan)
- **AutoFill**: structured fields on ATS and employer career sites (Workday, Greenhouse, Lever, Ashby, and similar)
- **Draft All**: screening / free-text answers grounded in your profile, then you edit tone
- **Auto Apply**: user-started sidebar sessions on LinkedIn Easy Apply, Indeed Apply, Totaljobs Quick Apply, Glassdoor Easy Apply, and Reed Easy Apply
- **Clear pricing**: Free (£0 / 1,500 credits), Starter (£7 / 12,500), Pro (£17 / 95,000) - see [pricing]({$site}/pricing)

### What this comparison is not

This is not a scraped feature matrix of {$competitor}. Products change. We do not invent their pricing, board lists, or detection claims. We explain when AutoCVApply is the better fit for repetitive applications, and when {$competitor} may still match a different need.

## When AutoCVApply is the better choice

Choose AutoCVApply when you:

- Apply across **multiple UK boards**, not only one feed
- Hit long **ATS** forms and want autofill plus Draft All without giving up Submit
- Want **one profile** powering AutoFill, Draft All, and Auto Apply
- Prefer **user-started** automation over a silent background bot
- Want a Free tier with real credits before paying

## When {$competitor} might still fit

{$whenThem}

If that describes you, use {$competitor} for that job - and still keep a clean CV. Tools do not replace targeting and review.

## Board Auto Apply vs ATS autofill (read this twice)

Many comparisons blur these models. AutoCVApply does not:

1. **Supported job boards** - Auto Apply can search, open, fill, and submit after **you** start the run from the extension.
2. **ATS / employer career sites** - AutoFill and Draft All fill fields; **you** review and click Submit.

If another tool implies silent apply everywhere, treat that as a risk signal, not a feature win.

## Pricing and trying without a card

AutoCVApply Free includes CV upload, profile editing, and 1,500 monthly extension credits. Paid plans are monthly GBP via UK Direct Debit. Full detail: [pricing]({$site}/pricing).

Always compare the **workflow you will use weekly**, not the lowest advertised headline price alone.

## FAQ

### Is AutoCVApply "better" than {$competitor} for everyone?

No. It is better when your bottleneck is repetitive forms and multi-board apply with review. Tracker-first or fully hands-off matching tools can win for other bottlenecks.

### Does AutoCVApply guarantee more interviews?

No. It reduces retyping and helps you apply consistently. Interview outcomes still depend on fit, CV quality, and the market.

### Will you list every {$competitor} feature?

No. Features change. This post stays inside AutoCVApply's verified product surface and a fair evaluation rubric.

### Can I use a tracker and AutoCVApply together?

Yes. Many people track stages in a CRM and use AutoCVApply for filling and board Auto Apply.

## Get started

1. [Upload your CV]({$site}/login) and tidy the parsed profile
2. Install the [Chrome extension]({$store}) (Firefox is supported too)
3. Try AutoFill on an ATS form, Draft All on a screener, or Auto Apply on a supported board

More product detail: [What is AutoCVApply?]({$site}/blog) and [How to]({$site}/how-to).
MD;
    }
}
