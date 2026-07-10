# Form corpus growth strategy

Question detection on the open web is a **long-tail coverage problem**. The form corpus is the **product spec** for what the extension must see, label, and fill. Volume and variety of real examples matter more than one clever parser.

This doc defines how to grow that corpus and how test coverage should expand with it.

## Core idea

1. **Sheer volume and variety** - Collect many application forms across ATS families, frameworks, and one-off employer sites. Patterns repeat, but the long tail never ends.
2. **Understand before you freeze** - Use Cursor with the **extension bridge MCP** on live Chrome tabs. Spend time on nasty pages: wizards, conditionals, iframes, pill buttons, comboboxes. Do not only scrape static HTML.
3. **Capture what you learned** - Each fixture should encode understanding, not just a DOM dump.
4. **Ever-growing corpus** - New captures become regression tests. The extension must keep passing as the corpus grows.

**Synthetic fixtures** (`syn-complex-*`, `syn-weird-*`, platform generators) supplement live captures. They do not replace real apply DOM. See LinkedIn: live HTML captures are authoritative (`docs/platform-automation-playbook.md`).

## Roles of extension bridge vs Firecrawl

| Tool | Role |
| --- | --- |
| **Curated dual-oracle** (primary for detection quality) | Supervised capture: land on a real apply form (MCP/manual), compare `get_field_inventory` vs NanoGPT HTML field inventory, promote only on agree. `npm run form-corpus:curated-oracle` (default `--limit=5`). |
| **Extension bridge MCP** | Navigate boards (Ashby: board -> job -> Apply), inspect widgets, investigate disagreements. |
| **Bridge scrape** (volume / legacy) | Unattended URL queue with detector accept gate (`>=2` meaningful fields). Fine for volume of already-detectable forms; **not** the path for improving the detector. |
| **Firecrawl** (legacy, disabled by default) | Optional firehose when credits available. Bulk runner fails fast unless `--force-firecrawl`. |

**Do not** use detector-gated bulk scrape as the primary way to grow fixtures when the goal is better question detection - that is circular (misses never get saved as expected failures).

## Curated dual-oracle session

Prerequisites: `npm run extension-bridge`, extension connected, NanoGPT API key.

1. Open a live board hub (e.g. Ashby company board), pick an open job, click **Apply** so the real form is visible.
2. Run `npm run form-corpus:curated-oracle` (or `--url=...` when already on an apply/application URL).
3. CLI always reads HTML + detector inventory (no min-fields reject), then NanoGPT extracts fields from HTML only.
4. Soft-diff counts/labels/types:
   - **Agree** -> `save_fixture`, manifest `source: bridge-oracle`, write `expected/{id}.json` from detector inventory, oracle sidecar under `oracle-sidecars/`.
   - **Disagree** -> still save HTML + triage row in `curated-oracle-report.json`. **Default next step (do not ask):** fix `ai_only` detector misses in heuristics/inventory, rebuild extension, re-run curated oracle on the same page, then continue to the next form. Treat `detector_only` as secondary (often truncated AI HTML).
5. Default session cap is **5** captures; press Enter between active-tab captures or pass multiple `--url=`. Never chain unattended batches for this path.

```bash
npm run form-corpus:curated-oracle
npm run form-corpus:curated-oracle -- --limit=3
npm run form-corpus:curated-oracle -- --url=https://jobs.lever.co/leverdemo-8/.../apply
```

Report: `tests/fixtures/form-extraction/curated-oracle-report.json`.

## What to capture per scenario

Minimum for a durable fixture:

| Artifact | Purpose |
| --- | --- |
| **HTML** (`save_fixture` or manual) | Offline JSDOM / Playwright regression |
| **Manifest entry** | `tests/fixtures/form-extraction/manifest.json` - id, url, title, `source`, tags |
| **Expected inventory** | `propose-expectations.mjs` -> `expected/{id}.json` (field count, labels, types, options) |
| **`interaction_steps`** (when needed) | Click-to-reveal, wizard advance, combobox open - see `interaction-runner.mjs` |
| **Notes** | Widget types, step index, iframe/shadow quirks in manifest `notes` |

Strong captures (mirror LinkedIn stuck-state practice):

