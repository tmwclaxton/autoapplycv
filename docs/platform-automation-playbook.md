# Platform automation playbook

Reference for getting job platforms working in AutoCVApply. Drawn from how **LinkedIn Easy Apply** was built (full end-to-end Auto Apply) and the **Oracle HCM apply-flow** session (Jul 2026), where autofill was missing most questions until we captured real HTML and added platform-specific detection.

Use this when a platform is partially working, a new ATS shows up in support, or you are scoping the next Auto Apply target.

---

## Two automation tracks

AutoCVApply has two related but separate problems:

| Track | What it does today | Primary code | Primary corpus |
| --- | --- | --- | --- |
| **Autofill / Draft All** | Detect fields on an open application form and fill from profile. User reviews and submits. | `extension/src/content/form-heuristics.js`, `field-inventory.js` | `tests/fixtures/form-extraction/` |
| **Full Auto Apply** | Search jobs, open apply UI, fill each step, advance, submit end-to-end from the sidebar. | `extension/src/content/linkedin-auto-apply.js`, `extension/src/shared/auto-apply-orchestrator.js` | `tests/fixtures/auto-apply/linkedin/` |

LinkedIn is the only platform with both tracks shipped. Every other platform in the Auto Apply dropdown is **coming soon** until it has orchestrator logic, search URLs, and an offline capture corpus comparable to LinkedIn.

Do not assume autofill working on Greenhouse or Oracle means Auto Apply is close. Autofill is necessary groundwork; Auto Apply needs navigation, step progression, and submit confirmation on top.

---

## LinkedIn Easy Apply: what worked

These patterns are why LinkedIn Auto Apply is reliable in CI without a live session for most tiers.

### 1. Live HTML captures are authoritative

Synthetic fixtures exist as a fallback, but **212+ live captures** in `tests/fixtures/auto-apply/linkedin/captured/` are the regression source. Synthetic HTML is regenerated from selectors; it does not replace real modal shapes.

See [`tests/fixtures/auto-apply/linkedin/README.md`](../tests/fixtures/auto-apply/linkedin/README.md).

### 2. Capture failures, never skip silently

The capture script saves HTML when the flow stalls (`--include-stuck` is on by default):

- validation errors after fill
- same step fingerprint twice
- Next/Review blocked
- progress meter unchanged
- save-application dialog mid-flow

Each stuck capture gets a `.diagnose.json` sidecar with step fingerprint, validation errors, and primary action state. That makes "what broke on this job" debuggable months later.

### 3. Step fingerprints detect non-progression

LinkedIn modals reuse similar DOM across steps. Fingerprints distinguish "still on step 2" from "advanced to review" so the orchestrator does not click Next in a loop.

### 4. Verification pyramid before merge

```
Unit (JSDOM) → offline corpus → browser offline (Playwright + extension) → live E2E (manual)
```

Fast tiers run on every push. Live E2E uses `.env` credentials only and is manual.

