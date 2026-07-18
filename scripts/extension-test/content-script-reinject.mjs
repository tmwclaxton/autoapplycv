#!/usr/bin/env node
/**
 * Prove content-script files can execute twice in the same realm without SyntaxError
 * (chrome.scripting.executeScript reinject after reload / second ensureTabContentScript).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const CONTENT_SCRIPT_FILES = [
    'extension/src/shared/extension-context.js',
    'extension/src/shared/debug-log-client.js',
    'extension/src/content/form-content-signature.js',
    'extension/src/content/answer-normalization.js',
    'extension/src/content/form-heuristics.js',
    'extension/src/content/field-inventory.js',
    'extension/src/content/form-validation-errors.js',
    'extension/src/content/linkedin-parser.js',
    'extension/src/content/linkedin-page-health.js',
    'extension/src/content/linkedin-easy-apply-fields.js',
    'extension/src/shared/auto-apply-timing-content.js',
    'extension/src/content/linkedin-auto-apply.js',
    'extension/src/content/indeed-auto-apply.js',
    'extension/src/content/totaljobs-auto-apply.js',
    'extension/src/content/glassdoor-auto-apply.js',
    'extension/src/content/simplyhired-auto-apply.js',
    'extension/src/content/reed-auto-apply.js',
    'extension/src/content/cv-library-auto-apply.js',
    'extension/src/content/focus-tracker.js',
    'extension/src/content/field-highlighter.js',
];

function createSandbox() {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        chrome: {
            runtime: {
                id: 'test-extension-id',
                getURL: (path) => `chrome-extension://test/${path}`,
                sendMessage: () => {},
                onMessage: {
                    addListener() {},
                    removeListener() {},
                },
            },
            storage: {
                local: {
                    get: async () => ({}),
                    set: async () => {},
                },
                session: {
                    get: async () => ({}),
                    set: async () => {},
                    remove: async () => {},
                },
            },
        },
        document: {
            readyState: 'complete',
            addEventListener() {},
            removeEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({
                style: {},
                classList: { add() {}, remove() {}, contains() {
 return false; 
} },
                setAttribute() {},
                appendChild() {},
            }),
            body: {
                appendChild() {},
            },
            documentElement: {},
        },
        window: null,
        navigator: { userAgent: 'test' },
        location: { href: 'http://localhost:8000/dashboard?tab=cover-letter' },
        Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
        Element: class Element {},
        HTMLElement: class HTMLElement {},
        MutationObserver: class MutationObserver {
            observe() {}
            disconnect() {}
        },
    };

    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    sandbox.self = sandbox;

    return vm.createContext(sandbox);
}

function runFiles(context, files) {
    for (const relativePath of files) {
        const code = readFileSync(join(ROOT, relativePath), 'utf8');
        vm.runInContext(code, context, { filename: relativePath });
    }
}

const context = createSandbox();

runFiles(context, CONTENT_SCRIPT_FILES);
assert.equal(typeof context.AutoCVApplyExtensionContext, 'object');
assert.equal(typeof context.AutoCVApplyDebugLog, 'object');
assert.equal(typeof context.AutoCVApplyFormHeuristics, 'object');
assert.equal(typeof context.AutoCVApplyFieldHighlighter, 'object');

// Second inject must not throw (the dashboard bug).
assert.doesNotThrow(() => {
    runFiles(context, CONTENT_SCRIPT_FILES);
});

assert.equal(typeof context.AutoCVApplyExtensionContext, 'object');
assert.equal(typeof context.AutoCVApplyFormHeuristics, 'object');

const contentMain = readFileSync(join(ROOT, 'extension/src/content/index.js'), 'utf8');
assert.match(contentMain, /function AutoCVApplyContentScriptMain/);
assert.match(contentMain, /__autocvapplyContentIsLive/);

const guardSource = readFileSync(join(ROOT, 'extension/src/shared/form-frame-messaging.js'), 'utf8');
assert.match(guardSource, /pingTabContentScript\(tabId\)/);
assert.match(guardSource, /skipped: true/);
assert.match(guardSource, /tabContentScriptEnsureInFlight/);
assert.match(guardSource, /Content script ping failed/);

const contextSource = readFileSync(join(ROOT, 'extension/src/shared/extension-context.js'), 'utf8');
assert.match(contextSource, /Always re-check runtime identity/);
assert.doesNotMatch(
    contextSource,
    /if \(contextProbePassed\) \{\s*return true;\s*\}/,
);

console.log('ok - content scripts execute twice without SyntaxError');
console.log('ok - content main is idempotent-wrapped');
console.log('ok - injectManifestContentScripts pings before inject');
console.log('ok - empty ping responses reinject instead of raw failure');
console.log('ok - extension context re-probes runtime identity');
console.log('\n5 content-script reinject checks passed.');