- **Wizard groups** - multiple HTML files per flow (step 1 contact, step 2 questions, etc.)
- **Live inventory snapshot** - `get_field_inventory` at capture time; diff if offline snapshot disagrees
- **Diagnose sidecars** - when validation fails or inventory is empty but the form clearly has questions

## Growth loop

```text
Navigate (MCP: board -> job -> Apply)
  -> Curated dual-oracle (detector vs NanoGPT)
  -> Agree: expected + fill-verify one id
  -> Disagree: triage, fix heuristics or expected, re-compare
  -> Promote (curated/smoke when pattern is valuable)
```

Legacy volume path (detector already works): `form-corpus:bridge-scrape` with batches of 50 - not for detector improvement.

### Bridge MCP session checklist

Prerequisites: `npm run extension-bridge`, unpacked extension from `extension/dist/`, bridge connected.

1. `extension_status` - confirm connection and tab
2. Land on the real apply form (Ashby/Lever: click Apply; do not capture JD-only pages)
3. Prefer `npm run form-corpus:curated-oracle` over raw `save_fixture` when growing detection coverage
4. On disagree: `get_page_html`, compare oracle sidecar, fix heuristics or hand-write expected
5. `apply_answer` or `start_draft_all` - prove fill path when validating a fix
6. `read_field_values` + `read_form_validation` - after each meaningful action

For multi-step flows, capture per step before advancing.

### After capture (encode in CI)

```bash
node scripts/form-corpus/propose-expectations.mjs --id=<fixture-id>
node scripts/form-corpus/vet-corpus.mjs --id=<fixture-id>
# Add mock answers in scripts/form-corpus/lib/mock-answers.mjs if fill-verify needs them
node scripts/form-corpus/run-fill-verify-curated.mjs --id=<fixture-id> --check-validity --check-a11y --check-errors
npm run form-corpus:build-curated   # if promoting to curated/smoke
```

Extension E2E mocks (optional, heavier):

```bash
npm run form-corpus:generate-e2e-mocks -- --id=<fixture-id>
EXTENSION_E2E=1 node scripts/form-corpus/run-extension-fill-e2e.mjs --id=<fixture-id>
```

## Corpus tiers and CI

**Form corpus fill-verify does not run on pull requests.** PR CI (`tests.yml`) runs PHP tests only. All corpus tiers are **manual** via GitHub Actions → **Tests (heavy)** → Run workflow (`tests-heavy.yml`), or locally.

| Status / tier | Meaning | When it runs |
| --- | --- | --- |
| `draft` | Captured, not vetted | Never in CI |
| `vetted` | Passes vet + fill-verify | Manual heavy workflow / local batch jobs |
| **Curated** | High-value subset (~124+) | Manual: `run_curated_fill_verify` input |
| **Smoke** | Platform/widget picks (~13+) | Manual: `run_smoke_playwright` input |
| **Heavy PHPUnit** | Full extension unit tier | Manual: `run_heavy_phpunit` input |
| **Extension E2E** | Playwright + extension + mocks | Manual: `run_extension_e2e` input (slow) |

Local equivalents:

```bash
npm run form-corpus:fill-verify:curated -- --json-only --workers=8
npm run form-corpus:fill-verify:smoke
FORM_CORPUS_HEAVY=1 php artisan test --compact tests/Unit/Extension/
EXTENSION_E2E=1 php artisan test --compact --group=extension-e2e
```

When **increasing test coverage**, prefer:

1. New **vetted** real captures (`web-*`, `bridge-*`) for novel DOM patterns
2. Promotion to **curated** or **smoke** when the pattern is common or regression-prone
3. Targeted **PHPUnit / node** tests only for pure logic (pipeline, stream parsing, label normalization) - not as a substitute for corpus fixtures

Default pre-push checks remain in `.cursor/rules/pre-commit-quality.mdc`. During iteration use `.cursor/rules/minimal-test-runs.mdc`.

## When to add coverage (decision guide)

