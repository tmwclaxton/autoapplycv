import { availableParallelism, cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HTML_DIR } from './paths.mjs';

function resolveWorkerCount(requested, scenarioCount) {
    const cpuCount = availableParallelism?.() ?? cpus().length;
    const capped = Math.min(cpuCount, 8, scenarioCount);

    if (requested === undefined || requested === null) {
        return Math.max(1, capped);
    }

    return Math.max(1, Math.min(requested, scenarioCount));
}

function chunkScenarios(scenarios, workerCount) {
    const chunks = Array.from({ length: workerCount }, () => []);

    for (let index = 0; index < scenarios.length; index += 1) {
        chunks[index % workerCount].push(scenarios[index]);
    }

    return chunks.filter((chunk) => chunk.length > 0);
}

function runWorker(scenarios) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./snapshot-worker.mjs', import.meta.url), {
            workerData: { scenarios },
        });

        worker.once('message', resolve);
        worker.once('error', reject);
        worker.once('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Snapshot worker exited with code ${code}.`));
            }
        });
    });
}

/**
 * @param {Array<{ id: string, html_file: string, page_url?: string, page_title?: string }>} scenarios
 */
export async function buildAllSnapshotsParallel(scenarios, workerCount) {
    const jobs = scenarios
        .map((scenario) => {
            const htmlPath = join(HTML_DIR, scenario.html_file);

            if (!existsSync(htmlPath)) {
                return null;
            }

            return {
                id: scenario.id,
                htmlPath,
                pageUrl: scenario.page_url || `https://example.test/forms/${scenario.id}`,
                pageTitle: scenario.page_title || 'Job Application',
                interactionSteps: scenario.interaction_steps || [],
            };
        })
        .filter(Boolean);

    if (jobs.length === 0) {
        return {};
    }

    const workers = resolveWorkerCount(workerCount, jobs.length);
    const chunks = chunkScenarios(jobs, workers);
    const partials = await Promise.all(chunks.map((chunk) => runWorker(chunk)));

    return Object.assign({}, ...partials);
}
