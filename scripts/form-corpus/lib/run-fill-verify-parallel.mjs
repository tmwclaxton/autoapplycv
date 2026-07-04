import { availableParallelism, cpus } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { EXPECTED_DIR, HTML_DIR } from './paths.mjs';

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

function runWorker(scenarios, verifyOptions) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./fill-verify-worker.mjs', import.meta.url), {
            workerData: { scenarios, verifyOptions },
        });

        worker.once('message', resolve);
        worker.once('error', reject);
        worker.once('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Fill verify worker exited with code ${code}.`));
            }
        });
    });
}

function hasExpectedFixture(id) {
    return existsSync(join(EXPECTED_DIR, `${id}.json`));
}

function sampleMegaScenarios(scenarios, sampleSize) {
    const mega = scenarios.filter((scenario) => scenario.id.startsWith('syn-mega-') && hasExpectedFixture(scenario.id));

    if (sampleSize >= mega.length) {
        return mega;
    }

    const stride = Math.max(1, Math.floor(mega.length / sampleSize));
    const sampled = [];

    for (let index = 0; index < mega.length && sampled.length < sampleSize; index += stride) {
        sampled.push(mega[index]);
    }

    return sampled;
}

/**
 * @param {Array<Record<string, unknown>>} scenarios
 * @param {{ workerCount?: number, includeMega?: boolean, megaSample?: number, verifyOptions?: Record<string, unknown> }} options
 */
export async function runFillVerifyParallel(scenarios, options = {}) {
    const includeMega = options.includeMega === true;
    const megaSample = options.megaSample ?? 20;
    const verifyOptions = options.verifyOptions ?? {};

    let jobs = scenarios.filter((scenario) => {
        if (!hasExpectedFixture(scenario.id)) {
            return false;
        }

        if (!existsSync(join(HTML_DIR, scenario.html_file))) {
            return false;
        }

        if (scenario.id.startsWith('syn-mega-') && !includeMega) {
            return false;
        }

        return true;
    });

    if (includeMega) {
        const nonMega = jobs.filter((scenario) => !scenario.id.startsWith('syn-mega-'));
        const megaSampled = sampleMegaScenarios(jobs, megaSample);
        jobs = [...nonMega, ...megaSampled];
    }

    if (jobs.length === 0) {
        return [];
    }

    const workers = resolveWorkerCount(options.workerCount, jobs.length);
    const chunks = chunkScenarios(jobs, workers);
    const partials = await Promise.all(chunks.map((chunk) => runWorker(chunk, verifyOptions)));

    return partials.flat();
}
