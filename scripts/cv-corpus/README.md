# CV parsing corpus

Stress-tests CV upload parsing across **20 public and synthetic files** in PDF, DOCX, TXT, PNG, and JPG formats.

## Build the corpus

Downloads public samples (GitHub / CC0 sources), generates synthetic files, and writes `tests/fixtures/cv-corpus/manifest.json` with mechanical expectations (emails found in raw text, minimum experience/education counts, OCR flags).

```bash
npm run cv-corpus:fetch
```

Requires `pdftoppm` and `tesseract` for scanned image fixtures.

## Run the stress test

```bash
# Full pipeline: text extract + NanoGPT parse (needs NANOGPT_API_KEY)
npm run cv-corpus:stress-test

# Extract-only checks (no API calls)
npm run cv-corpus:stress-test:extract

# Single scenario
php artisan cv:stress-test --id=toby-claxton

# JSON report (default: tests/fixtures/cv-corpus/stress-report.json)
php artisan cv:stress-test --report=/tmp/cv-stress.json
```

## PHPUnit (live API)

```bash
CV_CORPUS_STRESS=1 php artisan test --compact --group=cv-corpus
```

## Corpus breakdown

| Format | Count | Source |
| --- | --- | --- |
| PDF | 6 | Awesome-CV x2, Jake-style LaTeX, synthetic UK engineer PDF, repo fixture |
| DOCX | 6 | JobHire template, synthetic profiles (healthcare, finance, academic, sales, retail) |
| TXT | 6 | Synthetic UK/US profiles (engineer, designer, marketing, etc.) |
| PNG/JPG | 3 | Scanned pages from PDF fixtures (OCR path) |

Expectations are derived from mechanical text extraction, not hand-labelled gold JSON. Failures highlight real gaps (missing email, low experience count, weak OCR) rather than exact field matching.

## Files

- `scripts/cv-corpus/sources.json` - download URLs and generated file list
- `scripts/cv-corpus/fetch-corpus.mjs` - fetch + generate + annotate
- `tests/fixtures/cv-corpus/manifest.json` - scenario expectations
- `tests/fixtures/cv-corpus/stress-report.json` - latest run output (gitignored)
