/**
 * Simulate user interactions before mechanical snapshot extraction.
 * Used by snapshot-runner and vet/propose scripts for click-to-reveal fixtures.
 */

function findClickTarget(document, step) {
    if (step.selector) {
        return document.querySelector(step.selector);
    }

    if (step.text) {
        const needle = step.text.toLowerCase();
        const candidates = document.querySelectorAll(
            'button, [role="button"], a, [role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="dialog"]',
        );

        for (const candidate of candidates) {
            const label = (
                candidate.getAttribute('aria-label')
                || candidate.textContent
                || ''
            ).replace(/\s+/g, ' ').trim().toLowerCase();

            if (label.includes(needle)) {
                return candidate;
            }
        }
    }

    return null;
}

function revealControlledPanel(document, trigger, panel) {
    if (!panel) {
        return;
    }

    panel.hidden = false;
    panel.removeAttribute('hidden');
    panel.style.display = 'block';
    panel.style.visibility = 'visible';
    panel.setAttribute('aria-hidden', 'false');

    for (const child of panel.querySelectorAll('[hidden], .hidden, [aria-hidden="true"]')) {
        child.hidden = false;
        child.removeAttribute('hidden');
        child.style.display = '';
        child.setAttribute('aria-hidden', 'false');
    }

    if (trigger?.getAttribute('aria-expanded') !== null) {
        trigger.setAttribute('aria-expanded', 'true');
    }
}

function revealLinkedTarget(document, trigger) {
    const controlsId = trigger.getAttribute('aria-controls');

    if (controlsId) {
        revealControlledPanel(document, trigger, document.getElementById(controlsId));
    }

    const toggleTarget = trigger.dataset.toggle || trigger.dataset.reveal || trigger.dataset.target;

    if (toggleTarget) {
        const panel = toggleTarget.startsWith('#')
            ? document.querySelector(toggleTarget)
            : document.getElementById(toggleTarget) || document.querySelector(toggleTarget);

        revealControlledPanel(document, trigger, panel);
    }
}

function expandListbox(document, trigger) {
    revealLinkedTarget(document, trigger);

    const listboxId = trigger.getAttribute('aria-controls');
    const listbox = listboxId
        ? document.getElementById(listboxId)
        : trigger.parentElement?.querySelector('[role="listbox"]');

    if (listbox) {
        revealControlledPanel(document, trigger, listbox);
    }

    if (trigger.getAttribute('aria-expanded') !== null) {
        trigger.setAttribute('aria-expanded', 'true');
    }
}

function openDialog(document, trigger) {
    revealLinkedTarget(document, trigger);

    const dialogId = trigger.getAttribute('aria-controls');
    const dialog = dialogId
        ? document.getElementById(dialogId)
        : document.querySelector('[role="dialog"], dialog');

    if (dialog) {
        revealControlledPanel(document, trigger, dialog);
        dialog.setAttribute('open', '');
    }
}

/**
 * @param {Window} window
 * @param {Array<{ action: string, selector?: string, text?: string }>} steps
 */
export function applyInteractionSteps(window, steps = []) {
    const { document } = window;

    for (const step of steps) {
        if (step.action === 'click') {
            const target = findClickTarget(document, step);

            if (!target) {
                continue;
            }

            target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

            if (
                target.getAttribute('role') === 'combobox'
                || target.getAttribute('aria-haspopup') === 'listbox'
                || target.classList.contains('custom-dropdown-trigger')
            ) {
                expandListbox(document, target);
            } else if (
                target.getAttribute('aria-haspopup') === 'dialog'
                || target.dataset.openModal !== undefined
                || /add (answer|details|question)|show more|open modal/i.test(target.textContent || '')
            ) {
                openDialog(document, target);
            } else {
                revealLinkedTarget(document, target);
            }
        }
    }
}
