import { bridgeCommand } from '../../extension-bridge/lib/bridge-http.mjs';
import { evaluateBridgeAcceptGate } from './bridge-field-gate.mjs';

export const CONSENT_ACCEPT_PATTERN =
    /^(accept(?:\s+all)?(?:\s+cookies)?|allow(?:\s+all)?|agree(?:\s+and\s+continue)?|i\s+agree|got\s+it|ok(?:ay)?)$/i;

export const CONSENT_HINT_PATTERN = /cookie|consent|privacy/i;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Array<{ text?: string, disabled?: boolean }>} buttons
 * @returns {{ text: string } | null}
 */
export function findConsentAcceptButton(buttons = []) {
    for (const button of buttons) {
        if (button.disabled) {
            continue;
        }

        const text = String(button.text || '').trim();

        if (!text) {
            continue;
        }

        if (CONSENT_ACCEPT_PATTERN.test(text)) {
            return button;
        }

        if (
            CONSENT_HINT_PATTERN.test(text) &&
            /\b(accept|allow|agree)\b/i.test(text)
        ) {
            return button;
        }
    }

    return null;
}

/**
 * @param {number} tabId
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
export async function tryDismissConsent(tabId, timeoutMs) {
    const buttonsResult = await bridgeCommand(
        'find_buttons',
        { tabId },
        { timeoutMs },
    );
    const consent = findConsentAcceptButton(buttonsResult?.buttons || []);

    if (!consent?.text) {
        return false;
    }

    await bridgeCommand(
        'click_control',
        { tabId, name: consent.text },
        { timeoutMs },
    );

    return true;
}

/**
 * Poll field inventory until the accept gate passes or hydration times out.
 *
 * @param {number} tabId
 * @param {{ minFields?: number, pollIntervalMs?: number, hydrateTimeoutMs?: number, timeoutMs?: number, dismissConsent?: boolean }} [options]
 */
export async function pollBridgeFieldInventory(tabId, options = {}) {
    const minFields = options.minFields ?? 2;
    const pollIntervalMs = options.pollIntervalMs ?? 2500;
    const hydrateTimeoutMs = options.hydrateTimeoutMs ?? 30000;
    const timeoutMs = options.timeoutMs ?? 90000;
    const dismissConsent = options.dismissConsent ?? true;
    const deadline = Date.now() + hydrateTimeoutMs;
    let consentTried = false;
    let consentClicked = false;
    let lastInventory = { elements: [] };
    let lastGate = evaluateBridgeAcceptGate(lastInventory, { minFields });

    while (Date.now() < deadline) {
        if (dismissConsent && !consentTried) {
            consentTried = true;

            try {
                consentClicked = await tryDismissConsent(tabId, timeoutMs);

                if (consentClicked) {
                    await sleep(1500);
                }
            } catch {
                // Consent dismissal is best-effort.
            }
        }

        lastInventory = await bridgeCommand(
            'get_field_inventory',
            { tabId },
            { timeoutMs },
        );
        lastGate = evaluateBridgeAcceptGate(lastInventory, { minFields });

        if (lastGate.accepted) {
            return {
                inventory: lastInventory,
                gate: lastGate,
                consentClicked,
            };
        }

        const remainingMs = deadline - Date.now();

        if (remainingMs <= 0) {
            break;
        }

        await sleep(Math.min(pollIntervalMs, remainingMs));
    }

    return {
        inventory: lastInventory,
        gate: lastGate,
        consentClicked,
    };
}
