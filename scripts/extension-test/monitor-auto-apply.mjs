#!/usr/bin/env node
/** Poll extension bridge auto_apply_status and print new log lines. */
const BRIDGE = 'http://127.0.0.1:7433';
const POLL_MS = Number(process.env.MONITOR_POLL_MS || 2500);

async function bridgeCommand(action, params = {}, timeoutMs = 30000) {
    const response = await fetch(`${BRIDGE}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params, timeoutMs }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(body.error || `HTTP ${response.status}`);
    }

    return body.result;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    let lastLog = 0;

    while (true) {
        const status = await bridgeCommand('auto_apply_status', {}, 30000);
        const session = status?.session || {};
        const log = session.log || [];
        const stats = session.stats || {};

        if (log.length > lastLog) {
            for (const entry of log.slice(lastLog)) {
                const time = entry.ts ? new Date(entry.ts).toISOString().slice(11, 19) : '??:??:??';
                console.log(`[${time}] ${entry.message}`);
            }

            lastLog = log.length;
        }

        console.log(
            `[monitor] ${session.status || 'idle'} | running=${Boolean(status?.running)} `
            + `applied=${stats.applied || 0} skipped=${stats.skipped || 0} `
            + `errors=${stats.errors || 0} fitSkipped=${stats.fitSkipped || 0} `
            + `idx=${session.currentIndex || 0}/${session.queue?.length || 0}`,
        );

        if (!status?.running && ['completed', 'stopped', 'error'].includes(session.status)) {
            break;
        }

        await sleep(POLL_MS);
    }
}

main().catch((error) => {
    console.error(`Monitor failed: ${error.message}`);
    process.exitCode = 1;
});