See [LinkedIn Auto Apply testing](../README.md#linkedin-auto-apply-testing) in the root README.

### 5. Selector fallbacks, not single selectors

`linkedin-auto-apply.js` uses ordered selector lists for modals, job cards, and apply buttons. LinkedIn changes class names often; one brittle selector would break the whole flow.

### 6. Dedicated platform module

LinkedIn logic lives in `linkedin-auto-apply.js`, not scattered through generic form heuristics. Modal open/close, primary actions (Next/Review/Submit), and application-sent confirmation are LinkedIn-specific concerns.

### 7. PII and secrets handled at capture time

Credentials from `.env` only. HTML is redacted before write. `npm run secrets:check-fixtures` blocks API keys in committed fixtures.

### 8. Contact prefill before fill attempts

`LINKEDIN_PREFILL_CONTACT` / `linkedin-easy-apply-fields.js` prefills contact fields before Draft All runs, matching production behavior and reducing false "stuck-validation" captures.

---

## Oracle HCM apply-flow session (Jul 2026): applying the same mindset

### Starting problem

User pasted real Oracle Candidate Experience apply-flow HTML because **AutoFill detected almost none of the questions**. Contact fields might fill; application questions (hidden radios, pill buttons, comboboxes) were skipped.

### What worked

#### Start from real apply-form HTML, not a nearby page

The corpus already had Oracle **listing** fixtures (`web-*-oraclecloud-com-jobs.html`, `syn-corpus2-oracle-*`). Those are not the Candidate Experience **apply-flow** DOM. The ITV fixture (`web-oraclecloud-apply-flow-itv`) was built from pasted apply-flow markup with the widgets that actually break detection.

**Lesson:** A platform name in the corpus is not enough. You need the right **page type** (apply flow vs job listing vs login wall).

#### Name the widget patterns before writing code

Oracle apply-flow broke on three patterns generic heuristics do not handle:

| Pattern | DOM signal | Fix |
| --- | --- | --- |
| Visually hidden radios | `.input-row__hidden-control`, `.apply-flow-input-radio-control`, `.input-row--radiogroup` | `isOracleApplyFlowStyledChoiceInput()` (mirrors Ashby styled choice detection) |
| Pill button groups | `cx-select-pills` with `button.cx-select-pill` | `collectOracleSelectPillFields()` / `setOracleSelectPillValue()` |
| Comboboxes | `cx-select` inputs | Existing combobox fill path, plus Oracle label resolution |
| Label resolution | `.input-row__label`, `aria-labelledby` + `.input-row__linebreak` | `getOracleApplyFlowQuestionLabel()` |

#### Extend question container scope

`getQuestionContainer()` needed `.input-row` and `.apply-flow-block` so inventory and fill logic associate controls with the right question text.

#### Run the full form-corpus pipeline

```bash
export PATH="/opt/homebrew/bin:$PATH"

# 1. Add HTML under tests/fixtures/form-extraction/html/
# 2. Register in manifest (status: pending → vetted)
node scripts/form-corpus/propose-expectations.mjs --id=web-oraclecloud-apply-flow-itv
node scripts/form-corpus/vet-corpus.mjs --id=web-oraclecloud-apply-flow-itv
node scripts/form-corpus/build-curated-manifest.mjs

# 3. Verify fill
node scripts/form-corpus/run-fill-verify-curated.mjs --id=web-oraclecloud-apply-flow-itv
FORM_CORPUS_PLAYWRIGHT=1 node scripts/form-corpus/run-fill-verify-playwright.mjs --id=web-oraclecloud-apply-flow-itv

# 4. Rebuild extension
npm run build:extension
```

Fixture landed in curated tier, Playwright smoke (`SMOKE_PLATFORM_PICKS`), `CRITICAL_IDS`, and `PLAYWRIGHT_IDS` in `scripts/form-corpus/lib/curated-manifest.mjs`.

Result: **9 fields** detected and filled in Playwright verify (title pills, salary alignment, office attendance, referral source, disability, e-signature, etc.).

#### Platform-specific mock answers for corpus fill

Corpus fill uses deterministic mocks, not the user profile. Added a mock for referral questions:

```javascript
// scripts/form-corpus/lib/mock-answers.mjs
if (/where did you hear|how did you hear|referral source/i.test(question)) {
    return 'LinkedIn';
}
```

Without this, combobox/pill fields with long option lists can fail fill-verify even when detection is correct.

#### Clear validation state after successful fills

Oracle marks invalid fields with `aria-invalid`, `.cx-select-input--invalid`, `.input-row--invalid`. Added `clearValidationState()` so a successful fill does not leave stale error chrome that trips error-banner checks.

#### Trim fixture to visible sections only

Hidden `apply-flow-section` blocks (display:none) in the pasted HTML caused error-banner detection noise. Removed sections that are not visible in the one-page flow under test.

#### Keep platform lists in sync

`SUPPORTED_PLATFORMS` in `resources/js/lib/site.ts` and `AUTO_APPLY_PLATFORM_LIST` in `extension/src/shared/auto-apply-platforms.js` must match. `AUTO_APPLY_COMING_SOON_PLATFORMS` is derived from `SUPPORTED_PLATFORMS` excluding LinkedIn.

When adding a vetted corpus platform, add it to both lists (and the marketing badges update automatically).

---

## What did not work (pitfalls from this session)

| Pitfall | What happened | What to do instead |
| --- | --- | --- |
| **Wrong page type in corpus** | Existing Oracle fixtures were job listings, not apply-flow | Capture or paste the actual apply modal/page |
| **Assuming native inputs** | Radios exist in DOM but are visually hidden; pills are `<button>` not `<input type="radio">` | Add platform-specific styled-choice detection (copy the Ashby pattern) |
| **Tooling PATH** | `node` and `php` not on default PATH in some shells | `export PATH="/opt/homebrew/bin:$PATH"` before corpus and pint commands |
| **Platform list drift** | Auto Apply dropdown showed 4 platforms while the site listed 8; later still missed Oracle, BambooHR, iCIMS, etc. | Treat `SUPPORTED_PLATFORMS` as canonical; sync extension list after every new platform |
| **Hidden sections in fixtures** | Error-banner tier failed on fields inside `display:none` sections | Fixture should reflect what a user sees on the step under test |
| **Skipping corpus verify** | Heuristics changes without fill-verify can regress other ATS | Always run smoke tier after `form-heuristics.js` / `field-inventory.js` changes |
| **Push without network** | Local commit succeeded; `git push` failed on DNS | Retry push when online; commit is not shipped until push completes |

---

## Checklist: new ATS autofill platform

Use when autofill is weak or missing on a site (Oracle-style problem).

- [ ] Obtain real **apply-form** HTML (paste, scrape, or Firecrawl). Redact PII and secrets.
- [ ] Add `tests/fixtures/form-extraction/html/web-{platform}-{slug}.html`
- [ ] Register in `tests/fixtures/form-extraction/manifest.json`
- [ ] Run `propose-expectations.mjs` and `vet-corpus.mjs`; fix vet issues
- [ ] List every non-native widget (hidden radios, pill buttons, shadow DOM, comboboxes, iframes)
- [ ] Add detectors in `form-heuristics.js` (and `field-inventory.js` if scope changes)
- [ ] Add platform-specific mock answers in `mock-answers.mjs` if needed
- [ ] Run `build-curated-manifest.mjs`; add to `SMOKE_PLATFORM_PICKS` if platform-smoke representative
- [ ] Pass `run-fill-verify-curated.mjs` and Playwright smoke for the fixture id
- [ ] `npm run build:extension` and smoke-test in a real browser tab
- [ ] Update `SUPPORTED_PLATFORMS` and `AUTO_APPLY_PLATFORM_LIST`
- [ ] Run `npm run form-corpus:fill-verify:smoke` before merge

---

## Checklist: new full Auto Apply platform

Use when scoping the next LinkedIn-class integration (Workday, Indeed, etc.).

- [ ] Confirm autofill corpus coverage exists for that platform's apply UI
- [ ] Create `extension/src/content/{platform}-auto-apply.js` (or equivalent) for navigation and step logic
- [ ] Add search URL builder in `extension/src/shared/auto-apply-platforms.js`
- [ ] Wire orchestrator in `extension/src/shared/auto-apply-orchestrator.js`
- [ ] Build live capture script with **stuck-state saves** and diagnose sidecars (copy LinkedIn capture design)
- [ ] Add offline corpus under `tests/fixtures/auto-apply/{platform}/`
- [ ] Add unit tests (`scripts/extension-test/{platform}-auto-apply.mjs`)
- [ ] Add PHPUnit wrapper test class
- [ ] Enable platform in `AUTO_APPLY_PLATFORM_LIST` (`enabled: true`, remove `comingSoon`)
- [ ] Document capture flags and fixture layout in a platform README

---

## Key files

| Area | Files |
| --- | --- |
| Generic field detection | `extension/src/content/form-heuristics.js`, `field-inventory.js` |
| LinkedIn Auto Apply | `extension/src/content/linkedin-auto-apply.js`, `linkedin-easy-apply-fields.js` |
| Auto Apply sidebar | `extension/src/sidepanel/auto-apply.js`, `extension/src/shared/auto-apply-platforms.js`, `auto-apply-orchestrator.js` |
| Platform marketing list | `resources/js/lib/site.ts` (`SUPPORTED_PLATFORMS`) |
| ATS form corpus | `scripts/form-corpus/`, `tests/fixtures/form-extraction/` |
| Corpus platform picks | `scripts/form-corpus/lib/curated-manifest.mjs` (`detectPlatform`, `SMOKE_PLATFORM_PICKS`, `CRITICAL_IDS`) |
| LinkedIn capture | `scripts/extension-e2e/capture-linkedin-easy-apply-corpus.mjs` |
| LinkedIn offline tests | `scripts/extension-test/linkedin-easy-apply-corpus.mjs` |

---

## Commands quick reference

### After form-heuristics changes (any ATS)

```bash
export PATH="/opt/homebrew/bin:$PATH"
npm run form-corpus:fill-verify:smoke
npm run build:extension
```

### Add one form-extraction fixture

```bash
node scripts/form-corpus/propose-expectations.mjs --id=FIXTURE_ID
node scripts/form-corpus/vet-corpus.mjs --id=FIXTURE_ID
node scripts/form-corpus/build-curated-manifest.mjs
node scripts/form-corpus/run-fill-verify-curated.mjs --id=FIXTURE_ID
```

### LinkedIn Auto Apply fast tiers

```bash
node scripts/extension-test/linkedin-auto-apply.mjs
npm run test:linkedin-easy-apply-corpus:run -- --captured-only
php artisan test --compact tests/Unit/Extension/LinkedInEasyApplyCorpusTest.php
```

### Grow LinkedIn capture corpus

```bash
npm run extension-e2e:capture-linkedin-corpus -- --target-fixtures=50 --max-jobs=20 --include-stuck
```

---

## Oracle fixture reference

| Item | Location |
| --- | --- |
| HTML fixture | `tests/fixtures/form-extraction/html/web-oraclecloud-apply-flow-itv.html` |
| Expected fields | `tests/fixtures/form-extraction/expected/web-oraclecloud-apply-flow-itv.json` |
| Platform smoke pick | `web-oraclecloud-apply-flow-itv` in `SMOKE_PLATFORM_PICKS` |

This fixture is the template for future Oracle HCM work: apply-flow markup, not listing pages.

---

## Related docs

- [Form corpus README](../scripts/form-corpus/README.md) - ATS fill-verify tiers and maintenance
- [LinkedIn Easy Apply offline corpus](../tests/fixtures/auto-apply/linkedin/README.md) - capture process and stuck-step suffixes
- [Root README - LinkedIn Auto Apply testing](../README.md#linkedin-auto-apply-testing) - verification pyramid
