import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { applyInteractionSteps } from './interaction-runner.mjs';
import { FIELD_INVENTORY_PATH, FORM_HEURISTICS_PATH } from './paths.mjs';

/** Strip stylesheets so JSDOM does not spend minutes parsing scraped CSS. */
function stripStylesheets(html) {
    return html
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi, '')
        .replace(/<link\b[^>]*\bas=["']?style["']?[^>]*>/gi, '');
}

const SHADOW_ROOT_PATCH = `
if (typeof ShadowRoot === 'undefined') {
    globalThis.ShadowRoot = class ShadowRoot {};
}
`;

const VISIBILITY_PATCH = `
(function () {
    function patchElement(el) {
        if (!el || el.nodeType !== 1) {
            return;
        }

        el.style.display = el.style.display || 'block';
        el.style.visibility = 'visible';

        Object.defineProperty(el, 'offsetParent', {
            configurable: true,
            get() {
                return this.parentElement || document.body;
            },
        });

        Object.defineProperty(el, 'offsetWidth', {
            configurable: true,
            get() {
                return 100;
            },
        });

        Object.defineProperty(el, 'offsetHeight', {
            configurable: true,
            get() {
                return 20;
            },
        });
    }

    document.querySelectorAll('input, textarea, select, button, [role="button"], [role="radio"], [role="radiogroup"], [role="checkbox"], [role="listbox"], [role="option"], [role="combobox"]').forEach(patchElement);
})();
`;

let cachedHeuristicsScript;
let cachedInventoryScript;

function extensionScripts() {
    if (! cachedHeuristicsScript) {
        cachedHeuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
            .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');
        cachedInventoryScript = readFileSync(FIELD_INVENTORY_PATH, 'utf8')
            .replace('const AutoCVApplyFieldInventory =', 'globalThis.AutoCVApplyFieldInventory =');
    }

    return { heuristics: cachedHeuristicsScript, inventory: cachedInventoryScript };
}

function loadExtensionScripts(window, context) {
    const { heuristics, inventory } = extensionScripts();

    vm.runInContext(SHADOW_ROOT_PATCH, context);
    vm.runInContext(VISIBILITY_PATCH, context);
    vm.runInContext(heuristics, context);
    vm.runInContext(inventory, context);

    if (typeof window.AutoCVApplyFieldInventory === 'undefined') {
        throw new Error('AutoCVApplyFieldInventory failed to load.');
    }
}

/**
 * @param {{ html: string, pageUrl?: string, pageTitle?: string, interactionSteps?: Array<{ action: string, selector?: string, text?: string }> }} options
 */
export function buildFormDomContext(options) {
    const pageUrl = options.pageUrl || 'https://example.test/apply';
    const pageTitle = options.pageTitle || 'Job Application';
    const interactionSteps = options.interactionSteps || [];

    const dom = new JSDOM(stripStylesheets(options.html), {
        url: pageUrl,
        contentType: 'text/html',
        includeNodeLocations: false,
        runScripts: 'outside-only',
    });

    const { window } = dom;
    const context = dom.getInternalVMContext();

    if (window.document.title !== pageTitle) {
        window.document.title = pageTitle;
    }

    loadExtensionScripts(window, context);
    applyInteractionSteps(window, interactionSteps);
    vm.runInContext(SHADOW_ROOT_PATCH, context);
    vm.runInContext(VISIBILITY_PATCH, context);

    const snapshot = window.AutoCVApplyFieldInventory.buildSnapshot(
        window.document,
        null,
        {},
        {},
    );

    return { window, snapshot };
}

function publicSnapshot(snapshot) {
    return {
        page_url: snapshot.page_url,
        page_title: snapshot.page_title,
        elements: (snapshot.elements || []).map((element) => ({
            ref: element.ref,
            question: element.question,
            field_type: element.field_type,
            max_chars: element.max_chars ?? null,
            options: element.options ?? null,
            required: element.required ?? false,
            context: element.context ?? null,
            dom: element.dom ?? null,
        })),
        controls: (snapshot.controls || []).map((control) => ({
            name: control.name,
            role: control.role ?? 'button',
        })),
    };
}

/**
 * @param {{ html: string, pageUrl?: string, pageTitle?: string, interactionSteps?: Array<{ action: string, selector?: string, text?: string }> }} options
 */
export function buildSnapshotFromHtml(options) {
    const { snapshot } = buildFormDomContext(options);
    const mapped = publicSnapshot(snapshot);

    return {
        page_url: mapped.page_url,
        page_title: mapped.page_title,
        elements: mapped.elements.map(({ ref, ...element }) => element),
        controls: mapped.controls,
    };
}

export function buildSnapshotFromFile(htmlPath, pageUrl, pageTitle, interactionSteps = []) {
    const html = readFileSync(htmlPath, 'utf8');

    return buildSnapshotFromHtml({ html, pageUrl, pageTitle, interactionSteps });
}
