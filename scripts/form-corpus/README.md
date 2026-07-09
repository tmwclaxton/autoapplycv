# Form corpus fill verification

Multiple layers verify that extension autofill actually lands on the form frontend.

For cross-platform lessons (LinkedIn Auto Apply patterns, Oracle apply-flow session, new-platform checklists), see [`docs/platform-automation-playbook.md`](../../docs/platform-automation-playbook.md).

The playbook's **five-phase workflow** (MCP autofill → 300-500 synthetic corpus → live marathon → fix loop → commit) is the standard path for shipping job-board Auto Apply.

## Test pyramid

| Tier | Engine | Scope | CI job |
| --- | --- | --- | --- |
| **Unit** | JSDOM / Node | Propagation, mock answers, debug-log replay | `php-tests` |
| **Curated JSDOM** | JSDOM | 70 scenarios, 4-layer checks | `extension-fill` |
| **Platform smoke** | Playwright | 1 scenario per ATS/platform + Ashby widget checks | `extension-fill` (`FORM_CORPUS_PLAYWRIGHT=1`) |
| **Curated Playwright** | Playwright | Priority scraped ATS fixtures | manual (`tests-heavy.yml`) |
| **Extension E2E** | Playwright + extension | Full Draft All with mocked API | `extension-fill` optional (`EXTENSION_E2E=1`) |
| **Visual regression** | Playwright screenshots | Baseline compare on smoke subset | `extension-fill` (`FORM_CORPUS_PLAYWRIGHT=1`) |

## Layers

| Layer | Script flag | What it checks |
| --- | --- | --- |
| DOM readback | (default) | Re-reads filled values from DOM after `applyAnswerByRefAllFrames` |
| HTML5 validity | `--check-validity` | `element.checkValidity()` / `validity` on native controls + `form.checkValidity()` |
| Accessibility state | `--check-a11y` | `aria-checked`, `aria-selected`, `aria-pressed`, combobox/listbox collapsed state |
| Error banners | `--check-errors` | Ashby/Greenhouse-style validation messages, `[role="alert"]`, `[aria-invalid="true"]` |
| OCR | `run-fill-screenshot-test.mjs` | Playwright + Tesseract on Ashby Notion fixture |
| Pixel diff | `run-fill-screenshot-diff.mjs` | Before/after screenshot % change in form region |
| Debug log replay | `analyze-debug-log.mjs` | Golden summary comparison for extension debug phases |
| Extension E2E | `run-extension-fill-e2e.mjs` | Unpacked extension + mocked assist API + Draft All completion |

## Quick commands

```bash
# Curated JSDOM (CI default tier)
npm run form-corpus:fill-verify:curated

# Per-platform Playwright smoke (13 scenarios + Ashby yes/no + checkbox)
npm run form-corpus:fill-verify:smoke

# Playwright priority tier
npm run form-corpus:fill-verify:curated:playwright

# Full Playwright scraped tier
npm run form-corpus:fill-verify:curated:playwright:all

# Visual regression (compare against committed baselines)
npm run form-corpus:visual-regression

# Update visual baselines after intentional UI changes
UPDATE_BASELINES=1 npm run form-corpus:visual-regression

# Generate extension E2E API mocks (all ~100 manifest scenarios)
npm run form-corpus:generate-e2e-mocks

# Regenerate E2E scenario manifest
npm run form-corpus:build-e2e-scenarios

# Extension E2E CI subset (~10 critical scenarios)
npm run build:extension
npm run form-corpus:extension-e2e

# Full extension E2E batch (~100 scenarios, manual via tests-heavy.yml)
EXTENSION_E2E=1 EXTENSION_E2E_FULL=1 npm run form-corpus:extension-e2e:batch

# Generate mocks + run full batch
npm run form-corpus:extension-e2e:generate-and-run

# Debug log analysis
npm run form-corpus:analyze-debug-log -- --input=path/to/export.json --golden=path/to/summary.json

# Regenerate curated + smoke manifests
npm run form-corpus:build-curated
```

## PHPUnit

