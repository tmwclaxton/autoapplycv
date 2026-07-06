<p align="center">
  <img src="public/favicon.svg" alt="AutoCVApply" width="72" height="72" />
</p>

<h1 align="center">AutoCVApply</h1>

<p align="center">
  <strong>Upload once. Apply everywhere.</strong><br />
  Stop retyping your life story into every job form.
</p>

<p align="center">
  <a href="https://autocvapply.com"><img src="https://img.shields.io/badge/Website-autocvapply.com-C8102E?style=for-the-badge" alt="Website" /></a>
  <a href="https://github.com/tmwclaxton/autoapplycv"><img src="https://img.shields.io/badge/GitHub-Source-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub" /></a>
</p>

<p align="center">
  <a href="https://autocvapply.com">Website</a> ·
  <a href="https://github.com/tmwclaxton/autoapplycv">GitHub</a> ·
  <a href="https://autocvapply.com/how-to">How it works</a> ·
  <a href="https://autocvapply.com/dashboard">Dashboard</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Laravel-13-FF2D20?logo=laravel&logoColor=white" alt="Laravel 13" />
  <img src="https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/Inertia-3-E644AD" alt="Inertia v3" />
  <img src="https://img.shields.io/badge/PHP-8.5-777BB4?logo=php&logoColor=white" alt="PHP 8.5" />
  <img src="https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome MV3" />
  <img src="https://img.shields.io/badge/form%20corpus-2%2C350%20scenarios-2ea44f" alt="2,350 form scenarios" />
  <img src="https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-orange.svg" alt="PolyForm Noncommercial License 1.0.0" />
</p>

<p align="center">
  <strong><a href="https://autocvapply.com">Sign up free at autocvapply.com</a></strong> - upload your CV, connect the extension, fill forms in minutes.<br />
  <sub><strong>LinkedIn Easy Apply:</strong> full end-to-end Auto Apply from the extension sidebar. On other ATS forms, you review every field and click Submit yourself.</sub>
</p>

---

## Table of contents

**Getting started**

