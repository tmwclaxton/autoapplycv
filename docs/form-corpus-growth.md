# Form corpus growth strategy

Question detection on the open web is a **long-tail coverage problem**. The form corpus is the **product spec** for what the extension must see, label, and fill. Volume and variety of real examples matter more than one clever parser.

This doc defines how to grow that corpus and how test coverage should expand with it.

## Core idea

1. **Sheer volume and variety** - Collect many application forms across ATS families, frameworks, and one-off employer sites. Patterns repeat, but the long tail never ends.
2. **Understand before you freeze** - Use Cursor with the **extension bridge MCP** on live Chrome tabs. Spend time on nasty pages: wizards, conditionals, iframes, pill buttons, comboboxes. Do not only scrape static HTML.
3. **Capture what you learned** - Each fixture should encode understanding, not just a DOM dump.
4. **Ever-growing corpus** - New captures become regression tests. The extension must keep passing as the corpus grows.

**Synthetic fixtures** (`syn-complex-*`, `syn-weird-*`, platform generators) supplement live captures. They do not replace real apply DOM. See LinkedIn: live HTML captures are authoritative (`docs/platform-automation-playbook.md`).

## Roles of Firecrawl vs extension bridge

| Tool | Role |
| --- | --- |
| **Firecrawl** | Firehose: discover URLs, scrape apply pages, optional multi-step via `actions` / `interact`. Good for public ATS apply URLs at scale. |
| **Extension bridge** | Editorial layer: logged-in sessions, real hydration, inventory, Draft All, validation readback. Required for job-board modals and for ground truth. |

Workflow: Firecrawl finds candidates; bridge sessions **promote** only pages that were explored and captured correctly.

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
Explore (bridge MCP on live tab)
  -> Understand (inventory, HTML, validation, multi-step)
  -> Capture (save_fixture + manifest + propose)
  -> Fix (form-heuristics.js, field-inventory.js, platform *-auto-apply.js, mock-answers.mjs)
  -> Encode (vet, mock answers, promote tier)
  -> Gate (fill-verify smoke/curated, extension E2E subset)
  -> Promote (curated manifest, audit scenarios)
```

### Bridge MCP session checklist

Prerequisites: `npm run extension-bridge`, unpacked extension from `extension/dist/`, bridge connected.

1. `extension_status` - confirm connection and tab
2. `get_field_inventory` - every visible question has a ref and sensible label/type
3. `get_page_html` when inventory looks wrong
4. `apply_answer` or `start_draft_all` - prove fill path
5. `read_field_values` + `read_form_validation` - after each meaningful action
6. `click_control` / `click_ref` / `wait_for_tab` - wizards and SPAs
7. `save_fixture` - persist redacted HTML when the pattern is new or broken

For multi-step flows, repeat inventory + capture per step before advancing.

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

Do not put every new fixture in the default fast CI path. Use tiers:

| Status / tier | Meaning | Typical CI |
| --- | --- | --- |
| `draft` | Captured, not vetted | None |
| `vetted` | Passes vet + fill-verify | Full corpus jobs / manual |
| **Curated** | High-value subset | `form-corpus:fill-verify:curated` |
| **Smoke** | One per platform/pattern | `form-corpus:fill-verify:smoke` |
| **Audit** | Extension E2E + quality | `form-corpus:answer-quality-audit` |

When **increasing test coverage**, prefer:

1. New **vetted** real captures (`web-*`, `bridge-*`) for novel DOM patterns
2. Promotion to **curated** or **smoke** when the pattern is common or regression-prone
3. Targeted **PHPUnit / node** tests only for pure logic (pipeline, stream parsing, label normalization) - not as a substitute for corpus fixtures

Default pre-push checks remain in `.cursor/rules/pre-commit-quality.mdc`. During iteration use `.cursor/rules/minimal-test-runs.mdc`.

## When to add coverage (decision guide)

| Change | Add coverage by |
| --- | --- |
| New widget / ATS pattern found live | Bridge capture + vet + curated fill-verify |
| `form-heuristics.js` / `field-inventory.js` | Smoke fill-verify + any new fixtures for the bug |
| Draft All orchestration only | Node/PHPUnit unit tests + existing E2E mocks |
| New job-board Auto Apply | Live MCP phase 1 + synthetic platform corpus (`syn-{platform}-*`) |
| Bulk URL discovery | Firecrawl scrape batch, then bridge spot-check before vet |

## What not to do

- Scale `web-*` HTML without vetting - frozen pre-hydration DOM and wrong page types (listings, login walls) pollute the corpus.
- Treat JSDOM fill-verify alone as proof of question detection - confirm with live `get_field_inventory` when possible.
- Replace corpus growth with only synthetic generators - generators model categories learned from live captures.
- Run the full ~100 scenario E2E batch on every small heuristic tweak - use `--id=` and smoke tier first.

## Related docs and rules

- [`docs/platform-automation-playbook.md`](platform-automation-playbook.md) - five-phase platform workflow, phase 1 MCP autofill
- [`scripts/form-corpus/README.md`](../scripts/form-corpus/README.md) - fill-verify pyramid and commands
- [`scripts/extension-bridge/README.md`](../scripts/extension-bridge/README.md) - MCP tools
- `.cursor/rules/form-corpus-growth.mdc` - agent rule when increasing test coverage
- `.cursor/rules/extension-e2e-mcp-testing.mdc` - live MCP verification discipline
- `.cursor/rules/extension-bridge-mcp.mdc` - bridge-first debugging
