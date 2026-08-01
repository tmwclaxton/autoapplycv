# Extension Draft All benchmarks

Measure Draft All performance without a live Chrome session. These scripts isolate **client-side overhead** (snapshot build, payload compaction, orchestration) from **LLM latency** (mocked).

## Prerequisites

```bash
npm install
```

## Snapshot + payload benchmark

Times JSDOM snapshot extraction on HTML fixtures (same runner as form-corpus tests):

```bash
node scripts/extension-benchmark/draft-all-benchmark.mjs
node scripts/extension-benchmark/draft-all-benchmark.mjs --fixture=web-ashby-notion-bdm-f603aedb --iterations=10
```

Reports snapshot build p50/p95 and payload byte sizes (raw vs compact).

## Mocked end-to-end flow

Simulates Draft All phases with realistic mocked API delays. Compare baseline vs optimized orchestration.

Draft All does not keyword-map profile values into form fields. Question memo applies explicit user-saved answers; all other fields are LLM-drafted with profile context in the prompt. Mechanical inventory (DOM snapshot to field list) is still used when confidence is high.

```bash
# Baseline: API job context, extra inventory round, serial apply
node scripts/extension-benchmark/mock-draft-all-flow.mjs --mode=baseline --iterations=8

# Optimized: inferred job context, single inventory round, pipelined apply
node scripts/extension-benchmark/mock-draft-all-flow.mjs --mode=optimized --iterations=8
```

## Manual extension benchmark (Chrome)

1. Build and load unpacked extension: `npm run build:extension`
2. Open Debug log page from extension options (or sidepanel debug link)
3. Navigate to Ashby Notion application form
4. Trigger **Draft All** from the sidepanel
5. Inspect debug log entries with phase `perf.summary` for a full breakdown

Run 5–10 back-to-back iterations on the same tab (cache warm) and note `job-context`, `inventory.round-1`, `draft.batch-*`, and `draft-all.total`.

## Form fill verification layers

For DOM readback, HTML5 validity, accessibility state, error-banner detection, OCR, and pixel-diff checks on the form corpus, see [form-corpus/README.md](../form-corpus/README.md).

## Draft All DOM E2E

After Draft All, verify fields are actually filled in the DOM (not just API success):

```bash
# Fixture mode (mocked API, Ashby/Greenhouse/Teamtailor)
npm run test:e2e-fill

# Live URLs (requires EXTENSION_API_TOKEN + running API)
npm run test:e2e-fill:live

# Or directly:
node scripts/extension-benchmark/run-draft-all-dom-verify.mjs --fixture
node scripts/extension-benchmark/run-draft-all-dom-verify.mjs --live --token="..." --api-base=http://localhost:8000
```

Reports per-field ref, label, expected vs actual. Fails when apply reported success but DOM is empty.

Live benchmark also prints DOM verification counts:

```bash
node scripts/extension-benchmark/live-draft-all-benchmark.mjs --url="..." --token="..." --api-base=http://localhost:8000
```

## PHP API timing

Inventory and draft-all LLM calls dominate real-world latency. To profile backend:

```bash
php artisan test --compact --filter=ApplicationFieldInventoryTest
php artisan test --compact --filter=ApplicationDraftTest
```

## Profile mapping corpus

Deterministic clarifying-question / profile-mapping tests (190 scenarios, no LLM):

```bash
npm run test:profile-mapping-corpus:build   # optional: write JSON corpus
npm run test:profile-mapping-corpus
```

NanoGPT vetting for ambiguous mappings (Sail/local only, not CI):

```bash
NANOGPT_LIVE_TESTS=1 ./vendor/bin/sail artisan test --compact --filter=ProfileMappingNanoGptTest
# or
NANOGPT_LIVE_TESTS=1 npm run test:profile-mapping-nanogpt
```

Requires `NANOGPT_API_KEY` in `.env`. GitHub Actions excludes the `nanogpt-live` group.

## Answer quality corpus

Deterministic corpus validation (100+ scenarios across multiple personas, no LLM):

```bash
npm run test:answer-quality-corpus:build   # write JSON corpus via PHP
npm run test:answer-quality-corpus
```

NanoGPT answer generation + rubric scoring (Sail/local only, not CI):

```bash
NANOGPT_LIVE_TESTS=1 ./vendor/bin/sail artisan answer-quality:audit
NANOGPT_LIVE_TESTS=1 ./vendor/bin/sail artisan answer-quality:audit --limit=10
NANOGPT_LIVE_TESTS=1 ANSWER_QUALITY_LIMIT=10 npm run test:answer-quality-nanogpt
# or PHPUnit sample (default limit 10 via ANSWER_QUALITY_LIMIT):
NANOGPT_LIVE_TESTS=1 ./vendor/bin/sail artisan test --compact --filter=AnswerQualityNanoGptTest
```

Report: `tests/fixtures/answer-quality/latest-report.json` (pass rate, dimension averages, worst scenarios).

Scoring rubric (1-5 each): grounding, specificity, human_tone, terminology, language, conciseness, honesty. Pass threshold: average >= 4.0, grounding >= 3, plus mechanical must_mention / must_not_mention checks.

## Answer format guardrails corpus (~1000+ curated questions)

**Purpose:** Catch Draft All / NanoGPT answers that are the wrong *shape* or stupid for the field (essay for yes/no, fluff for salary digits, wrong brevity), while still allowing paraphrase for substance.