```bash
# Default CI (excludes @group playwright and @group extension-e2e)
php artisan test --compact --exclude-group=extension-e2e,playwright

# Playwright smoke + visual regression
FORM_CORPUS_PLAYWRIGHT=1 php artisan test --compact --group=playwright

# Extension E2E CI subset (headed Chromium, builds extension)
EXTENSION_E2E=1 php artisan test --compact --group=extension-e2e

# Full ~100 scenario extension E2E (manual via tests-heavy.yml, 30–60+ min)
EXTENSION_E2E=1 EXTENSION_E2E_FULL=1 php artisan test --compact --group=extension-e2e

# Form E2E + NanoGPT answer scoring (Sail-only, not CI)
npm run form-corpus:build-form-e2e-scoring
NANOGPT_LIVE_TESTS=1 ./vendor/bin/sail artisan form-e2e:score --limit=5
# Full pipeline (extension fill + scoring):
npm run build:extension
NANOGPT_LIVE_TESTS=1 EXTENSION_E2E=1 npm run form-corpus:form-e2e-scoring -- --limit=5
# Skip extension E2E, score only:
NANOGPT_LIVE_TESTS=1 npm run form-corpus:form-e2e-scoring -- --skip-e2e --limit=10

# Individual suites
php artisan test --compact tests/Unit/Extension/FormFillCuratedTest.php
php artisan test --compact tests/Unit/Extension/FormFillDebugLogTest.php
php artisan test --compact tests/Unit/Extension/FormFillVisualRegressionTest.php
php artisan test --compact tests/Unit/Extension/FormFillExtensionE2eTest.php
```

## CI jobs

**`php-tests`** - Laravel unit/feature tests excluding `playwright` and `extension-e2e` groups.

**`extension-fill`** - Playwright install, `build:extension`, curated JSDOM verify, smoke Playwright tests (`FORM_CORPUS_PLAYWRIGHT=1`), optional extension E2E (`EXTENSION_E2E=1`, `continue-on-error`).

## Reports & fixtures

| Path | Description |
| --- | --- |
| `fill-curated-report.json` | JSDOM curated tier |
| `fill-smoke-playwright-report.json` | Per-platform smoke tier |
| `fill-curated-playwright-report.json` | Playwright priority tier |
| `fill-visual-regression-report.json` | Screenshot baseline compare |
| `fill-verify-smoke.json` | Smoke scenario manifest (auto-generated) |
| `tests/fixtures/extension-e2e/e2e-scenarios.json` | ~100 scenario E2E manifest |
| `tests/fixtures/extension-e2e/extension-e2e-report.json` | Latest batch E2E report |
| `tests/fixtures/extension-e2e/form-e2e-scoring-scenarios.json` | 150 fixture + persona scoring manifest (Sail-only) |
| `tests/fixtures/extension-e2e/form-e2e-scoring-report.json` | Latest NanoGPT scoring report |
| `tests/fixtures/extension-e2e/answer-quality-audit-report.json` | Extension E2E dom audit (20 scenarios) |
| `tests/fixtures/extension-e2e/responses/` | Mock job-context, inventory, draft-all NDJSON |
| `tests/fixtures/form-fill-logs/` | Debug log export + golden summaries |
| `tests/fixtures/form-fill-baselines/{id}/after.png` | Visual regression baselines |

## Maintenance workflow

1. **Form heuristics change** - run `npm run form-corpus:fill-verify:smoke` locally; fix regressions before merging.
2. **New ATS platform** - add vetted fixture, run `npm run form-corpus:build-curated`, update `SMOKE_PLATFORM_PICKS` in `lib/curated-manifest.mjs` if needed.
3. **Visual baseline update** - `UPDATE_BASELINES=1 npm run form-corpus:visual-regression`, commit `tests/fixtures/form-fill-baselines/`.
4. **E2E mock refresh** - `npm run form-corpus:generate-e2e-mocks` after expected/manifest changes.
5. **Form E2E scoring manifest** - `npm run form-corpus:build-form-e2e-scoring` after new vetted fixtures land.
6. **Debug log golden** - capture `DEBUG_LOG_EXPORT` from E2E run, update `tests/fixtures/form-fill-logs/*.summary.json`.

## Firecrawl discovery (150+ new forms)

Firecrawl API key: set `FIRECRAWL_API_KEY` in env or `.cursor/mcp.json` under `firecrawl.env`.

```bash
npm run form-corpus:discover
npm run form-corpus:scrape -- --limit=150
npm run form-corpus:propose -- --id-prefix=web-
npm run form-corpus:vet -- --pending-only
npm run form-corpus:build-form-e2e-scoring
```

Scrape tries direct fetch first, then Firecrawl for JS-heavy ATS hosts. Workday listing pages often skip (no form controls). Re-run in batches if rate-limited.

Third-party API keys embedded in live page HTML (Google Maps, GoCardless widgets, etc.) are **redacted before fixtures are saved** via `lib/redact-secrets.mjs`. Re-run `npm run form-corpus:redact-secrets` if secrets slip into committed HTML; CI runs `npm run secrets:check-fixtures` to block regressions.

## Corpus tiers

