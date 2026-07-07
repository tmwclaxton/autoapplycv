import { JSDOM } from 'jsdom';

const MAX_LISTBOX_OPTIONS = 3;

/**
 * Remove scripts, styles, and other head noise that bloat scraped pages but do not
 * affect mechanical form extraction in JSDOM.
 *
 * @param {string} html
 * @returns {string}
 */
export function stripFixtureNoise(html) {
    return String(html || '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<link\b[^>]*>/gi, '')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * @param {Document} document
 */
function trimFixtureChrome(document) {
    for (const element of document.querySelectorAll('iframe, object, embed')) {
        element.remove();
    }

    for (const input of document.querySelectorAll('input, textarea')) {
        const label = `${input.getAttribute('aria-label') || ''} ${input.getAttribute('name') || ''} ${input.getAttribute('placeholder') || ''}`;

        if (
            input.hasAttribute('hidden')
            || input.type === 'hidden'
            || /leave this blank|honeypot/i.test(label)
            || input.getAttribute('name') === 'age'
        ) {
            const field = input.closest('[class*="mosaic-provider-module-apply"] [class*="1a5c5o6"]')
                || input.closest('label')?.parentElement
                || input.parentElement;

            field?.remove();
        }
    }
}

/**
 * @param {Document} document
 */
function trimListboxOptions(document) {
    for (const listbox of document.querySelectorAll('[role="listbox"]')) {
        const options = listbox.querySelectorAll('[role="option"]');

        for (let index = MAX_LISTBOX_OPTIONS; index < options.length; index += 1) {
            options[index].remove();
        }
    }
}

/**
 * @param {Document} document
 * @returns {Element | null}
 */
function findApplyModuleRoot(document) {
    const modules = [...document.querySelectorAll('[id^="mosaic-provider-module-apply-"]')];

    for (const module of modules) {
        if (module.querySelector('input, textarea, select, [role="combobox"], [role="radiogroup"], [role="radio"], button')) {
            return module;
        }
    }

    const pageRoot = document.querySelector('[data-testid$="-page"]');

    if (pageRoot) {
        return pageRoot.closest('[class*="mosaic-provider-module-apply"]') || pageRoot;
    }

    return document.querySelector('#ia-container form, #ia-container [role="form"], #ia-container');
}

/**
 * @param {Document} document
 * @returns {string}
 */
function resolveFixtureTitle(document) {
    const heading = document.querySelector('[data-testid$="-heading"]');

    if (heading?.textContent?.trim()) {
        return heading.textContent.replace(/\s+/g, ' ').trim();
    }

    return document.title?.replace(/\s+/g, ' ').trim() || 'Job application';
}

/**
 * @param {string} title
 * @param {string} bodyHtml
 * @returns {string}
 */
export function wrapFixtureShell(title, bodyHtml) {
    const safeTitle = String(title || 'Job application')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
</head>
<body>
<form>
${bodyHtml}
</form>
</body>
</html>
`;
}

/**
 * Shrink scraped HTML down to the apply module shell used by form extraction tests.
 *
 * @param {string} html
 * @param {{ pageTitle?: string }} [options]
 * @returns {string}
 */
export function minifyHtmlFixture(html, options = {}) {
    const cleaned = stripFixtureNoise(html);
    const dom = new JSDOM(cleaned);
    const { document } = dom.window;

    trimListboxOptions(document);
    trimFixtureChrome(document);

    const moduleRoot = findApplyModuleRoot(document);
    const title = options.pageTitle || resolveFixtureTitle(document);
    const bodyHtml = moduleRoot?.outerHTML?.trim() || document.body?.innerHTML?.trim() || cleaned.trim();

    return wrapFixtureShell(title, bodyHtml);
}
