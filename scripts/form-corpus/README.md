# Form corpus fill verification

Multiple layers verify that extension autofill actually lands on the form frontend.

## Test pyramid

| Tier | Engine | Scope | CI job |
| --- | --- | --- | --- |
| **Unit** | JSDOM / Node | Propagation, mock answers, debug-log replay | `php-tests` |
| **Curated JSDOM** | JSDOM | ~36 synthetic scenarios, 4-layer checks | `extension-fill` |
| **Platform smoke** | Playwright | 1 scenario per ATS/platform + Ashby widget checks | `extension-fill` (`FORM_CORPUS_PLAYWRIGHT=1`) |
| **Curated Playwright** | Playwright | Priority scraped ATS fixtures | manual / nightly |
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

# Per-platform Playwright smoke (10 scenarios + Ashby yes/no + checkbox)
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

# Full extension E2E batch (~100 scenarios, nightly/manual)
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

# Full ~100 scenario extension E2E (nightly/manual, 30–60+ min)
EXTENSION_E2E=1 EXTENSION_E2E_FULL=1 php artisan test --compact --group=extension-e2e

# Individual suites
php artisan test --compact tests/Unit/Extension/FormFillCuratedTest.php
php artisan test --compact tests/Unit/Extension/FormFillDebugLogTest.php
php artisan test --compact tests/Unit/Extension/FormFillVisualRegressionTest.php
php artisan test --compact tests/Unit/Extension/FormFillExtensionE2eTest.php
```

## CI jobs

**`php-tests`** — Laravel unit/feature tests excluding `playwright` and `extension-e2e` groups.

**`extension-fill`** — Playwright install, `build:extension`, curated JSDOM verify, smoke Playwright tests (`FORM_CORPUS_PLAYWRIGHT=1`), optional extension E2E (`EXTENSION_E2E=1`, `continue-on-error`).

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
| `tests/fixtures/extension-e2e/responses/` | Mock job-context, inventory, draft-all NDJSON |
| `tests/fixtures/form-fill-logs/` | Debug log export + golden summaries |
| `tests/fixtures/form-fill-baselines/{id}/after.png` | Visual regression baselines |

## Maintenance workflow

1. **Form heuristics change** — run `npm run form-corpus:fill-verify:smoke` locally; fix regressions before merging.
2. **New ATS platform** — add vetted fixture, run `npm run form-corpus:build-curated`, update `SMOKE_PLATFORM_PICKS` in `lib/curated-manifest.mjs` if needed.
3. **Visual baseline update** — `UPDATE_BASELINES=1 npm run form-corpus:visual-regression`, commit `tests/fixtures/form-fill-baselines/`.
4. **E2E mock refresh** — `npm run form-corpus:generate-e2e-mocks` after expected/manifest changes.
5. **Debug log golden** — capture `DEBUG_LOG_EXPORT` from E2E run, update `tests/fixtures/form-fill-logs/*.summary.json`.

## Curated verification tier

The curated tier (`fill-verify-curated.json`) selects ~90 scenarios for **accuracy and variety** rather than running all 1800+ fixtures blindly.

### Philosophy

| Engine | Scenarios | Verification depth |
| --- | --- | --- |
| **JSDOM** | syn-fw, syn-ix, syn-mega | Full 4-layer: domReadback + html5Validity + a11yState + errorBanner |
| **Playwright** | Scraped real ATS pages | Apply propagation + error-banner (+ a11y in smoke tier) |

### Thresholds

| Tier | Critical | Overall |
| --- | --- | --- |
| JSDOM | ≥ 90% | ≥ 80% |
| Playwright (priority) | ≥ 50% | ≥ 45% |
| Smoke | ≥ 50% | ≥ 45% |

## Library modules

- `lib/curated-manifest.mjs` — curated + smoke scenario selection
- `lib/fill-verify-playwright.mjs` — Playwright apply/readback/a11y/banner
- `lib/debug-log-analyzer.mjs` — golden summary replay
- `lib/e2e-mock-server.mjs` — HTTP mock for extension E2E
- `lib/fill-validation-runner.mjs` — HTML5 constraint validation
- `lib/fill-a11y-runner.mjs` — accessibility state assertions
- `lib/fill-error-detector.mjs` — post-fill error banner scan
- `lib/fill-screenshot-diff.mjs` — Playwright pixel diff + baselines
