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

Use Laravel Telescope or temporary `Log::debug` timing in `ApplicationFieldInventoryService` / `ApplicationDraftOrchestratorService` if deeper backend profiling is needed.
