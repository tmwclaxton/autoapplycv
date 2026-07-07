# LinkedIn Easy Apply offline corpus

HTML fixtures for testing modal detection, step progression, validation errors, and submit confirmation in `extension/src/content/linkedin-auto-apply.js` without live LinkedIn sessions during CI.

For cross-platform lessons (what worked for LinkedIn, what broke on Oracle HCM, checklists for the next platform), see [`docs/platform-automation-playbook.md`](../../../docs/platform-automation-playbook.md).

## Authoritative source: live captures

Real LinkedIn Easy Apply modal HTML lives in `captured/` and is listed in `captured-manifest.json`. This is the **authoritative** corpus for regression tests once captured.

Synthetic fixtures at the repo root (`linkedin-easy-apply-*.html`, `error-*.html`, `edge-*.html`) are generated offline and kept as an optional fallback when live captures are unavailable locally.

## Live capture process

Capture uses a **single headed Playwright session** with a persistent profile (login reuse). Credentials come from `.env` only:

```env
LINKEDIN_TEST_EMAIL=
LINKEDIN_TEST_PASSWORD=
```

Never commit `.env` or captured HTML before PII redaction.

### Run capture

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
npm run extension-e2e:capture-linkedin-corpus -- --target-fixtures=100 --max-jobs=40 --include-stuck --roles="software engineer,frontend developer,backend engineer,full stack developer,devops engineer,python developer"
```

Or with the script directly:

```bash
node scripts/extension-e2e/capture-linkedin-easy-apply-corpus.mjs --target-fixtures=50 --max-jobs=20
```

Flags:

| Flag | Default | Purpose |
|------|---------|---------|
| `--target-fixtures=N` | 50 | Stop after N HTML files saved this run |
| `--max-jobs=N` | 20 | Max distinct jobs to open |
| `--roles="a,b,c"` | 12 default tech roles | Rotate LinkedIn search keywords until target met |
| `--role="software engineer"` | (use `--roles` instead) | Single search keyword |
| `--submit-limit=N` | 3 | Max real submissions per run |
| `--include-stuck` | on (use `--no-stuck` to disable) | Capture HTML when flow stalls instead of skipping |
| `--no-advance-steps` | off | Stop after step 1 (open/filled only) |
| `--delay-min=4000` | 4000 | Min ms between captures |
| `--delay-max=7000` | 7000 | Max ms between captures |
| `--clear-profile` | off | Delete persistent browser profile |
| `--headless` | off | Headless mode (not recommended for 2FA) |

The script:

1. Logs in (waits up to 180s on checkpoint/2FA in headed mode)
2. Rotates through `--roles` search keywords (Easy Apply filter), up to 5 result pages per role
3. For each job: opens modal, captures step states, triggers validation errors, prefills contact info (`LINKEDIN_PREFILL_CONTACT` profile), fills test data, advances steps
4. When stuck, saves failure-state HTML plus a `.diagnose.json` sidecar before moving to the next job (never skips silently)
5. Redacts email, phone, name, and third-party API keys before write
6. Writes `captured-manifest.json` with `source: "live-capture"` metadata including `role_search`, `capture_reason`, `stuck_reason`, and `step_fingerprint`

### Stuck-step capture

When `--include-stuck` is enabled (default), the capture script saves HTML when progression fails:

| Condition | Filename suffix | `capture_reason` | `stuck_reason` |
|-----------|-----------------|------------------|----------------|
| Validation errors after fill | `-step{N}-stuck-validation` | `stuck-validation` | `validation` |
| Same step fingerprint 2+ times | `-step{N}-stuck-same-step` | `stuck-same-step` | `same-step` |
| Next/Review click blocked | `-step{N}-stuck-next-blocked` | `stuck-next-blocked` | `next-blocked` |
| Progress meter unchanged after advance | `-step{N}-stuck-no-progress` | `stuck-no-progress` | `no-progress` |
| Save-application dialog mid-flow | `-step{N}-stuck-save-dialog` | `stuck-save-dialog` | `save-dialog` |

Each stuck capture includes modal HTML plus diagnostic JSON (`{slug}-step{N}-stuck-{reason}.diagnose.json`) and manifest metadata (`stuck_diagnostics`: step fingerprint, validation errors, primary action state). Contact fields are prefilled via `linkedin-easy-apply-fields.js` before fill attempts, matching production `LINKEDIN_PREFILL_CONTACT` behavior.

Successful step transitions are also captured with `capture_reason` values: `open`, `filled`, `validation-errors`, `step2`, `step3`, `review`, `submitted`.

Output:

```
tests/fixtures/auto-apply/linkedin/
  captured/
    {job-slug}-step1-open.html
    {job-slug}-step1-validation-errors.html
    {job-slug}-step1-filled.html
    {job-slug}-step2.html
    {job-slug}-step3.html
    {job-slug}-step{N}-review.html
    {job-slug}-step{N}-stuck-validation.html
    {job-slug}-step{N}-stuck-same-step.html
    {job-slug}-submitted.html
  captured-manifest.json   # includes role_search, capture_reason, stuck_reason, step_fingerprint
```

Profile and run report (gitignored):

```
tests/output/linkedin-corpus-capture/profile/
tests/output/linkedin-corpus-capture/report.json
```

## Synthetic fixtures (fallback)

Generated from extension selectors - not scraped from LinkedIn:

```bash
node scripts/extension-test/build-linkedin-easy-apply-corpus.mjs
```

Regenerate synthetic files when extension selectors change. They do **not** replace live captures for production regression coverage.

## Layout

```
tests/fixtures/auto-apply/linkedin/
  captured/                         # live LinkedIn HTML (authoritative)
  captured-manifest.json            # live capture metadata
  manifest.json                     # synthetic scenario manifest
  linkedin-easy-apply-*.html        # synthetic progression series
  error-*.html                      # synthetic validation states
  edge-*.html                       # synthetic edge cases
```

## Run offline tests

```bash
npm run test:linkedin-easy-apply-corpus
```

Captured-only (no synthetic fallback):

```bash
node scripts/extension-test/linkedin-easy-apply-corpus.mjs --captured-only
```

Include synthetic alongside captures:

```bash
node scripts/extension-test/linkedin-easy-apply-corpus.mjs --include-synthetic
```

Or via PHPUnit:

```bash
php artisan test --compact tests/Unit/Extension/LinkedInEasyApplyCorpusTest.php
```

The Node harness loads each fixture in JSDOM, evaluates `linkedin-auto-apply.js`, and asserts modal state, primary actions, validation errors, and unique step fingerprints per flow.

After capture, re-sanitize and rebuild the manifest from all files in `captured/`:

```bash
node scripts/extension-e2e/resanitize-linkedin-captured.mjs
node scripts/extension-e2e/rebuild-captured-manifest.mjs
npm run test:linkedin-easy-apply-corpus:run -- --captured-only
```

## Secret checks

```bash
npm run secrets:check-fixtures
```

Scans `captured/` and form-extraction HTML for known API key patterns.

## Credentials and PII

- Capture reads credentials from `.env` only
- Saved HTML replaces email, phone, and names with placeholders (`candidate@example.com`, etc.)
- Script tags are stripped before save
- Do not paste unredacted live LinkedIn HTML into this folder
