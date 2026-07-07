import { findButtonByText, parseButtonsFromHtml } from './parse-page-buttons.mjs';

/**
 * @param {(action: string, params?: Record<string, unknown>, options?: { timeoutMs?: number }) => Promise<unknown>} sendCommand
 */
export async function runFindButtons(sendCommand, params = {}, timeoutMs) {
    const page = await sendCommand('get_page_html', params, { timeoutMs });
    const html = typeof page?.html === 'string' ? page.html : '';
    const buttons = parseButtonsFromHtml(html);

    return {
        page_url: page?.page_url ?? null,
        page_title: page?.page_title ?? null,
        button_count: buttons.length,
        buttons,
    };
}

/**
 * Inventory click_control first, then parse captured HTML for a selector, then live click_text.
 *
 * @param {(action: string, params?: Record<string, unknown>, options?: { timeoutMs?: number }) => Promise<unknown>} sendCommand
 */
export async function runClickControl(sendCommand, params = {}, timeoutMs) {
    const name = String(params.name || '').trim();

    if (!name) {
        throw new Error('name is required.');
    }

    try {
        const inventoryResult = await sendCommand('click_control_inventory', params, { timeoutMs });

        if (inventoryResult?.success) {
            return {
                ...inventoryResult,
                method: 'inventory_ref',
            };
        }
    } catch {
        // Fall through to HTML / text matching.
    }

    const page = await sendCommand('get_page_html', params, { timeoutMs });
    const html = typeof page?.html === 'string' ? page.html : '';
    const button = findButtonByText(html, name);

    if (button?.selector) {
        const selectorResult = await sendCommand('click_selector', {
            ...params,
            selector: button.selector,
        }, { timeoutMs });

        return {
            ...selectorResult,
            method: 'html_selector',
            button,
        };
    }

    const textResult = await sendCommand('click_text', {
        ...params,
        text: name,
    }, { timeoutMs });

    return {
        ...textResult,
        method: 'live_text',
        button: button || null,
    };
}