| Change | Add coverage by |
| --- | --- |
| New widget / ATS pattern found live | Curated dual-oracle capture + investigate disagree + fill-verify `--id=` |
| `form-heuristics.js` / `field-inventory.js` | Smoke fill-verify + any new fixtures for the bug |
| Draft All orchestration only | Node/PHPUnit unit tests + existing E2E mocks |
| New job-board Auto Apply | Live MCP phase 1 + synthetic platform corpus (`syn-{platform}-*`) |
| Bulk URL discovery (volume only) | `discover.mjs` + optional `form-corpus:bridge-scrape` (legacy detector gate) - not for detector improvement |

## What not to do

- Leave long unattended bridge-scrape / Ashby board crawls when improving detection - review the first captures, use curated dual-oracle instead.
- Use detector inventory alone as the accept gate for fixtures meant to improve that detector (circular).
- Scale `web-*` HTML without vetting - frozen pre-hydration DOM and wrong page types (listings, login walls) pollute the corpus.
- Treat JSDOM fill-verify alone as proof of question detection - confirm with live `get_field_inventory` when possible.
- Replace corpus growth with only synthetic generators - generators model categories learned from live captures.
- Run the full ~100 scenario E2E batch on every small heuristic tweak - use `--id=` and smoke tier first.

## Scaling to ~8,000 net-new high-quality fixtures

You already have **~5,300** manifest scenarios (mostly low-diversity parametric synthetics like `syn-complex-500-*`). **This growth target is on top of that baseline** - not a replacement. End state is roughly **~13,300** total scenarios.

### Operational rule: batches of 50

**No long-running corpus commands.** Every generate/scrape/vet/fill job runs in **groups of at most 50**, then stops and writes a report. Review the report, tweak prompts/heuristics/filters, then start the next batch.

| Pipeline | Command |
| --- | --- |
| NanoGPT `syn-ai-*` | `npm run form-corpus:generate-ai -- --limit=50 --start-id=syn-ai-0001` |
| Firecrawl (legacy) | `npm run form-corpus:firecrawl-100 -- --limit=50 --force-firecrawl` |
| Bridge scrape (recommended) | `npm run form-corpus:bridge-scrape -- --limit=50` |
| Vet / fill | `npm run form-corpus:vet -- --id-prefix=syn-ai- --limit=50` |
| Matrix report | `npm run form-corpus:report-variety-matrix` |

Orchestrators hard-cap `--limit` at 50 (use `--force-over-cap` for local debugging only). They do not auto-chain multiple batches.

### What counts as high quality

A fixture earns `status: vetted` and a slot in the HQ set only if:

1. **Correct page type** - apply form / apply step, not listing, login, or success-only page.
2. **Mechanical inventory** - at least 2 draftable fields with labels ≥ 3 chars; no generic `"field"` / `"input"` only labels.
3. **Vet pass** - `vet-corpus.mjs` matches expected field types and DOM keys.
4. **Fill-verify pass** - JSDOM (or Playwright for interactive) with `--check-validity --check-a11y --check-errors`.
5. **Variety slot** - unique **pattern signature** in the matrix (duplicate ATS + same widget mix → re-brief/regenerate, not discard for `syn-ai-*`).
6. **Bridge spot-check** (sample) - for Firecrawl captures, ~15-20% validated live via `get_field_inventory` before promotion to HQ tier.

Optional HQ+:

- Live inventory golden JSON saved at capture time.
- `interaction_steps` for reveal/wizard/combobox.
- Extension E2E mock generated and passing.

### Variety matrix (plan coverage, not random volume)

Track coverage in a spreadsheet or manifest tags (`platform`, `widgets`, `step_kind`):

| Dimension | Target buckets (examples) |
| --- | --- |
| **ATS / host** | Ashby, Greenhouse, Lever, Workday, Teamtailor, SmartRecruiters, Workable, iCIMS, Oracle CE, Taleo, Personio, Pinpoint, custom WordPress/Jotform, government portals |
| **Widgets** | Native inputs, React-Select, combobox/listbox, pill yes/no, checkbox groups, date, masked phone, repeatable blocks, file-adjacent, location typeahead |
| **Structure** | Single page, wizard (2-5 steps), conditional reveal, iframe-hosted apply, shadow DOM shell |
| **Field count** | Small (2-5), medium (6-15), large (16-40), XL (40+) |

