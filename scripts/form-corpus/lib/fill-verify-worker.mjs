import { parentPort, workerData } from 'node:worker_threads';
import { runFillVerifyForScenario, stackCategory } from './fill-verify-runner.mjs';

/** @type {Array<Record<string, unknown>>} */
const scenarios = workerData.scenarios ?? [];
/** @type {Record<string, unknown>} */
const verifyOptions = workerData.verifyOptions ?? {};
const results = [];

for (const scenario of scenarios) {
    const result = await runFillVerifyForScenario(scenario, verifyOptions);
    results.push({
        ...result,
        stack: stackCategory(scenario),
    });
}

parentPort.postMessage(results);
