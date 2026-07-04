# Form corpus fill verification

Multiple layers verify that extension autofill actually lands on the form frontend.

## Layers

| Layer | Script flag | What it checks |
| --- | --- | --- |
| DOM readback | (default) | Re-reads filled values from DOM after `applyAnswerByRefAllFrames` |
| HTML5 validity | `--check-validity` | `element.checkValidity()` / `validity` on native controls + `form.checkValidity()` |
| Accessibility state | `--check-a11y` | `aria-checked`, `aria-selected`, `aria-pressed`, combobox/listbox collapsed state |
| Error banners | `--check-errors` | Ashby/Greenhouse-style validation messages, `[role="alert"]`, `[aria-invalid="true"]` |
| OCR | `run-fill-screenshot-test.mjs` | Playwright + Tesseract on Ashby Notion fixture |
| Pixel diff | `run-fill-screenshot-diff.mjs` | Before/after screenshot % change in form region (catches “nothing happened”) |

## Quick commands

```bash
# Default DOM readback (syn-fw corpus)
npm run form-corpus:fill-verify

# Full corpus pass with HTML5 + a11y checks
npm run form-corpus:fill-verify:full

# Individual layers
node scripts/form-corpus/run-fill-verify.mjs --id-prefix=syn-fw- --check-validity
node scripts/form-corpus/run-fill-verify.mjs --id-prefix=syn-basic- --check-a11y
node scripts/form-corpus/run-fill-verify.mjs --id=web-ashby-notion-bdm-f603aedb --check-errors

# Unified JSON report (syn-fw + syn-basic + notion + pixel diff)
node scripts/form-corpus/run-fill-comprehensive.mjs

# Screenshot pixel diff (Ashby Notion fixture)
npm run form-corpus:fill-screenshot-diff

# OCR screenshot test
npm run form-corpus:fill-screenshot
```

## PHPUnit

```bash
# Default CI subset
php artisan test --compact tests/Unit/Extension/FormFillPropagationTest.php
php artisan test --compact tests/Unit/Extension/FormFillComprehensiveTest.php
php artisan test --compact tests/Unit/Extension/FormFillValidationBannerTest.php

# Optional extension E2E (requires build + EXTENSION_E2E=1)
EXTENSION_E2E=1 php artisan test --compact --group=extension-e2e
```

## Reports

- `tests/fixtures/form-extraction/fill-verify-report.json` — per-scenario DOM + optional layer results
- `tests/fixtures/form-extraction/fill-comprehensive-report.json` — unified report with `verification.domReadback`, `html5Validity`, `a11yState`, `errorBanner`, `pixelDiff`
- `tests/output/form-fill-screenshots/<fixture>/pixel-diff-report.json` — screenshot diff details

## CI recommendation

**Default CI:** `FormFillPropagationTest`, `FormFillEvalTest`, `FormFillComprehensiveTest` (first 3 methods only if comprehensive is slow), `FormFillValidationBannerTest` (first 2 methods), `FormFillScreenshotTest`.

**Nightly / manual:** `run-fill-comprehensive.mjs`, `EXTENSION_E2E=1`, `FILL_SCREENSHOT_LIVE=1`.

## Library modules

- `lib/fill-validation-runner.mjs` — HTML5 constraint validation
- `lib/fill-a11y-runner.mjs` — accessibility state assertions
- `lib/fill-error-detector.mjs` — post-fill error banner scan
- `lib/fill-screenshot-diff.mjs` — Playwright pixel diff
