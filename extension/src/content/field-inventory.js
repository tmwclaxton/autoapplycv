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
        } else if (target?.getAttribute?.('role') === 'listbox' || target?.getAttribute?.('role') === 'combobox') {
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
            dom,
        });

        return ref;
    }

    function buildDomMetadata(target, roleRadios) {
        let rep = roleRadios?.[0] || target;
        let scope = rep;
        const ashbyEntry = rep?.closest?.('[data-field-path], .ashby-application-form-field-entry');

        if (Array.isArray(target) && target[0]?.tagName?.toLowerCase() === 'button') {
            scope = target[0].closest('[data-field-path], .ashby-application-form-field-entry, .input-row')
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
        } else if (ashbyEntry) {
            scope = ashbyEntry;
        }

        const tag = (rep?.tagName || '').toLowerCase() || null;
        const inputType = rep?.type || rep?.getAttribute?.('type') || null;
        const type = tag === 'input' || tag === 'textarea' || tag === 'select' ? (inputType || null) : null;
        let questionPrefix = null;

        if (typeof AutoCVApplyFormHeuristics !== 'undefined') {
            const label = AutoCVApplyFormHeuristics.getQuestionLabel(rep);
            const match = label.match(/^q(\d+)\./i);

            if (match) {
                questionPrefix = `Q${match[1]}.`;
            }
        }

        return {
            tag,
            type,
            id: scope?.id || rep?.id || null,
            name: rep?.name || rep?.getAttribute?.('name') || scope?.getAttribute?.('name') || null,
            data_testid: scope?.getAttribute?.('data-testid') || rep?.getAttribute?.('data-testid') || null,
            role: (tag === 'input' || tag === 'textarea' || tag === 'select')
                ? (rep?.getAttribute?.('role') || null)
                : (scope?.getAttribute?.('role') || rep?.getAttribute?.('role') || null),
            data_field_path: scope?.getAttribute?.('data-field-path') || null,
            placeholder: rep?.getAttribute?.('placeholder') || null,
            min: rep?.getAttribute?.('min') || null,
            max: rep?.getAttribute?.('max') || null,
            question_prefix: questionPrefix,
        };
    }

    function normalizeContextSnippet(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function getPrecedingSectionTitle(element) {
        const fieldRow = element.closest(
            '.gfield, .form-group, .field, [class*="question"], fieldset, [data-testid^="input-q_"]',
        );
        let cursor = fieldRow?.previousElementSibling || element.parentElement;

        for (let hops = 0; hops < 40 && cursor; hops += 1) {
            const sectionTitle = cursor.querySelector?.(
                '.gsection_title, legend, h2, h3, h4, [class*="section-title"], [class*="sectionTitle"]',
            );
            const titleText = normalizeContextSnippet(
                sectionTitle?.textContent || (
                    /^(H[2-4]|LEGEND)$/i.test(cursor.tagName || '')
                        ? cursor.textContent
                        : ''
                ),
            );

            // Skip empty Gravity Forms section dividers that wipe following context.
            if (titleText.length >= 3 && titleText.length < 120) {
                return titleText;
            }

            if (cursor.classList?.contains('gsection')) {
                cursor = cursor.previousElementSibling;

                continue;
            }

            if (cursor.matches?.('fieldset, section')) {
                const direct = normalizeContextSnippet(cursor.textContent || '').slice(0, 120);

                if (direct.length >= 3) {
                    return direct;
                }
            }

            cursor = cursor.previousElementSibling;
        }

        return null;
    }

    function getContextText(element) {
        const parts = [];
        const sectionTitle = getPrecedingSectionTitle(element);

        if (sectionTitle) {
            parts.push(sectionTitle);
        }

        const container = element.closest(
            'fieldset, [data-testid^="input-q_"], .ia-Questions-item, .form-group, [class*="question"], .gfield',
        );

        if (container) {
            const helper = container.querySelector(
                '.gsection_description, [aria-describedby], .help-text, .helper-text, [class*="description"], p',
            );
            const helperText = normalizeContextSnippet(helper?.textContent || '');

            if (helperText.length >= 8 && helperText.length < 500) {
                parts.push(helperText);
            }

            const legend = normalizeContextSnippet(container.querySelector('legend')?.textContent || '');

            if (legend.length >= 3 && legend.length < 200) {
                parts.push(legend);
            }
        }

        const combined = normalizeContextSnippet(parts.join(' · '));

        return combined.length >= 3 ? combined.slice(0, 500) : null;
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
        const seenNames = new Set();
        const candidates = root.querySelectorAll(
            'button, [role="button"], input[type="submit"], input[type="button"], a[role="button"]',
        );

        for (const element of candidates) {
            if (element.closest('#onetrust-banner-sdk, #onetrust-consent-sdk, #indeed-globalnav')) {
                continue;
            }

            const inFormScope = element.closest(
                'form, [role="form"], .ashby-application-form-container, [class*="application-form"], [class*="jobPostingForm"]',
            );
            const inIndeedApply = element.closest('[class*="mosaic-provider-module-apply"]');

            if (!AutoCVApplyFormHeuristics.frameHasApplicationForm(root) && !inFormScope && !inIndeedApply) {
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

            const dedupeKey = name.toLowerCase();

            if (seenNames.has(dedupeKey)) {
                continue;
            }

            seenNames.add(dedupeKey);

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

    function resolveFieldRequired(anchor) {
        if (!anchor) {
            return false;
        }

        if (anchor.required === true || anchor.getAttribute('aria-required') === 'true') {
            return true;
        }

        if (anchor.closest('[aria-required="true"]')) {
            return true;
        }

        const labelledBy = anchor.getAttribute('aria-labelledby');

        if (labelledBy) {
            const doc = anchor.ownerDocument || document;

            for (const id of labelledBy.split(/\s+/)) {
                const labelEl = doc.getElementById(id);

                if (labelEl?.getAttribute('aria-required') === 'true') {
                    return true;
                }
            }
        }

        return false;
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
                required: resolveFieldRequired(anchor),
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

    function resolveEntryTarget(entry) {
        if (entry.dom || entry.data_field_path) {
            let resolvedFromDom = null;

            AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
                if (resolvedFromDom) {
                    return;
                }

                resolvedFromDom = AutoCVApplyFormHeuristics.resolveTargetFromDom(
                    doc,
                    entry.dom,
                    entry.field_type,
                    entry.data_field_path,
                );
            });

            if (resolvedFromDom) {
                entry.target = resolvedFromDom;
                inventoryLog('debug', 'apply.ref', 'Resolved apply target from DOM metadata', {
                    field_type: entry.field_type,
                    data_field_path: entry.data_field_path,
                    domId: entry.dom?.id || null,
                });

                return resolvedFromDom;
            }
        }

        if (AutoCVApplyFormHeuristics.isTargetConnected(entry.target)) {
            return entry.target;
        }

        let resolved = null;

        AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
            if (resolved) {
                return;
            }

            resolved = AutoCVApplyFormHeuristics.resolveTargetFromDom(
                doc,
                entry.dom,
                entry.field_type,
                entry.data_field_path,
            );
        });

        if (resolved) {
            entry.target = resolved;
            inventoryLog('debug', 'apply.ref', 'Re-resolved stale ref target from DOM metadata', {
                field_type: entry.field_type,
                data_field_path: entry.data_field_path,
                domId: entry.dom?.id || null,
            });
        }

        return resolved || entry.target;
    }

    function resolveApplyEntry(ref, options = {}) {
        const registryEntry = refRegistry.get(ref);
        const dom = options.dom || registryEntry?.dom || null;
        const fieldType = options.field_type || registryEntry?.field_type || 'text';
        const dataFieldPath = options.data_field_path || dom?.data_field_path || registryEntry?.data_field_path || null;

        if (registryEntry || dom || dataFieldPath || options.field_type) {
            return {
                target: registryEntry?.target ?? null,
                field_type: fieldType,
                data_field_path: dataFieldPath,
                dom,
            };
        }

        return null;
    }

    function getRefEntry(ref) {
        return refRegistry.get(ref) || null;
    }

    async function applyAnswerByRef(root, ref, answer, options = {}) {
        const entry = resolveApplyEntry(ref, options);

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
            hydratedFromDom: !refRegistry.has(ref),
        });

        const target = resolveEntryTarget(entry);

        if (!target) {
            inventoryLog('warn', 'apply.ref', 'applyAnswerByRef - could not resolve target', {
                ref,
                field_type: entry.field_type,
                data_field_path: entry.data_field_path,
            });

            return false;
        }

        return AutoCVApplyFormHeuristics.applyAnswerForTarget(
            root,
            target,
            entry.field_type,
            answer,
            {
                data_field_path: entry.data_field_path,
                root,
            },
        );
    }

    async function applyAnswerByRefAllFrames(root, ref, answer, options = {}) {
        let applied = false;
        const entry = resolveApplyEntry(ref, options);

        if (!entry || !answer) {
            inventoryLog('warn', 'apply.ref', 'applyAnswerByRefAllFrames - ref not in registry', { ref });

            return false;
        }

        const documents = [];
        AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
            documents.push(doc);
        });

        for (const doc of documents) {
            const target = AutoCVApplyFormHeuristics.resolveTargetFromDom(
                doc,
                entry.dom,
                entry.field_type,
                entry.data_field_path,
            );

            if (!target) {
                continue;
            }

            inventoryLog('debug', 'apply.ref', 'applyAnswerByRefAllFrames trying document', {
                ref,
                field_type: entry.field_type,
                data_field_path: entry.data_field_path,
            });

            if (await AutoCVApplyFormHeuristics.applyAnswerForTarget(
                doc,
                target,
                entry.field_type,
                answer,
                {
                    data_field_path: entry.data_field_path,
                    root: doc,
                },
            )) {
                inventoryLog('info', 'apply.ref', 'applyAnswerByRefAllFrames succeeded', { ref });
                applied = true;
                break;
            }
        }

        if (!applied) {
            inventoryLog('warn', 'apply.ref', 'applyAnswerByRefAllFrames failed across frames', { ref });
        }

        return applied;
    }

    async function applyAnswerByRefWithFallback(root, ref, answer, options = {}) {
        if (await applyAnswerByRef(root, ref, answer, options)) {
            return true;
        }

        return applyAnswerByRefAllFrames(root, ref, answer, options);
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

    function elementMatchesDraftTarget(element, target, roleRadios) {
        if (!element || !target) {
            return false;
        }

        if (element === target) {
            return true;
        }

        if (Array.isArray(target)) {
            return target.some((node) => node === element || node?.contains?.(element));
        }

        if (roleRadios?.some?.((node) => node === element)) {
            return true;
        }

        return Boolean(target.contains?.(element));
    }

    function findRefForElement(element) {
        if (!element) {
            return null;
        }

        for (const [ref, entry] of refRegistry.entries()) {
            if (elementMatchesDraftTarget(element, entry.target, null)) {
                return ref;
            }
        }

        return null;
    }

    function registerValidationField(element) {
        if (!element) {
            return null;
        }

        const existing = findRefForElement(element);

        if (existing) {
            return existing;
        }

        if (element.type === 'radio' || element.type === 'checkbox') {
            const group = element.closest('fieldset, [role="radiogroup"], [role="group"], .gfield');
            const groupInputs = group
                ? [...group.querySelectorAll(`input[type="${element.type}"]`)]
                    .filter((input) => !element.name || input.name === element.name)
                : [element];

            return registerTarget(groupInputs.length ? groupInputs : element, groupInputs);
        }

        return registerTarget(element, null);
    }

    function resolveDraftableFieldForElement(root, element, profilePayload, settings, memo = {}) {
        const profile = profilePayload?.profile;

        if (!element || !profile) {
            return null;
        }

        let resolved = null;

        AutoCVApplyFormHeuristics.eachDraftableField(root, profile, settings, memo, (field, target, roleRadios) => {
            if (resolved) {
                return;
            }

            if (!elementMatchesDraftTarget(element, target, roleRadios)) {
                return;
            }

            const dom = buildDomMetadata(target, roleRadios);

            resolved = {
                label: field.label,
                field_type: field.field_type,
                max_chars: field.max_chars,
                options: field.options,
                dom,
                data_field_path: dom.data_field_path,
                updated_at: Date.now(),
            };
        });

        return resolved;
    }

    return {
        buildSnapshot,
        buildSnapshotAllFrames,
        applyAnswerByRef,
        applyAnswerByRefAllFrames,
        applyAnswerByRefWithFallback,
        clickRef,
        clickRefAllFrames,
        elementMatchesDraftTarget,
        fieldsFromInventory,
        getRefEntry,
        findRefForElement,
        registerValidationField,
        resetRegistry,
        resolveDraftableFieldForElement,
    };
})();