| Prefix | Count | Purpose | Generation |
| --- | --- | --- | --- |
| `syn-complex-500-*` | 500 | Volume/regression for multi-section ATS-like forms | Parametric generator (`generate-complex-corpus-500.mjs`) - low structural diversity by design |
| `syn-tj-500-*` | 500 | Totaljobs / Genesis Quick Apply flows | `generate-totaljobs-corpus-500.mjs` |
| `syn-gd-300-*` | 300 | Glassdoor Easy Apply host pages + Indeed Apply iframe steps | `generate-glassdoor-corpus-300.mjs` |
| `syn-reed-300-*` | 300 | Reed Easy Apply search, job detail, and apply steps | `generate-reed-corpus-300.mjs` |
| `syn-weird-*` | 60 | Intentional edge cases for DOM/label/control weirdness | Hand-crafted templates (`lib/weird-form-templates.mjs`) - each structurally distinct |
| `syn-fw-*`, `syn-ix-*`, `syn-mega-*` | varies | Framework shells, interactive widgets, mega forms | Targeted generators |
| `web-*` | varies | Real scraped ATS pages | Firecrawl scrape pipeline |

**When to use which tier:**

- **`syn-complex-500-*`** - bulk regression after heuristic changes; catches regressions across field type combinations at scale. Not useful for discovering new DOM patterns.
- **`syn-weird-*`** - high-value edge cases that real parametric generators miss. Run `npm run form-corpus:fill-verify:weird` after changing form detection, label parsing, or fill logic. Curated subset (12 picks) is in fill-verify curated tier; `syn-weird-030` is in Playwright smoke.

```bash
# Generate weird fixtures + expectations + vet
npm run form-corpus:generate-weird
npm run form-corpus:propose -- --id-prefix=syn-weird- --force
npm run form-corpus:vet -- --id-prefix=syn-weird-
npm run form-corpus:validate-weird-corpus
npm run form-corpus:fill-verify:weird
npm run form-corpus:build-weird-scoring
npm run form-corpus:build-curated
```

**Glassdoor (`syn-gd-300-*`):** host-page DOM for job search/listings/detail plus Indeed Apply contact, screening, documents, and review steps.

```bash
npm run form-corpus:generate-glassdoor-300
npm run form-corpus:validate-glassdoor-corpus
node scripts/form-corpus/vet-corpus.mjs --id-prefix=syn-gd-300-
node scripts/form-corpus/run-fill-verify.mjs --id-prefix=syn-gd-300- --check-validity --workers=8
```

**Reed (`syn-reed-300-*`):** search results, job detail, and native Easy Apply form steps (personal, screening, documents, cover letter, review).

```bash
npm run form-corpus:generate-reed-300
npm run form-corpus:validate-reed-corpus
node scripts/form-corpus/vet-corpus.mjs --id-prefix=syn-reed-300-
node scripts/form-corpus/run-fill-verify.mjs --id-prefix=syn-reed-300- --check-validity --workers=8
```

### syn-weird-* fixture reference (60 hand-crafted edge cases)