**Persona:** one rich profile - `senior_laravel_dev` (James Mitchell, Bristol; Laravel / Vue / PostgreSQL; salary 65000; notice 1 month; no sponsorship / no relocate). Defined in `answer-quality-personas.json`.

**Source of truth:** hand-authored / curated static JSON (not template-generated):

- Shards: `scripts/extension-benchmark/answer-format-guardrails/scenarios/`
- Merged scenarios: `scripts/extension-benchmark/answer-format-guardrails-scenarios.json`
- Assembled corpus: `scripts/extension-benchmark/answer-format-guardrails-corpus.json`
- Curation notes: `scripts/extension-benchmark/answer-format-guardrails/REVIEW.md`

Each scenario includes realistic employer wording plus `answer_shape`, `brevity`, optional `options` / `max_words` / `must_match` / `must_mention`. `ideal_answer` and `ideal_answer_notes` are **reference meaning only** - live audits never require exact string match.

**Shapes covered:** `yes_no`, `digit`, `short_number`, `currency`, `percent`, `notice_period`, `date`, `url`, `email`, `phone`, `select_option`, `one_liner`, `short_paragraph`, `long_paragraph`.

### Layered evaluation

1. **Mechanical format** (deterministic, CI-safe): shape, max words/chars, option match, URL/email/phone/digit patterns, brevity traps (`AnswerFormatValidator`).
2. **Semantic judge** (live NanoGPT only): paraphrase-tolerant `meaning` + `honesty` (`AnswerFormatSemanticJudge`). Pass when `meaning >= 3` and `honesty >= 3`.
3. **Combined pass:** format OK **and** semantic OK. Optional `--with-rubric` adds full `AnswerQualityScorer` dimensions.

### How to run

```bash
# Merge curated shards (validate unique ids/labels; does not invent questions)
php scripts/extension-benchmark/merge-answer-format-guardrails-scenarios.php

# Assemble corpus JSON + deterministic tests
npm run test:answer-format-guardrails:build
npm run test:answer-format-guardrails
```

Live NanoGPT generation + format + semantic judge (local/Sail only, not CI).

The audit parallelizes NanoGPT calls via a Process pool (300s per child; Laravel's default Concurrency driver times out at 60s). Default `--concurrency=20` runs up to 20 API calls per wave (generation chunks of 8 scenarios; judge batches of `--batch`, default 6). Progress is checkpointed to `tests/fixtures/answer-format-guardrails/audit-checkpoint.json` (and mirrored into `latest-report.json`) so a killed run can resume without redoing finished scenarios.

```bash
# Smoke (~40 scenarios, 20 concurrent NanoGPT calls)
NANOGPT_LIVE_TESTS=1 php artisan answer-format-guardrails:audit --limit=40 --concurrency=20

# Stratified / filtered samples
NANOGPT_LIVE_TESTS=1 php artisan answer-format-guardrails:audit --per-shape=6
NANOGPT_LIVE_TESTS=1 php artisan answer-format-guardrails:audit --limit=50
NANOGPT_LIVE_TESTS=1 php artisan answer-format-guardrails:audit --shape=yes_no --limit=40
NANOGPT_LIVE_TESTS=1 php artisan answer-format-guardrails:audit --skip-semantic --per-shape=5
NANOGPT_LIVE_TESTS=1 php artisan answer-format-guardrails:audit --with-rubric --per-shape=2

# Full corpus (~1274). Prefer Sail if your host PHP lacks the API key wiring:
NANOGPT_LIVE_TESTS=1 ./vendor/bin/sail artisan answer-format-guardrails:audit --concurrency=20 --fail

# Resume after interrupt (skips scenarios already present with format_passed)
NANOGPT_LIVE_TESTS=1 ./vendor/bin/sail artisan answer-format-guardrails:audit --concurrency=20 --resume --fail

NANOGPT_LIVE_TESTS=1 ANSWER_FORMAT_GUARDRAIL_LIMIT=8 php artisan test --compact --filter=AnswerFormatGuardrailNanoGptTest
```

Report: `tests/fixtures/answer-format-guardrails/latest-report.json` (combined / format / semantic pass rates, by-shape breakdown, sample failures, documented thresholds). Partial runs also write `audit-checkpoint.json`.

Note: form-corpus fill-verify / Playwright tiers are a separate slow path (`npm run form-corpus:fill-verify:*`) and are not parallelized by this command.

## Form fixture E2E + scoring (150 forms)

Real ATS HTML fixtures with 12 profile personas (round-robin). Sail-only live tier:

```bash
npm run form-corpus:build-form-e2e-scoring
NANOGPT_LIVE_TESTS=1 ./vendor/bin/sail artisan form-e2e:score --limit=5
NANOGPT_LIVE_TESTS=1 EXTENSION_E2E=1 npm run form-corpus:form-e2e-scoring -- --limit=5
NANOGPT_LIVE_TESTS=1 ./vendor/bin/sail artisan test --compact --filter=FormE2eScoringNanoGptTest
```

Report: `tests/fixtures/extension-e2e/form-e2e-scoring-report.json`.

Use Laravel Telescope or temporary `Log::debug` timing in `ApplicationFieldInventoryService` / `ApplicationDraftOrchestratorService` if deeper backend profiling is needed.
