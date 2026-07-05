/**
 * Stagehand-style field inventory: stable refs, page snapshots, ref-based fill.
 */
const AutoCVApplyFieldInventory = (() => {
    function inventoryLog(level, phase, message, data) {
        if (typeof AutoCVApplyDebugLog === 'undefined') {
            return;
        }

        const logger = AutoCVApplyDebugLog[`log${level.charAt(0).toUpperCase()}${level.slice(1)}`];

        if (typeof logger === 'function') {
            logger('content', phase, message, data);
        }
    }

    const refRegistry = new Map();
    const controlRegistry = new Map();

    function resetRegistry() {
        refRegistry.clear();
        controlRegistry.clear();
    }

    function registerTarget(target, roleRadios) {
        const ref = `f${refRegistry.size}`;
        const dom = buildDomMetadata(target, roleRadios);
        let fieldType;

        if (Array.isArray(target)) {
            if (target[0]?.tagName?.toLowerCase() === 'button') {
                fieldType = 'radio';
            } else {
                fieldType = target[0]?.getAttribute?.('role') === 'checkbox' ? 'checkbox' : 'radio';
            }
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
            data_field_path: dom.data_field_path,
        });

        return ref;
    }

    function buildDomMetadata(target, roleRadios) {
        let rep = roleRadios?.[0] || target;
        let scope = rep;

        if (Array.isArray(target) && target[0]?.tagName?.toLowerCase() === 'button') {
            scope = target[0].closest('[data-field-path], .ashby-application-form-field-entry')
                || target[0].closest('[class*="_yesno_"]')
                || target[0];
            rep = target[0];
        } else if (roleRadios?.length) {
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
            scope = target.closest('fieldset, [role="radiogroup"], [role="group"], [data-field-path], .ashby-application-form-field-entry') || target;
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
            data_field_path: scope?.getAttribute?.('data-field-path') || null,
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

    function isFinalSubmitLabel(name) {
        return /\b(submit\s+(?:application|app)|apply\s+now|send\s+(?:application|app))\b/i.test(name);
    }

    function isStepNavigationLabel(name) {
        if (isFinalSubmitLabel(name)) {
            return false;
        }

        return /\b(continue|next(?:\s+step)?|save(?:\s+and|\s*&)\s*continue|proceed|review(?:\s+(?:application|and\s+submit))?)\b/i.test(name);
    }

    function collectNavigationControls(root) {
        const controls = [];
        const candidates = root.querySelectorAll(
            'button, [role="button"], input[type="submit"], input[type="button"], a[role="button"]',
        );

        for (const element of candidates) {
            const inFormScope = element.closest(
                'form, [role="form"], .ashby-application-form-container, [class*="application-form"], [class*="jobPostingForm"]',
            );

            if (!AutoCVApplyFormHeuristics.frameHasApplicationForm(root) && !inFormScope) {
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

            if (!isStepNavigationLabel(name)) {
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
            const ref = registerTarget(target, roleRadios);

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

        inventoryLog('info', 'snapshot.build', 'buildSnapshotAllFrames complete', {
            elementCount: merged.elements.length,
            controlCount: merged.controls.length,
        });

        return merged;
    }

    async function applyAnswerByRef(root, ref, answer) {
        const entry = refRegistry.get(ref);

        if (!entry || !answer) {
            inventoryLog('warn', 'apply.ref', 'applyAnswerByRef - ref not in registry', {
                ref,
                hasEntry: Boolean(entry),
            });

            return false;
        }

        inventoryLog('debug', 'apply.ref', 'applyAnswerByRef', {
            ref,
            field_type: entry.field_type,
            answerPreview: String(answer).slice(0, 80),
        });

        return AutoCVApplyFormHeuristics.applyAnswerForTarget(
            root,
            entry.target,
            entry.field_type,
            answer,
            { data_field_path: entry.data_field_path },
        );
    }

    async function applyAnswerByRefAllFrames(root, ref, answer) {
        const documents = [];
        let applied = false;
        const entry = refRegistry.get(ref);

        AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
            documents.push(doc);
        });

        for (const doc of documents) {
            if (!entry || !answer) {
                continue;
            }

            inventoryLog('debug', 'apply.ref', 'applyAnswerByRefAllFrames trying document', {
                ref,
                field_type: entry.field_type,
                data_field_path: entry.data_field_path,
            });

            if (await AutoCVApplyFormHeuristics.applyAnswerForTarget(
                doc,
                entry.target,
                entry.field_type,
                answer,
                { data_field_path: entry.data_field_path },
            )) {
                inventoryLog('info', 'apply.ref', 'applyAnswerByRefAllFrames succeeded', { ref });
                applied = true;
            }
        }

        if (!applied) {
            inventoryLog('warn', 'apply.ref', 'applyAnswerByRefAllFrames failed across frames', { ref });
        }

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
