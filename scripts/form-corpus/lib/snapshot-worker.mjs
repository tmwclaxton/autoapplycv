import { parentPort, workerData } from 'node:worker_threads';
import { buildSnapshotFromFile } from './snapshot-runner.mjs';

/** @type {Array<{ id: string, htmlPath: string, pageUrl: string, pageTitle: string, interactionSteps?: Array<{ action: string, selector?: string, text?: string }> }>} */
const scenarios = workerData.scenarios ?? [];
const results = {};

for (const scenario of scenarios) {
    results[scenario.id] = buildSnapshotFromFile(
        scenario.htmlPath,
        scenario.pageUrl,
        scenario.pageTitle,
        scenario.interactionSteps || [],
    );
}

parentPort.postMessage(results);
