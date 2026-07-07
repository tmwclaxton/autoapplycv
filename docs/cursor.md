# Cursor developer guide

Notes for working on AutoCVApply with Cursor agents and MCP tools.

---

## Extension bridge

Local dev bridge that connects your real Chrome profile (site cookies, SSO sessions) to Cursor agents via MCP. Lets agents read page HTML, field inventories, and debug logs from tabs you have open - without Playwright or a separate browser profile.

Components:

- **Extension client** (`extension/src/shared/bridge-client.js`): outbound WebSocket from the background service worker.
- **Bridge server** (`scripts/extension-bridge/server.mjs`): WebSocket + HTTP on localhost.
- **MCP server** (`scripts/extension-bridge/mcp-server.mjs`): stdio MCP wrapper over the HTTP API.

Full reference: [`scripts/extension-bridge/README.md`](../scripts/extension-bridge/README.md).

### Start the bridge

```bash
npm run extension-bridge
```

Keep this running while you use MCP tools. After extension code changes:

```bash
npm run build:extension
```

Then reload the unpacked extension from `extension/dist/` in Chrome.

### Enable in Chrome

The bridge is **dev-only**. It auto-connects when you load the unpacked build from `extension/dist/` (no Chrome Web Store `update_url` in the manifest). That works with production `api_base` so you keep real site cookies while agents use MCP.

It also connects when extension `api_base` points at `http://localhost` or `http://127.0.0.1` (typical local Laravel).

**Typical workflow:** `npm run build:extension`, load unpacked from `extension/dist/`, reload after code changes. No storage flags needed.

**Chrome Web Store install:** set `EXTENSION_BRIDGE_ENABLED` in the service worker console:

```javascript
chrome.storage.local.set({ EXTENSION_BRIDGE_ENABLED: true });
```

Reload the extension. To disable on an unpacked build: `chrome.storage.local.set({ EXTENSION_BRIDGE_ENABLED: false })`.

### MCP config

Add to `.cursor/mcp.json` (adjust `cwd` path):

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

### MCP tools

| Tool | Purpose |
| --- | --- |
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
| `click_control` | Click Continue/Next by label (inventory, then HTML parse, then live text) |
| `find_buttons` | List clickable buttons parsed from captured HTML |
| `click_text` | Click live button/link by visible text |
| `click_ref` | Click inventory ref (`f0`, `c0`, etc.) |
| `click_selector` | Click CSS selector |
| `apply_answer` | Fill one field by ref or label |
| `start_draft_all` | Run Draft All on active tab |

### Quick test

1. `npm run extension-bridge`
2. Reload extension with bridge enabled (see above).
3. Open a job application tab in Chrome.
4. Verify connection:

```bash
curl -s http://127.0.0.1:7433/status
```

Response should include `"extensionConnected": true`.

5. In Cursor, call `extension_status` via MCP.
