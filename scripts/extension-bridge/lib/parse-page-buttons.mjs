import { JSDOM } from 'jsdom';

const NAVIGATION_LABEL = /\b(continue|next(?:\s+step)?|apply(?:\s+now)?|submit|save(?:\s+and)?\s*continue|proceed|review)\b/i;

function cssEscape(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function elementText(element) {
    return (
        element.getAttribute('aria-label')
        || element.textContent
        || element.getAttribute('value')
        || ''
    ).replace(/\s+/g, ' ').trim();
}

function buildSelector(element) {
    const testId = element.getAttribute('data-testid');

    if (testId) {
        return `[data-testid="${cssEscape(testId)}"]`;
    }

    if (element.id) {
        return `#${cssEscape(element.id)}`;
    }

    const name = element.getAttribute('name');

    if (name && (element.tagName === 'BUTTON' || element.tagName === 'INPUT')) {
        return `${element.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
    }

    return null;
}

/**
 * Parse clickable controls from captured page HTML.
 *
 * @param {string} html
 * @param {{ limit?: number }} options
 */
export function parseButtonsFromHtml(html, { limit = 50 } = {}) {
    if (!html?.trim()) {
        return [];
    }

    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const buttons = [];
    const seen = new Set();

    for (const element of doc.querySelectorAll(
        'button, [role="button"], input[type="submit"], input[type="button"], a[href], a[role="button"]',
    )) {
        const text = elementText(element);

        if (text.length < 2) {
            continue;
        }

        const selector = buildSelector(element);

        if (!selector || seen.has(selector)) {
            continue;
        }

        seen.add(selector);

        buttons.push({
            text,
            tag: element.tagName.toLowerCase(),
            selector,
            data_testid: element.getAttribute('data-testid'),
            id: element.id || null,
            href: element.getAttribute('href'),
            disabled: element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true',
            navigation: NAVIGATION_LABEL.test(text),
        });
    }

    return buttons.slice(0, limit);
}

/**
 * @param {string} html
 * @param {string} needle
 */
export function findButtonByText(html, needle, { preferNavigation = true } = {}) {
    const normalizedNeedle = String(needle || '').trim().toLowerCase();

    if (!normalizedNeedle) {
        return null;
    }

    const buttons = parseButtonsFromHtml(html, { limit: 120 });
    const matches = buttons.filter((button) => {
        if (button.disabled) {
            return false;
        }

        const text = button.text.toLowerCase();

        return text === normalizedNeedle
            || text.includes(normalizedNeedle)
            || normalizedNeedle.includes(text);
    });

    if (matches.length === 0) {
        return null;
    }

    if (preferNavigation) {
        const navigationMatch = matches.find((button) => button.navigation);

        if (navigationMatch) {
            return navigationMatch;
        }
    }

    return matches[0];
}