**Goal:** fill empty cells in the matrix before adding another Ashby clone with the same widget mix.

### Sourcing mix (~8,000 net new on top of ~5,300 existing)

| Source | Target (net new) | Role |
| --- | ---: | --- |
| **NanoGPT `syn-ai-*`** | ~4,000 | Two-step generate + repair + enrich; model `deepseek/deepseek-v4-flash` via `config('cv.form_corpus_ai_model')` |
| **Extension bridge scrape** | ~2,500 | Public ATS apply URLs via Chrome; `get_field_inventory` accept gate |
| **Extension bridge MCP (manual)** | ~1,500 | Logged-in / hydrated DOM; job-board modals; wizards |
| **Targeted synthetic** | ~500 | `syn-weird`, `syn-ix`, `syn-mega`, `syn-fw` - one edge case each, not `syn-complex-500` bulk |
| **Multi-step wizard groups** | ~500 flows | 2-5 HTML files per flow; manifest `flow_group` links steps |

For `syn-ai-*`: **salvage over discard** - review NanoGPT HTML, repair/regenerate until mechanical + vet + fill-verify pass.

### Pipeline (batch jobs, all manual trigger, max 50 per run)

```text
1. DISCOVER   firecrawl_search / discover.mjs / matrix report targets
2. GENERATE   form-corpus:generate-ai --limit=50 (or scrape --limit=50)
3. REPAIR     automatic in generate-ai batch; review repair report
4. PROPOSE    propose-expectations.mjs --limit=50
5. VET        vet-corpus.mjs --limit=50
6. FILL       run-fill-verify.mjs --limit=50 --check-validity --check-a11y --check-errors
7. SAMPLE     bridge spot-check 15% of new web-* (inventory diff)
8. PROMOTE    tag matrix cell; build-curated for representatives only
```

Bridge scrape batch entry point (requires `npm run extension-bridge` + extension from `extension/dist/`):

```bash
npm run form-corpus:bridge-scrape -- --limit=50
npm run form-corpus:bridge-scrape:bulk -- --total=2500
```

Firecrawl batch (disabled by default; pass `--force-firecrawl`):

```bash
npm run form-corpus:firecrawl-100 -- --limit=50 --force-firecrawl
```

NanoGPT batch entry point:

```bash
npm run form-corpus:generate-ai -- --limit=50 --start-id=syn-ai-0001
```

Bridge sprint entry point: MCP checklist in this doc + `save_fixture` (~50 captures per session).

### Reject rules (Firecrawl / bridge; not syn-ai-*)

Leave `draft` (do not count toward net-new HQ) when:

- Login wall, CAPTCHA-only, empty shell, listing page, "already applied"
- Fewer than 2 fields or all file-upload only (for `syn-ai-*`: repair/regenerate instead)
- JSDOM inventory diverges from bridge inventory without documented `interaction_steps`

### Enforcement at scale

- **PR:** PHPUnit fast tier only.
- **Manual heavy:** curated + smoke + optional full extension PHPUnit (`tests-heavy.yml`).
- **Corpus batch:** `tests-corpus-batch.yml` - single batch of max 50 per dispatch.
- **Curated manifest** stays ~150-180 representatives, not all net-new fixtures.

### What not to do

- Do not run `generate-complex-corpus-500` again for variety.
- Do not auto-vet entire Firecrawl dumps without fill-verify and dedup.
- Do not attach all net-new fixtures to CI.
- Do not run long-running full-prefix corpus commands - use batches of 50.

## Related docs and rules

- [`docs/platform-automation-playbook.md`](platform-automation-playbook.md) - five-phase platform workflow, phase 1 MCP autofill
- [`scripts/form-corpus/README.md`](../scripts/form-corpus/README.md) - fill-verify pyramid and commands
- [`scripts/extension-bridge/README.md`](../scripts/extension-bridge/README.md) - MCP tools
- `.cursor/rules/form-corpus-growth.mdc` - agent rule when increasing test coverage
- `.cursor/rules/extension-e2e-mcp-testing.mdc` - live MCP verification discipline
- `.cursor/rules/extension-bridge-mcp.mdc` - bridge-first debugging