- [See it in action](#see-it-in-action)
- [What is AutoCVApply?](#what-is-autocvapply)
- [Without vs with AutoCVApply](#without-vs-with-autocvapply)
- [Quick install](#quick-install)

**Using AutoCVApply**

- [How it works](#how-it-works)
- [LinkedIn Easy Apply Auto Apply](#linkedin-easy-apply-auto-apply)
- [Features](#features)
- [Supported platforms](#supported-platforms)
- [Postbox design](#postbox-design)
- [Pricing](#pricing)
- [Security & privacy](#security--privacy)
- [Testing overview](#testing-overview)
- [Job search tips](#job-search-tips)
- [Links](#links)

**For developers**

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started (local dev)](#getting-started-local-dev)
- [Form corpus quality engineering](#form-corpus-quality-engineering)
- [LinkedIn Auto Apply testing](#linkedin-auto-apply-testing)
- [Key commands](#key-commands)
- [API](#api)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## See it in action

<!-- TODO: replace with YouTube thumbnail + link once demo video is recorded -->
<!-- [![AutoCVApply demo](https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg)](https://youtu.be/VIDEO_ID) -->

> **Demo video coming soon.** Until then, see [How it works on autocvapply.com](https://autocvapply.com/how-to) or sign up and try Draft All on a real Greenhouse or Ashby form.

---

## What is AutoCVApply?

Job applications are a copy-paste endurance test. Workday wants your address. Greenhouse wants it again. Ashby wants a cover letter you've already written three times this week. Every ATS renders the same questions differently - custom widgets, shadow DOM, multi-step wizards, iframe embeds.

**AutoCVApply** reads your CV once, builds a structured profile, and stamps it onto application forms through a battle-tested Chrome extension - so you spend time on roles that matter, not on retyping your phone number for the forty-seventh time.

## Without vs with AutoCVApply

| Without AutoCVApply | With AutoCVApply |
|---------------------|------------------|
| Retype contact details, education, and skills on every ATS | **One structured profile** - filled from your uploaded CV |
| Blank stare at "Why do you want this role?" textareas | **Draft All** streams AI answers for free-text questions |
| Skip cover letters because they're tedious | **One-click cover letter** tailored to the job description |
| Same generic CV for every posting | **Tailored resume draft** matched to the role |
| No idea how your CV reads against the JD | **ATS score** with keyword and formatting feedback |
| Pray comboboxes and wizards don't break mid-form | **2,350-scenario test corpus** - Greenhouse, Ashby, Workday, and more |
| Click through LinkedIn Easy Apply one job at a time | **LinkedIn Easy Apply Auto Apply** - search, open, fill, and submit from the extension sidebar |
| Submit applications blindly | **You stay in control on ATS forms** - we fill fields; you review and submit |

> **LinkedIn Easy Apply Auto Apply** runs end-to-end: search Easy Apply jobs, open each posting, fill every step, and submit. More platforms coming soon.

## Who it's for

- **Job seekers** applying across multiple ATS platforms in a week
- **Career changers** who need tailored answers without rewriting everything
- **Privacy-conscious applicants** who want a clear account, revocable API tokens, and a published [privacy policy](https://autocvapply.com/privacy)
- **Developers and contributors** who care about verified form-fill quality, not just demo GIFs

**Why choose AutoCVApply?**

- **Save time** - autofill plus AI drafting for the questions that actually slow you down
- **Stay honest** - answers draw from your profile and preferences, not invented credentials
- **Sound human, not generic** - Draft All answers are scored on hundreds of scenarios to catch AI tropes, em dashes, and filler while staying grounded in your CV
- **Trust the engineering** - four-layer fill verification, Playwright smoke tests, and 230 PHPUnit methods
- **British Postbox UI** - Royal Mail red, navy, warm paper tones. Feels like sending a letter, not filling a spreadsheet

## Quick install

> **Recommended:** create a free account at **[autocvapply.com](https://autocvapply.com)**, upload your CV, then download the extension from your dashboard. Chrome Web Store listing is not live yet - sideload via zip for now.

### Production (autocvapply.com)

1. **[Sign up](https://autocvapply.com)** and upload your CV
2. Open **Dashboard → Extension** and choose your browser
3. Download the zip (Chrome, Edge, Brave, or Firefox)
4. Sideload using the on-screen instructions
5. Copy your connection JSON (`token` + `api_base`) into the extension sidebar

| Browser | Install method | Store listing |
|---------|----------------|---------------|
| **Chrome / Edge / Brave** | Download zip from dashboard → Load unpacked | Chrome Web Store - *coming soon* |
| **Firefox** | Download zip from dashboard → Load Temporary Add-on | Firefox Add-ons - *coming soon* |

### From source (developers)

Clone this repo, run `composer run setup`, build the extension with `npm run build:extension`, then load `extension/dist/` unpacked in Chrome. See [Getting started (local dev)](#getting-started-local-dev) for full setup.

---

## How it works

```mermaid
flowchart LR
    A["📄 Upload CV<br/>PDF or Word"] --> B["🤖 AI extraction<br/>NanoGPT"]
    B --> C["✏️ Review profile<br/>Dashboard"]
    C --> D["🔌 Connect extension<br/>API token"]
    D --> E["⚡ Autofill + Draft All<br/>Any ATS · any site"]
    D --> L["🤖 Auto Apply tab<br/>LinkedIn Easy Apply E2E"]
    E --> F["📝 Cover letters<br/>Tailored resumes · ATS score"]
    L --> F
```

| Step | What happens |
|------|--------------|
| **1. Post your CV** | Drop a PDF or DOCX. Tesseract OCR + NanoGPT extract name, contact, skills, experience, and education into a structured profile. |
| **2. Check the details** | Tweak anything we missed - summary, visa status, salary expectations, application preferences. |
| **3. Connect the extension** | Install the Chrome or Firefox extension, paste your connection JSON (`token` + `api_base`) from the dashboard. |
| **4. Fill and draft** | Autofill fields on any job form. **Draft All** streams AI-written answers for free-text questions, cover letters, and tailored resumes. **You submit when ready.** |
| **5. Auto Apply (LinkedIn)** | Open the extension sidebar **Auto Apply** tab, run a LinkedIn Easy Apply search, and let the extension open each job, fill every step, and submit. More platforms coming soon. |

## LinkedIn Easy Apply Auto Apply

Full end-to-end applications on LinkedIn Easy Apply - not just field fill:

| Step | What happens |
|------|--------------|
| **Search** | Extension runs LinkedIn job search with Easy Apply filters from the sidebar **Auto Apply** tab |
| **Open** | Each matching job opens in a tab; non-Easy Apply listings are skipped |
| **Fill** | Contact info, screening questions, and multi-step wizards are filled from your profile |
| **Submit** | Review and submit buttons are clicked to complete the application |

On Greenhouse, Ashby, Workday, and other ATS platforms, autofill and Draft All still work as before - **you review and click Submit yourself**. More full Auto Apply platforms are on the way.

## Features

| Module | Feature | What it does |
|--------|---------|--------------|
| **CV parsing** | PDF & Word upload | Structured profile extraction with Tesseract OCR + local `pdftoppm` preprocessing |
| **CV parsing** | Editable profile | Skills, experience, education, summary, application preferences - you control the source of truth |
| **Autofill** | One-click fill | Profile data stamped onto native inputs, comboboxes, radios, checkboxes, multi-step wizards |
| **Autofill** | Shadow DOM & iframes | Content scripts traverse embedded ATS widgets other extensions miss |
| **Auto Apply** | LinkedIn Easy Apply E2E | Sidebar **Auto Apply** tab: search, open jobs, fill steps, submit applications |
| **Auto Apply** | More platforms soon | Full end-to-end Auto Apply for additional platforms is in development |
| **Application Assistant** | Field inventory | AI maps the page's questions to fillable refs before drafting |
| **Application Assistant** | Job context | Extracts title, company, and description from the posting |
| **Application Assistant** | Draft All | Streams batch answers for unanswered fields (NDJSON) |
| **Application Assistant** | Draft field | Single-field AI answer on demand |
| **Application Assistant** | Answer quality | Rubric scoring on AI drafts - human tone, profile grounding, banned AI phrases, no em dashes |
| **Documents** | Cover letter | Job-specific letter from your profile + posting |
| **Documents** | Tailored resume | Role-matched resume draft |
| **Documents** | ATS score | Keyword and compatibility feedback against the job description |
| **Dashboard** | Usage & billing | Monthly autofill allowance, extension connection, GoCardless subscriptions (UK) |
| **Analytics** | Public aggregate stats | Daily totals across all users - no personal application history exposed |

### Human-sounding AI drafts

Draft All and Quick Answer use AI, but we score generated answers extensively before shipping changes - not just on a handful of demo forms.

| What we check | Why it matters |
|---------------|----------------|
| **Grounding** | Real employers, roles, and skills from your profile - not invented credentials |
| **Human tone** | Banned AI phrases and overused words ("leverage", "proven track record", "I am thrilled to apply") |
| **Formatting** | No em dashes or markdown - plain text ready to paste into employer forms |
| **Honesty** | Gaps acknowledged instead of fabricated experience |

Scoring runs across 100+ answer-quality scenarios, 150 real ATS form fixtures, and Assist sidebar test cases. Developer audit commands: `answer-quality:audit`, `assist-answer-quality:audit`, `form-e2e:score` (see [`scripts/extension-benchmark/README.md`](scripts/extension-benchmark/README.md)).

## Supported platforms

AutoCVApply works on most major ATS and employer career sites - including Workday, Greenhouse, Lever, Ashby, SmartRecruiters, and many more. Autofill is verified against real and synthetic fixtures on the platforms below:

| Platform | Coverage | Notes |
|----------|----------|-------|
| **LinkedIn Easy Apply** | Full Auto Apply E2E | Search, open, fill, and submit via extension sidebar **Auto Apply** tab |
| **Ashby** | Curated + smoke + widget checks | Yes/no and checkbox widget scenarios |
| **Greenhouse** | Curated + smoke | Scraped real boards in corpus |
| **Lever** | Curated + smoke | Multi-step apply flows |
| **Workday** | Curated + smoke | Wizard-style applications |
| **SmartRecruiters** | Curated + smoke | Long multi-section forms |
| **Teamtailor** | Curated + smoke | Nordic/EU hiring stacks |
| **BambooHR** | Curated tier | HR suite apply pages |
| **Trakstar** | Curated tier | Performance/hiring forms |
| **WordPress / WPForms** | Curated + smoke | Generic employer sites |
| **Any site** | Extension runs on `<all_urls>` | Deepest test coverage on ATS platforms above - not where we stop |

## Postbox design

British utilitarian UI - Royal Mail red, navy, warm paper tones. Built to feel like sending a letter, not filling in a spreadsheet.

## Pricing

Plans are based on **extension autofill** allowance. CV upload and profile editing are free on every plan.

| Plan | Price | Autofills / month |
|------|-------|-------------------|
| **Free** | £0 | 250 |
| **Starter** | £7/mo | 2,500 |
| **Pro** | £17/mo | 15,000 |

> Each successfully filled form input uses one autofill. Allowances reset on the 1st of each month.

## Security & privacy

- **Your profile, your account** - CV and structured profile data live on autocvapply.com under WorkOS authentication. You can delete your account from settings.
- **Extension fills locally** - the browser extension fetches your profile via a revocable Sanctum token and writes values into the page DOM. It does not send completed submissions back to us.
- **No data selling** - we do not sell personal data. See the full [privacy policy](https://autocvapply.com/privacy).
- **AI processing** - CV parsing and drafting send text to our NanoGPT provider as needed to extract fields or generate answers. Job context from the page may be included in draft requests.
- **Source available** - PolyForm Noncommercial-licensed core. Inspect the extension, backend, and 2,350-scenario test corpus on GitHub. Free for personal and non-commercial use; commercial use requires permission.
- **You submit on ATS forms** - autofill and Draft All never auto-click Submit on Greenhouse, Ashby, Workday, and similar sites. **LinkedIn Easy Apply Auto Apply** completes submissions end-to-end from the sidebar; other full Auto Apply platforms are coming soon.

## Testing overview

AutoCVApply is verified by two complementary test pyramids - not a handful of smoke tests:

| Pyramid | Scope | Fast tier (CI on every push) |
|---------|-------|----------------------------|
| **ATS form corpus** | 2,350 extraction scenarios, 97 curated fill-verify cases, 10 platform smoke fixtures | Curated JSDOM (48) + Playwright smoke |
| **LinkedIn Auto Apply** | 212+ live-captured Easy Apply modals + 50 synthetic edge cases | Unit tests + offline corpus |

Both pyramids enforce **100% pass rates** on critical tiers before merge. Full tier breakdowns, commands, and fixture layout are in [Form corpus quality engineering](#form-corpus-quality-engineering) and [LinkedIn Auto Apply testing](#linkedin-auto-apply-testing) below.

## Job search tips

Practical advice for high-volume applications (no magic numbers - your mileage varies):

1. **Apply while the posting is fresh.** Early applicants often face less competition; automation helps you move faster without cutting corners on quality.
2. **Keep your master CV ATS-simple.** Single column, standard headings, no graphics in the parse path. Use AutoCVApply's ATS score against the job description before you submit.
3. **Tailor the narrative, not just keywords.** Draft All and cover letters work best when your profile summary and application preferences reflect what you actually want.
4. **Review every field.** We fill aggressively; you confirm accuracy - especially salary, visa, and eligibility questions.
5. **Track applications yourself for now.** Use your own spreadsheet or notes; a personal application tracker in the dashboard is on the roadmap.

## Links

| | |
|---|---|
| **Website** | [autocvapply.com](https://autocvapply.com) |
| **Dashboard** | [autocvapply.com/dashboard](https://autocvapply.com/dashboard) |
| **How it works** | [autocvapply.com/how-to](https://autocvapply.com/how-to) |
| **Analytics** | [autocvapply.com/analytics](https://autocvapply.com/analytics) |
| **Blog** | [autocvapply.com/blog](https://autocvapply.com/blog) |
| **Privacy** | [autocvapply.com/privacy](https://autocvapply.com/privacy) |
| **Contact** | [autocvapply.com/contact](https://autocvapply.com/contact) |
| **GitHub** | [github.com/tmwclaxton/autoapplycv](https://github.com/tmwclaxton/autoapplycv) |
| **Discord** | [discord.gg/DqqqTv3Spt](https://discord.gg/DqqqTv3Spt) - extension help & community |
| **Chrome Web Store** | *Listing not published yet - use dashboard zip download* |
| **Form corpus docs** | [`scripts/form-corpus/README.md`](scripts/form-corpus/README.md) |

---

## Architecture

```mermaid
flowchart TB
    subgraph Browser["Chrome Extension (MV3)"]
        CS["Content scripts<br/>form-heuristics · field-inventory"]
        SP["Side panel<br/>assist · documents"]
        BG["Service worker<br/>connection · file transfer"]
    end

    subgraph Laravel["Laravel 13 Backend"]
        WEB["Inertia + Vue dashboard"]
        API["Sanctum API<br/>profile · assist · autofill"]
        AI["NanoGPT<br/>CV parse · draft · score"]
        DB[(PostgreSQL)]
    end

    CS <-->|"field inventory<br/>apply answers"| SP
    SP -->|"Bearer token"| API
    BG -->|"Bearer token"| API
    WEB -->|"WorkOS SSO"| WEB
    API --> AI
    API --> DB
```

| Component | Role |
|-----------|------|
| `extension/src/content/` | DOM heuristics, field inventory, iframe traversal, portal bar |
| `extension/src/sidepanel/` | Connection setup, Draft All UI, document uploads |
| `app/Services/ApplicationAssistantService.php` | Inventory, job context, streaming draft-all, cover letters |
| `app/Services/CvParserService.php` | PDF/Word ingestion, OCR, NanoGPT structured extraction |
| `scripts/form-corpus/` | Synthetic corpus generation, fill verification pyramid, E2E harness |

## Tech stack

| Layer | Technology |
|-------|------------|
| Backend | Laravel 13, PHP 8.5 |
| Frontend | Inertia v3, Vue 3, Tailwind CSS v4 |
| Auth | WorkOS (web), Laravel Sanctum (extension API) |
| AI | NanoGPT (`gpt-4.1-mini`) - CV extraction, drafting, ATS scoring |
| OCR | Tesseract + poppler (`pdftoppm`) locally; NanoGPT vision as fallback |
| Payments | GoCardless (UK Direct Debit subscriptions) |
| Extension | Chrome MV3 - content scripts, side panel, service worker |
| Fill verification | JSDOM, Playwright, pixelmatch, Tesseract.js |
| Routing | Laravel Wayfinder (typed TS route helpers) |

## Project structure

```
autocvapply/
├── app/
│   ├── Http/Controllers/       # Web + API + billing + webhooks
│   ├── Models/                 # User, CvProfile, CvUpload
│   └── Services/               # CV parser, Application Assistant, NanoGPT
├── extension/
│   ├── src/content/            # form-heuristics.js, field-inventory.js
│   ├── src/sidepanel/          # Connection, Draft All, documents
│   └── dist/                   # Built extension (load unpacked)
├── scripts/form-corpus/        # Corpus generation + fill verification pyramid
├── resources/js/
│   ├── pages/                  # Inertia pages (Welcome, Dashboard, Billing…)
│   └── components/postbox/     # Shared Postbox UI components
├── tests/
│   ├── Unit/Extension/         # 11 extension test suites (fill, E2E, extraction)
│   └── fixtures/
│       ├── form-extraction/    # 2,350-scenario corpus (html, expected, manifest)
│       └── extension-e2e/      # E2E mocks, scenarios, reports
└── config/subscriptions.php    # Plan tiers and token limits
```

## Getting started (local dev)

### Prerequisites

- PHP 8.5+, Composer
- Node.js 20+, npm
- PostgreSQL (or SQLite for quick local dev)
- [Docker Sail](https://laravel.com/docs/sail) optional

### Install

```bash
git clone https://github.com/tmwclaxton/autoapplycv.git
cd autoapplycv

cp .env.example .env
composer install
npm install

php artisan key:generate
php artisan migrate
npm run build
```

Or use the one-shot setup:

```bash
composer run setup
```

### Environment

Copy `.env.example` to `.env` and configure:

```env
APP_URL=http://localhost

# WorkOS - required for login
WORKOS_CLIENT_ID=
WORKOS_API_KEY=
WORKOS_REDIRECT_URL="${APP_URL}/authenticate"

# NanoGPT - required for CV parsing
NANOGPT_API_KEY=

# GoCardless - optional, for paid subscriptions
GOCARDLESS_ACCESS_TOKEN=
GOCARDLESS_WEBHOOK_SECRET=
```

### Run locally

```bash
composer run dev
```

Starts the Laravel server, queue worker, log tail, and Vite dev server together.

With Docker Sail:

```bash
./vendor/bin/sail up -d
./vendor/bin/sail npm run dev
```

Visit [http://localhost](http://localhost).

### Build the browser extension

```bash
npm run build:extension
```

The build uses `APP_URL` from `.env` only to exclude your local dashboard from content-script injection. The extension API endpoint comes from the dashboard connection JSON (`token` + `api_base`).

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/dist/` folder

Generate a connection from the dashboard (**Copy** includes `token` + `api_base`) and paste it into the extension sidebar.

## Form corpus quality engineering

> **This is not a side-project extension with a handful of smoke tests.** AutoCVApply ships with one of the most exhaustive form-autofill verification pipelines in the job-application tooling space - built because a single missed combobox on a Greenhouse form is a failed application.

### The numbers

| Metric | Count | Source |
|--------|------:|--------|
| Form extraction scenarios | **2,350** | `tests/fixtures/form-extraction/manifest.json` |
| Vetted scenarios | **2,346** | same manifest (`status: vetted`; 4 pending) |
| HTML fixtures + expected snapshots | **2,350 each** | `tests/fixtures/form-extraction/html/` · `expected/` |
| Curated fill-verify scenarios | **97** (48 JSDOM · 49 Playwright) | `tests/fixtures/form-extraction/fill-verify-curated.json` |
| Platform smoke scenarios | **10** (+ 2 Ashby widget checks) | `fill-verify-smoke.json` · `run-ashby-*-playwright.mjs` |
| Extension E2E scenarios | **103** (10 in CI) | `tests/fixtures/extension-e2e/e2e-scenarios.json` |
| PHPUnit test methods | **230** | `tests/**/*Test.php` |
| Platform buckets in curated tier | **16** | `scripts/form-corpus/lib/curated-manifest.mjs` |

The corpus blends **544 scraped real ATS pages** (via Firecrawl) with **1,806 synthetic scenarios** - including 500 **syn-corpus2** ATS-style fixtures plus framework mega-forms for React, Vue, Angular, Svelte, Shadow DOM, Workday wizards, conditional fields, and combobox edge cases.

### The test pyramid

Every change to `form-heuristics.js` or `field-inventory.js` must survive the full pyramid before merge:

```mermaid
flowchart TB
    subgraph L1["Layer 1 - Fast feedback"]
        U["PHPUnit unit tests<br/>230 methods"]
        P["Propagation + mock answer tests"]
        D["Debug log golden replay"]
    end

    subgraph L2["Layer 2 - Curated JSDOM"]
        J["48 synthetic scenarios<br/>4-layer verification · 100% pass"]
    end

    subgraph L3["Layer 3 - Real browser"]
        S["Platform smoke<br/>10 ATS fixtures + Ashby widgets"]
        PW["Curated Playwright<br/>49 scraped ATS pages"]
        VR["Visual regression<br/>screenshot baselines"]
    end

    subgraph L4["Layer 4 - Full extension"]
        E2E["Extension E2E<br/>103 scenarios · real MV3 + mocked API"]
    end

    L1 --> L2 --> L3 --> L4
```

| Tier | Engine | Scope | CI job |
|------|--------|-------|--------|
| **Unit** | JSDOM / Node | Propagation, mock answers, debug-log replay | `tests.yml` → `php-tests` |
| **Corpus sanity** | PHPUnit | Corpus size checks (2,350 scenarios, 2,346 vetted) | `tests.yml` → `php-tests` |
| **Form extraction eval** | JSDOM | All 2,346 vetted scenarios vs expected field inventory | `tests-heavy.yml` (manual) |
| **Curated JSDOM** | JSDOM | 48 synthetic scenarios, 4-layer checks at 100% | `tests.yml` → `extension-fill` |
| **Platform smoke** | Playwright | 1 scenario per ATS/platform + Ashby yes/no + checkbox | `tests.yml` → `extension-fill` |
| **Curated Playwright** | Playwright | 49 priority scraped ATS fixtures | `tests-heavy.yml` (manual) |
| **Visual regression** | Playwright + pixelmatch | Baseline compare on smoke subset | `tests-heavy.yml` (manual) |
| **Extension E2E** | Playwright + unpacked MV3 | Full Draft All with mocked assist API (103 total · 10 in CI) | `extension-fill` (CI subset) · `tests-heavy.yml` (full batch) |

### Four layers of fill verification

Each curated JSDOM scenario passes **four independent checks** - not just "did we set a value?":

| Layer | What it proves |
|-------|----------------|
| **DOM readback** | Re-reads filled values from the DOM after `applyAnswerByRefAllFrames` |
| **HTML5 validity** | `element.checkValidity()` / `form.checkValidity()` on native controls |
| **Accessibility state** | `aria-checked`, `aria-selected`, `aria-pressed`, combobox collapsed state |
| **Error banners** | Ashby/Greenhouse-style validation messages, `[role="alert"]`, `[aria-invalid="true"]` |

Additional tiers add **OCR readback** (Playwright + Tesseract on Ashby fixtures), **pixel diff** (before/after screenshot % change), and **debug log golden replay** (extension phase summaries).

### Pass-rate thresholds (enforced in CI)

| Tier | Critical | Overall |
|------|----------|---------|
| JSDOM curated | 100% | 100% |
| Playwright priority | 100% | 100% |
| Platform smoke | 100% | 100% |
| Extension E2E | 100% | 100% |

### CI pipeline

Fast feedback runs on every push to `main` and `develop`; the heavy corpus eval tier is manual-only:

| Workflow | Trigger | What runs |
|----------|---------|-----------|
| **`tests.yml` → `php-tests`** | Push / PR | Laravel suite on PostgreSQL 17 - excludes `@group playwright` and `@group extension-e2e`; corpus sanity checks only (not full extraction eval) |
| **`tests.yml` → `extension-fill`** | Push / PR | `npm run build:extension` → curated JSDOM verify (48 scenarios) → Playwright platform smoke |
| **`tests-heavy.yml`** | Manual dispatch | Full 2,346-scenario extraction eval · comprehensive fill verify · curated Playwright · visual regression · extension E2E batch (~103 scenarios) |
| **`lint.yml`** | Push / PR | Laravel Pint, ESLint, Prettier |
| **`prod_deploy.yml`** | Push to `main` | Docker build → GHCR push → deploy to production |

After changing form heuristics locally, run the smoke tier before opening a PR:

```bash
npm run form-corpus:fill-verify:smoke
# or
FORM_CORPUS_PLAYWRIGHT=1 php artisan test --compact --filter=test_platform_smoke_playwright_passes
```

See [`scripts/form-corpus/README.md`](scripts/form-corpus/README.md) for the full maintenance workflow, report paths, and the manual heavy tier.

## LinkedIn Auto Apply testing

LinkedIn Auto Apply has its own verification pyramid, separate from the 2,350-scenario ATS form corpus. It runs on every push via PHPUnit wrappers and can be exercised locally without a LinkedIn login for most tiers.

```mermaid
flowchart TB
    subgraph L1["Layer 1 - Unit (JSDOM / Node)"]
        U1["linkedin-auto-apply.mjs<br/>search URLs, job cards, modal state"]
        U2["auto-apply-pause-resume.mjs<br/>blockers + session pause/resume"]
        U3["auto-apply-activity-visibility.mjs<br/>sidebar activity UI rules"]
        U4["linkedin-full-flow-report.mjs<br/>E2E report parsing"]
    end

    subgraph L2["Layer 2 - Offline corpus (JSDOM)"]
        C["linkedin-easy-apply-corpus.mjs<br/>212+ live captures + 50 synthetic edge cases"]
    end

    subgraph L3["Layer 3 - Browser offline"]
        O["linkedin-auto-apply-offline-step.mjs<br/>Playwright + fixture HTML"]
    end

    subgraph L4["Layer 4 - Live E2E (manual)"]
        E["linkedin-auto-apply-full-flow.mjs<br/>real LinkedIn session + MV3 extension"]
    end

    L1 --> L2 --> L3 --> L4
```

| Tier | Script / test | What it validates | CI |
|------|---------------|-------------------|-----|
| **Unit** | `scripts/extension-test/linkedin-auto-apply.mjs` | Search URL building, job card parsing, Easy Apply button state, modal detection, step fingerprints, cookie/save-dialog dismiss | `LinkedInAutoApplyTest` |
| **Unit** | `auto-apply-pause-resume.mjs`, `auto-apply-activity-visibility.mjs` | Validation blockers, pause/resume session state, sidebar activity panel visibility | Default PHPUnit |
| **Offline corpus** | `linkedin-easy-apply-corpus.mjs` | Each fixture: modal open/closed, primary actions (Next/Review/Submit), validation errors, submitted confirmation, multi-step flow progression | `LinkedInEasyApplyCorpusTest` |
| **Browser offline** | `linkedin-auto-apply-offline-step.mjs` | Real Chrome + unpacked extension clicking through a fixture modal step | `LinkedInFullFlowReportTest` (requires `EXTENSION_E2E=1`) |
| **Live E2E** | `linkedin-auto-apply-full-flow.mjs` | Full orchestrator: search, open jobs, Draft All per step, advance, submit; writes `tests/output/linkedin-auto-apply-full-flow/report.json` | Manual (`LINKEDIN_LIVE_E2E=1`) |

### Fixtures

| Location | Contents |
|----------|----------|
| `tests/fixtures/auto-apply/linkedin/captured/` | **212+ live-captured** LinkedIn HTML files (authoritative regression source) |
| `tests/fixtures/auto-apply/linkedin/captured-manifest.json` | Metadata per capture: step, `capture_reason`, validation errors, stuck diagnostics |
| `tests/fixtures/auto-apply/linkedin/` | **50 synthetic** progression flows plus `error-*` and `edge-*` fixtures (fallback when captures are unavailable) |
| `tests/fixtures/auto-apply/linkedin-search-results*.html` | Search results and job detail page fixtures for card parsing |

See [`tests/fixtures/auto-apply/linkedin/README.md`](tests/fixtures/auto-apply/linkedin/README.md) for capture flags, stuck-step suffixes, and fixture layout.

### Commands

Run the fast tiers before changing `linkedin-auto-apply.js`, `linkedin-easy-apply-fields.js`, or the auto-apply orchestrator:

```bash
# Unit tests (search, cards, modal state)
node scripts/extension-test/linkedin-auto-apply.mjs

# Pause/resume blockers and sidebar activity UI
npm run test:auto-apply-pause-resume
npm run test:auto-apply-activity-visibility

# Offline corpus (CI default - prefers live captures)
npm run test:linkedin-easy-apply-corpus:run -- --captured-only

# Full corpus including synthetic fallback
npm run test:linkedin-easy-apply-corpus

# PHPUnit wrappers (runs Node scripts above)
php artisan test --compact tests/Unit/Extension/LinkedInAutoApplyTest.php
php artisan test --compact tests/Unit/Extension/LinkedInEasyApplyCorpusTest.php
```

Browser offline step (build extension first):

```bash
npm run build:extension
npm run test:linkedin-full-flow:offline-step
# or via PHPUnit:
EXTENSION_E2E=1 php artisan test --compact --filter=test_linkedin_auto_apply_offline_step
```

Live full-flow E2E (requires LinkedIn test account in `.env`):

```bash
npm run build:extension
LINKEDIN_LIVE_E2E=1 npm run test:linkedin-full-flow -- --max-jobs=3 --roles="software engineer"
# or via PHPUnit:
LINKEDIN_LIVE_E2E=1 php artisan test --compact tests/Feature/Extension/LinkedInAutoApplyFullFlowTest.php
```

### Adding live captures

Use a headed Playwright session to grow the offline corpus from real LinkedIn Easy Apply modals:

```bash
# Credentials in .env only (never commit):
# LINKEDIN_TEST_EMAIL=...
# LINKEDIN_TEST_PASSWORD=...

npm run extension-e2e:capture-linkedin-corpus -- --target-fixtures=50 --max-jobs=20 --roles="software engineer,frontend developer"
```

The capture script logs in, rotates search roles, opens Easy Apply jobs, saves step states (open, filled, validation errors, multi-step review, stuck flows), redacts PII before write, and updates `captured-manifest.json`.

After capture or sanitizer rule changes, re-process fixtures before committing:

```bash
node scripts/extension-e2e/resanitize-linkedin-captured.mjs
node scripts/extension-e2e/rebuild-captured-manifest.mjs
npm run test:linkedin-easy-apply-corpus:run -- --captured-only
```

### PII redaction and secret checks

Captured HTML is sanitized on save and can be re-sanitized in bulk:

- Strips `<script>` tags
- Replaces emails with `candidate@example.com`, phone with `+44 7700 900123`, names with `Alex Candidate`
- Scrubs `.env` credentials (`LINKEDIN_TEST_EMAIL`, `LINKEDIN_TEST_PASSWORD`) and known API key patterns via `redactSecrets`

Before committing new fixtures:

```bash
npm run secrets:check-fixtures
```

Do not paste unredacted live LinkedIn HTML into `tests/fixtures/auto-apply/linkedin/captured/`.

## Key commands

| Command | Purpose |
|---------|---------|
| `composer run dev` | Laravel + queue + Pail + Vite |
| `composer test` | Pint check + full PHPUnit suite |
| `npm run build:extension` | Build MV3 extension to `extension/dist/` |
| `npm run form-corpus:fill-verify:curated` | Curated JSDOM tier (CI default) |
| `npm run form-corpus:fill-verify:smoke` | Per-platform Playwright smoke |
| `npm run form-corpus:extension-e2e` | Extension E2E CI subset (~10 scenarios) |
| `npm run form-corpus:visual-regression` | Screenshot baseline compare |
| `npm run form-corpus:build-curated` | Regenerate curated + smoke manifests |
| `npm run test:linkedin-easy-apply-corpus:run -- --captured-only` | LinkedIn offline corpus (212+ live captures) |
| `npm run test:linkedin-full-flow` | LinkedIn live E2E (requires `LINKEDIN_LIVE_E2E=1` + credentials) |
| `npm run extension-e2e:capture-linkedin-corpus` | Capture live LinkedIn Easy Apply HTML for offline tests |
| `npm run lint:check` | ESLint |
| `composer lint:check` | Laravel Pint |

### PHPUnit tiers

```bash
# Default CI (excludes playwright + extension-e2e groups)
php artisan test --compact --exclude-group=extension-e2e,playwright

# Playwright smoke (fast CI tier)
FORM_CORPUS_PLAYWRIGHT=1 php artisan test --compact --group=playwright --exclude-group=extension-e2e

# Extension E2E CI subset
EXTENSION_E2E=1 php artisan test --compact --group=extension-e2e

# Full ~103 scenario extension E2E (manual via tests-heavy.yml, 30-60+ min)
EXTENSION_E2E=1 EXTENSION_E2E_FULL=1 php artisan test --compact --group=extension-e2e
```

## API

The extension authenticates with Laravel Sanctum bearer tokens.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/profile` | Fetch user profile + subscription usage |
| `POST` | `/extension/connection` | Generate extension connection JSON (dashboard session) |
| `POST` | `/api/applications/assist/inventory` | Field inventory for current page |
| `POST` | `/api/applications/assist/job-context` | Extract job title, company, description |
| `POST` | `/api/applications/assist/draft-all` | Stream batch field answers (NDJSON) |
| `POST` | `/api/applications/assist/draft-field` | Single field draft |
| `POST` | `/api/applications/assist/cover-letter` | Generate cover letter |
| `POST` | `/api/applications/assist/tailored-resume` | Tailored resume draft |
| `DELETE` | `/api/tokens/{token}` | Revoke a token |

## Deployment

Production runs in Docker (`DockerfileProd`) with Nginx, PHP-FPM, and a queue worker. Pushes to `main` build a GHCR image and deploy via GitHub Actions.

CV extraction and Draft All use `deepseek/deepseek-v4-flash:throughput` by default (`config/cv.php`). To override the model in production, set `NANOGPT_CV_MODEL` in the server `.env` at `/opt/autocvapply/.env`; remove that key to use the config default after deploy.

Live site: **[autocvapply.com](https://autocvapply.com)**

## Contributing

Issues and pull requests welcome on [GitHub](https://github.com/tmwclaxton/autoapplycv).

1. Fork the repo
2. Create a feature branch
3. Write tests for your changes
4. If you touched `form-heuristics.js` or `field-inventory.js`, run `npm run form-corpus:fill-verify:smoke`
5. Run `composer test` and `npm run lint:check`
6. Open a PR

## License

[PolyForm Noncommercial License 1.0.0](LICENSE). Free for personal and non-commercial use - fork it, study it, run it locally. Commercial use (selling, SaaS, paid services built on this code, etc.) requires permission; contact us via [autocvapply.com/contact](https://autocvapply.com/contact).

---

<p align="center">
  <strong><a href="https://autocvapply.com">Get started free at autocvapply.com</a></strong><br />
  <sub>Built for people who'd rather apply to jobs than retype their CV.<br />
  Verified against 2,350 form scenarios. Battle-tested on real ATS platforms.</sub>
</p>
