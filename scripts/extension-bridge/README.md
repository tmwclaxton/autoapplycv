# AutoCVApply Extension Bridge

Local dev bridge that connects your real Chrome profile (with site cookies and SSO) to Cursor agents via MCP.

## Components

- **Extension client** (`extension/src/shared/bridge-client.js`): outbound WebSocket from the background service worker to `ws://127.0.0.1:7432`.
- **Bridge server** (`scripts/extension-bridge/server.mjs`): WebSocket + HTTP on localhost.
- **MCP server** (`scripts/extension-bridge/mcp-server.mjs`): stdio MCP wrapper over the HTTP API.

## Enable the bridge in Chrome

The bridge is **dev-only**. It auto-connects when you load the unpacked build from `extension/dist/` (no Chrome Web Store `update_url` in the manifest). That works with production `api_base` so you keep real site cookies while agents use MCP.

It also connects when extension `api_base` points at `http://localhost` or `http://127.0.0.1` (typical local Laravel).

**Typical workflow:** `npm run build:extension`, load unpacked from `extension/dist/`, reload after code changes. No storage flags needed.

**Chrome Web Store install:** set `EXTENSION_BRIDGE_ENABLED` in the service worker console:

```javascript
chrome.storage.local.set({ EXTENSION_BRIDGE_ENABLED: true });
```

Reload the extension. To disable on an unpacked build:

```javascript
chrome.storage.local.set({ EXTENSION_BRIDGE_ENABLED: false });
```

## Run locally

Terminal 1 - bridge server:

```bash
npm run extension-bridge
```

Terminal 2 - rebuild extension after code changes:

```bash
npm run build:extension
```

Reload the unpacked extension from `extension/dist/` in Chrome.

## Connect MCP in Cursor

Add to `.cursor/mcp.json` (adjust path):

```json
{
  "mcpServers": {
    "autocvapply-extension": {
      "command": "node",
      "args": ["scripts/extension-bridge/mcp-server.mjs"],
      "cwd": "/Users/toby.claxton/Projects/autocvapply"
    }
  }
}
```

Start `npm run extension-bridge` before using MCP tools.

## MCP tools

| Tool | Purpose |
|------|---------|
| `extension_status` | Bridge + extension connection, token, active tab |
| `get_page_html` | HTML from content script |
| `get_field_inventory` | Mechanical field snapshot |
| `get_debug_logs` | Debug log buffer (optional E2E export) |
| `set_active_tab` | Pin commands to a tab id |
| `request_auth` | API token + site login pending detection |
| `save_fixture` | Write redacted HTML to form corpus |
| `list_tabs` | List open http/https tabs |
| `activate_tab` | Focus a tab by id |
| `navigate_tab` | Open URL in current or new tab |
| `wait_for_tab` | Wait for load / URL substring |
| `click_control` | Click Continue/Next by label |
| `click_ref` | Click inventory ref (`f0`, `c0`, etc.) |
| `click_selector` | Click CSS selector |
| `apply_answer` | Fill one field by ref or label |
| `start_draft_all` | Run Draft All on active tab |
| `read_field_values` | Live DOM values/checked state for fill verification |
| `read_form_validation` | Scan validation errors; optionally trigger client-side validation via submit |
| `linkedin_tab_message` | Send LinkedIn content-script messages (`LINKEDIN_EASY_APPLY_STATE`, `LINKEDIN_EXPORT_EASY_APPLY_MODAL`, etc.) |
| `indeed_tab_message` | Send Indeed content-script messages (`INDEED_APPLY_STATE`, `INDEED_FILL_AND_ADVANCE`, etc.) |
| `totaljobs_tab_message` | Send Totaljobs content-script messages (`TOTALJOBS_APPLY_STATE`, `TOTALJOBS_FILL_AND_ADVANCE`, etc.) |
| `glassdoor_tab_message` | Send Glassdoor content-script messages (`GLASSDOOR_OPEN_APPLY`, `GLASSDOOR_COLLECT_JOB_CARDS`, etc.) |
| `start_auto_apply` | Start LinkedIn, Indeed, Totaljobs, Glassdoor, or Reed Auto Apply |

## Test the connection

1. `npm run extension-bridge`
2. Reload extension with bridge enabled (see above).
3. Open a job application tab in Chrome.
4. `curl http://127.0.0.1:7433/status` should show `"extensionConnected": true`.
5. In Cursor, call `extension_status` via MCP.

Example HTTP command:

```bash
curl -s http://127.0.0.1:7433/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"get_page_html","params":{}}'
```

## Configuration

Environment variables (optional):

| Variable | Default |
|----------|---------|
| `EXTENSION_BRIDGE_WS_HOST` | `127.0.0.1` |
| `EXTENSION_BRIDGE_WS_PORT` | `7432` |
| `EXTENSION_BRIDGE_HTTP_HOST` | `127.0.0.1` |
| `EXTENSION_BRIDGE_HTTP_PORT` | `7433` |
| `EXTENSION_BRIDGE_COMMAND_TIMEOUT_MS` | `30000` |

## Interaction workflow

Typical Indeed / multi-step apply loop:

1. `list_tabs` or `extension_status` - find the apply tab.
2. `set_active_tab` - pin it for subsequent commands.
3. `get_field_inventory` - read fields and `controls` (Continue, Next).
4. `apply_answer` - fill fields by `ref` (`f0`, `f1`, ...).
5. `click_control` with `name: "Continue"` - advance the step.
6. `wait_for_tab` with `urlIncludes: "indeedapply/form"` - wait for SPA navigation.
7. `start_draft_all` - run full Draft All when you want AI answers.

Navigation:

```bash
curl -s http://127.0.0.1:7433/command -H 'Content-Type: application/json' \
  -d '{"action":"navigate_tab","params":{"url":"https://uk.indeed.com/"}}'
```

## Security

- Listeners bind to localhost only.
- Unpacked dev builds auto-enable the bridge; Chrome Web Store installs require `EXTENSION_BRIDGE_ENABLED`.
- Navigation is limited to `http`/`https` URLs.
- `save_fixture` redacts known secret patterns before writing HTML.

## Limitations (MVP)

- One extension connection at a time (latest reconnect wins).
- No remote access; localhost only.
- `request_auth` detects common login URL patterns but does not automate SSO.
- `save_fixture` adds draft manifest entries; vet/propose steps are manual.
- Service worker may sleep; keep a bridge tab open or ping periodically if commands stall.
