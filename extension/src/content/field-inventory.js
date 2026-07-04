/**
 * Stagehand-style field inventory: stable refs, page snapshots, ref-based fill.
 */
const AutoCVApplyFieldInventory = (() => {
    const refRegistry = new Map();
    const controlRegistry = new Map();

    function resetRegistry() {
        refRegistry.clear();
        controlRegistry.clear();
    }

    function registerTarget(target) {
        const ref = `f${refRegistry.size}`;
        let fieldType;

        if (Array.isArray(target)) {
            fieldType = target[0]?.getAttribute?.('role') === 'checkbox' ? 'checkbox' : 'radio';
        } else if (target?.getAttribute?.('role') === 'listbox') {
            fieldType = 'select';
        } else {
            fieldType = target.type === 'radio' || target.type === 'checkbox'
                ? target.type
                : AutoCVApplyFormHeuristics.getFieldType(target);
        }

        refRegistry.set(ref, {
            target,
            field_type: fieldType,
        });

        return ref;
    }

    function buildDomMetadata(target, roleRadios) {
        let rep = roleRadios?.[0] || target;
        let scope = rep;

        if (roleRadios?.length) {
            const repRole = roleRadios[0]?.getAttribute?.('role');

            if (repRole === 'radio') {
                scope = rep.closest('[role="radiogroup"]') || rep;
            } else if (repRole === 'checkbox') {
                scope = rep.closest('[role="group"], fieldset, [role="radiogroup"]') || rep;
            }
        } else if (target?.getAttribute?.('role') === 'listbox') {
            scope = target;
            rep = target.querySelector('[role="option"]') || target;
        } else if (target?.type === 'radio' || target?.type === 'checkbox') {
            scope = target.closest('fieldset, [role="radiogroup"], [role="group"]') || target;
        }

        const tag = (rep?.tagName || '').toLowerCase() || null;
        const inputType = rep?.type || rep?.getAttribute?.('type') || null;
        const type = tag === 'input' || tag === 'textarea' || tag === 'select' ? (inputType || null) : null;

        return {
            tag,
            type,
            id: scope?.id || rep?.id || null,
            name: rep?.name || rep?.getAttribute?.('name') || scope?.getAttribute?.('name') || null,
            data_testid: scope?.getAttribute?.('data-testid') || rep?.getAttribute?.('data-testid') || null,
            role: scope?.getAttribute?.('role') || rep?.getAttribute?.('role') || null,
        };
    }

    function getContextText(element) {
        const container = element.closest(
            'fieldset, [data-testid^="input-q_"], .ia-Questions-item, .form-group, [class*="question"]',
        );

        if (!container) {
            return null;
        }

        const helper = container.querySelector(
            '[aria-describedby], .help-text, .helper-text, [class*="description"], p',
        );

        if (!helper) {
            return null;
        }

        const text = helper.textContent.replace(/\s+/g, ' ').trim();

        return text.length > 8 && text.length < 500 ? text : null;
    }

    function collectNavigationControls(root) {
        const controls = [];
        const candidates = root.querySelectorAll(
            'button, [role="button"], input[type="submit"], input[type="button"], a[role="button"]',
        );

        for (const element of candidates) {
            if (!AutoCVApplyFormHeuristics.frameHasApplicationForm
                && !element.closest('form, [role="form"]')) {
                continue;
            }

            const name = (
                element.getAttribute('aria-label')
                || element.textContent
                || element.value
                || ''
            ).replace(/\s+/g, ' ').trim();

            if (name.length < 3) {
                continue;
            }

            if (!/(continue|next|save|proceed|submit application|review)/i.test(name)) {
                continue;
            }

            if (element.disabled) {
                continue;
            }

            controls.push({
                ref: (() => {
                    const ref = `c${controlRegistry.size}`;
                    controlRegistry.set(ref, element);

                    return ref;
                })(),
                role: 'button',
                name,
            });
        }

        return controls.slice(0, 8);
    }

    function appendSnapshotFromRoot(root, profile, settings, memo, merged) {
        AutoCVApplyFormHeuristics.eachDraftableField(root, profile, settings, memo, (field, target, roleRadios) => {
            const anchor = roleRadios?.[0] || target;
            const ref = registerTarget(roleRadios || target);

            merged.elements.push({
                ref,
                question: field.label,
                field_type: field.field_type,
                max_chars: field.max_chars,
                options: field.options,
                required: anchor?.required === true || anchor?.getAttribute('aria-required') === 'true',
                context: anchor ? getContextText(anchor) : null,
                dom: buildDomMetadata(target, roleRadios),
            });
        });

        merged.controls.push(...collectNavigationControls(root));
    }

    function buildSnapshot(root, profile, settings, memo = {}) {
        resetRegistry();

        const snapshot = {
            page_url: window.location.href.split('?')[0],
            page_title: document.title || '',
            elements: [],
            controls: [],
        };

        appendSnapshotFromRoot(root, profile, settings, memo, snapshot);

        return snapshot;
    }

    function buildSnapshotAllFrames(root, profile, settings, memo = {}) {
        resetRegistry();

        const merged = {
            page_url: window.location.href.split('?')[0],
            page_title: document.title || '',
            elements: [],
            controls: [],
        };

        AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
            appendSnapshotFromRoot(doc, profile, settings, memo, merged);
        });

        return merged;
    }

    function applyAnswerByRef(root, ref, answer) {
        const entry = refRegistry.get(ref);

        if (!entry || !answer) {
            return false;
        }

        return AutoCVApplyFormHeuristics.applyAnswerForTarget(
            root,
            entry.target,
            entry.field_type,
            answer,
        );
    }

    function applyAnswerByRefAllFrames(root, ref, answer) {
        let applied = false;

        AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
            if (applyAnswerByRef(doc, ref, answer)) {
                applied = true;
            }
        });

        return applied;
    }

    function clickRef(root, ref) {
        const control = controlRegistry.get(ref);

        if (control && typeof control.click === 'function') {
            control.click();

            return true;
        }

        const entry = refRegistry.get(ref);

        if (!entry) {
            return false;
        }

        const element = Array.isArray(entry.target) ? entry.target[0] : entry.target;

        if (!element || typeof element.click !== 'function') {
            return false;
        }

        element.click();

        return true;
    }

    function clickRefAllFrames(root, ref) {
        let clicked = false;

        AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
            if (clickRef(doc, ref)) {
                clicked = true;
            }
        });

        return clicked;
    }

    function fieldsFromInventory(inventoryFields) {
        return (inventoryFields || []).map((field, index) => ({
            id: index,
            ref: field.ref,
            label: field.question || field.label,
            field_type: field.field_type || 'text',
            max_chars: field.max_chars,
            options: field.options,
        }));
    }

    return {
        buildSnapshot,
        buildSnapshotAllFrames,
        applyAnswerByRef,
        applyAnswerByRefAllFrames,
        clickRef,
        clickRefAllFrames,
        fieldsFromInventory,
        resetRegistry,
    };
})();