| Fixture | Category | Weird behavior tested |
| --- | --- | --- |
| syn-weird-001 | weird-dom | Label without for wraps input three div levels deep |
| syn-weird-002 | weird-label | Email field identified only via aria-labelledby pointing at hidden span |
| syn-weird-003 | weird-label | No visible labels; fields use aria-label exclusively |
| syn-weird-004 | weird-dom | Two distinct fields share the same name attribute (invalid but seen in the wild) |
| syn-weird-005 | weird-dom | Two inputs share id="email" - tests disambiguation by name or DOM order |
| syn-weird-006 | weird-interaction | Cover letter and visa fields hidden inside closed details element |
| syn-weird-007 | weird-interaction | Application fields live inside a native dialog element |
| syn-weird-008 | weird-dom | Newsletter signup form vs job application form - tests primary form detection |
| syn-weird-009 | weird-dom | Fieldset inside fieldset inside fieldset with legends at each level |
| syn-weird-010 | weird-dom | Text input has display:none but label is visible |
| syn-weird-011 | weird-dom | Input uses visibility:hidden instead of display:none |
| syn-weird-012 | weird-dom | Input positioned at -9999px off-screen (accessibility anti-pattern) |
| syn-weird-013 | weird-control | contenteditable div poses as a text input for full name |
| syn-weird-014 | weird-control | Custom component: div with role=textbox, no native input |
| syn-weird-015 | weird-label | Labels contain flag emoji and unicode; Swedish field marked required |
| syn-weird-016 | weird-label | Single field with 500-character label text |
| syn-weird-017 | weird-label | Label text split across multiple span elements |
| syn-weird-018 | weird-label | Empty label element; field identified only by placeholder attribute |
| syn-weird-019 | weird-label | Teamtailor-style bug: "first namerequired" with no space before required |
| syn-weird-020 | weird-label | Fields prefixed with Q7. Q12. style question numbers |
| syn-weird-021 | weird-control | Standard native select for work arrangement alongside text fields |
| syn-weird-022 | weird-control | Location picked from custom div dropdown, not native select |
| syn-weird-023 | weird-control | Native radios hidden; visible pill buttons styled via CSS class |
| syn-weird-024 | weird-control | Checkbox options as bare label>input pairs without fieldset or legend |
| syn-weird-025 | weird-control | Country code select and local number in separate inputs |
| syn-weird-026 | weird-control | Currency prefix span, range slider, and number input for salary |
| syn-weird-027 | weird-control | Start date as three separate day/month/year select elements |
| syn-weird-028 | weird-control | Hidden file input inside drag-and-drop zone with custom button |
| syn-weird-029 | weird-interaction | Multi-step wizard with only one step visible via CSS class toggling |
| syn-weird-030 | weird-interaction | Selecting Yes on sponsorship reveals follow-up textarea |
| syn-weird-031 | weird-interaction | Referral source Other checkbox reveals free-text input |
| syn-weird-032 | weird-label | Required marker asterisk lives in sibling span, not inside label text |
| syn-weird-033 | weird-dom | Submit button outside form linked via form= attribute |
| syn-weird-034 | weird-platform | Ashby-inspired yes/no as two styled buttons instead of native radio |
| syn-weird-035 | weird-platform | Greenhouse-inspired multi-section form with progress indicator dots |
| syn-weird-036 | weird-platform | Lever-inspired resume upload with visible custom button hiding native input |
| syn-weird-037 | weird-platform | micro1-inspired step-2 labels like Q2.full name with dot separator |
| syn-weird-038 | weird-platform | react-phone-number-input style: separate dial code combobox and national number |
| syn-weird-039 | weird-dom | Form laid out as HTML table with labels in td cells |
| syn-weird-040 | weird-dom | Fields structured as dl/dt/dd definition list pairs |
| syn-weird-041 | weird-dom | Each field wrapped in li inside ul list structure |
| syn-weird-042 | weird-dom | Input nested inside label which contains multiple inline spans |
| syn-weird-043 | weird-label | Fields use aria-describedby for format hints separate from label |
| syn-weird-044 | weird-dom | Grouped radios use div role=group instead of fieldset |
| syn-weird-045 | weird-label | Label contains SVG icon; accessible name via aria-labelledby only |
| syn-weird-046 | weird-control | Name field uses input type=search instead of text |
| syn-weird-047 | weird-control | Location field uses input list= with datalist suggestions |
| syn-weird-048 | weird-control | Years of experience via range input with output element display |
| syn-weird-049 | weird-control | Self-assessment field uses meter element near text inputs |
| syn-weird-050 | weird-dom | Department select uses optgroup for grouping options |
| syn-weird-051 | weird-control | Skills field uses select multiple for multi-value selection |
| syn-weird-052 | weird-control | Email input is readonly with prefilled value from profile import |
| syn-weird-053 | weird-control | Disabled name field looks required but cannot be filled; active duplicate below |
| syn-weird-054 | weird-control | Phone input has title hint for UK format (pattern attribute omitted so mock fill passes) |
| syn-weird-055 | weird-control | Years of experience number input with min/max constraints |
| syn-weird-056 | weird-label | One field has lang=sv with Swedish label among English fields |
| syn-weird-057 | weird-interaction | Fields in inactive tab panel hidden until tab clicked |
| syn-weird-058 | weird-dom | Input element appears before its label in DOM (float-right layout pattern) |
| syn-weird-059 | weird-label | Field identified primarily via title attribute on input with minimal label |
| syn-weird-060 | weird-interaction | Additional questions in collapsible section toggled by aria-expanded button |

## Curated verification tier

The curated tier (`fill-verify-curated.json`) selects **124** scenarios (70 JSDOM · 54 Playwright) for **accuracy and variety** rather than running all 3,000+ fixtures blindly.

### Philosophy

| Engine | Scenarios | Verification depth |
| --- | --- | --- |
| **JSDOM** | syn-fw, syn-ix, syn-mega | Full 4-layer: domReadback + html5Validity + a11yState + errorBanner |
| **Playwright** | Scraped real ATS pages | Apply propagation + error-banner (+ a11y in smoke tier) |

### Thresholds

| Tier | Critical | Overall |
| --- | --- | --- |
| JSDOM | 100% | 100% |
| Playwright (priority) | 100% | 100% |
| Smoke | 100% | 100% |

## Library modules

- `lib/curated-manifest.mjs` - curated + smoke scenario selection
- `lib/fill-verify-playwright.mjs` - Playwright apply/readback/a11y/banner
- `lib/debug-log-analyzer.mjs` - golden summary replay
- `lib/e2e-mock-server.mjs` - HTTP mock for extension E2E
- `lib/fill-validation-runner.mjs` - HTML5 constraint validation
- `lib/fill-a11y-runner.mjs` - accessibility state assertions
- `lib/fill-error-detector.mjs` - post-fill error banner scan
- `lib/fill-screenshot-diff.mjs` - Playwright pixel diff + baselines
- `lib/redact-secrets.mjs` - strip third-party keys from scraped HTML before save
