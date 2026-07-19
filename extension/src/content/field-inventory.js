/**
 * Stagehand-style field inventory: stable refs, page snapshots, ref-based fill.
 * Pairs with form-heuristics.js (fill) under extension/src/content/form/ as inventory grows.
 */
var AutoCVApplyFieldInventory = (() => {
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
        } else if (
            target?.tagName?.toLowerCase() === 'button'
            && target?.getAttribute?.('aria-haspopup') === 'listbox'
        ) {
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

    function findSrDataTest(element) {
        let current = element;

        while (current) {
            const match = current.closest?.('[data-test^="personal-info-"]');

            if (match?.getAttribute?.('data-test')) {
                return match.getAttribute('data-test');
            }

            const root = current.getRootNode?.();

            if (root instanceof ShadowRoot && root.host) {
                current = root.host;
                continue;
            }

            break;
        }

        return null;
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
            scope = (typeof AutoCVApplyFormHeuristics?.getChoiceGroupScope === 'function'
                ? AutoCVApplyFormHeuristics.getChoiceGroupScope(target)
                : null)
                || target.closest(
                    'fieldset, [role="radiogroup"], [role="group"], [data-field-path], .ashby-application-form-field-entry, .application-field, .gfield',
                )
                || target;
        } else if (Array.isArray(target) && target[0]?.type) {
            const rep = target[0];
            scope = (typeof AutoCVApplyFormHeuristics?.getChoiceGroupScope === 'function'
                ? AutoCVApplyFormHeuristics.getChoiceGroupScope(rep)
                : null)
                || rep.closest(
                    'fieldset, [role="radiogroup"], [role="group"], [data-field-path], .ashby-application-form-field-entry, .application-field, .gfield',
                )
                || rep;
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

        const srHost = rep?.closest?.(
            '[data-test^="personal-info-"], spl-phone-field, oc-phone-number, oc-location-autocomplete, spl-form-field, oc-input',
        );
        const srDataTest = findSrDataTest(rep)
            || srHost?.closest?.('[data-test]')?.getAttribute?.('data-test')
            || srHost?.getAttribute?.('data-test')
            || null;

        return {
            tag,
            type,
            id: scope?.id || rep?.id || null,
            name: rep?.name || rep?.getAttribute?.('name') || scope?.getAttribute?.('name') || null,
            data_testid: scope?.getAttribute?.('data-testid') || rep?.getAttribute?.('data-testid') || null,
            sr_data_test: srDataTest,
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

    function getJobPostingLocationFromPage(doc = document) {
        const locationEl = doc.querySelector('.job__location, [class*="job-location"], [data-qa="job-location"]');
        const domText = normalizeContextSnippet(locationEl?.textContent || '');

        if (domText.length >= 3 && domText.length <= 200) {
            return domText;
        }

        for (const script of doc.querySelectorAll('script:not([src])')) {
            const text = script.textContent || '';
            const scriptMatch = text.match(/job_post_location["\s:\\]+([^"\\,\}]{3,200})/);

            if (scriptMatch?.[1]) {
                return scriptMatch[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').slice(0, 200);
            }
        }

        const html = doc.documentElement?.innerHTML || '';

        for (const pattern of [
            /job_post_location\\":\\"([^"\\]+)\\"/,
            /job_post_location":"([^"]+)"/,
            /"job_post_location":"([^"]+)"/,
        ]) {
            const match = html.match(pattern);

            if (match?.[1]) {
                return match[1].slice(0, 200);
            }
        }

        const bodyText = doc.body?.innerText || '';
        const structuredUsMatch = bodyText.match(
            /\b([A-Za-z][A-Za-z\s.'-]+,\s*[A-Z]{2},\s*United States(?: of America)?)/,
        );

        if (structuredUsMatch?.[1]) {
            return structuredUsMatch[1].trim().slice(0, 200);
        }

        const structuredUkMatch = bodyText.match(
            /\b([A-Za-z][A-Za-z\s.'-]+,\s*(?:England|Scotland|Wales),\s*United Kingdom)/,
        );

        if (structuredUkMatch?.[1]) {
            return structuredUkMatch[1].trim().slice(0, 200);
        }

        if (/\bunited states armed forces\b/i.test(bodyText)) {
            return 'United States';
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
            'fieldset, [data-testid^="input-q_"], .ia-Questions-item, .form-group, [class*="question"], .gfield, .ashby-application-form-field-entry, [data-field-path]',
        );

        if (container) {
            // Prefer explicit helper/description blocks (Ashby culture-values essays
            // put Connect/Challenge/Own here) over a random nested <p>.
            const helper =
                container.querySelector(
                    '.ashby-application-form-question-description, .gsection_description, .help-text, .helper-text, [class*="question-description"], [class*="_description_"]',
                ) ||
                container.querySelector(
                    '[aria-describedby], [class*="description"], p',
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

        if (typeof AutoCVApplyFormHeuristics?.isInactiveConditionalField === 'function'
            && AutoCVApplyFormHeuristics.isInactiveConditionalField(anchor)) {
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

        // Softgarden / Wicket: required marker is <label>...<em>*</em></label>, not HTML required.
        const doc = anchor.ownerDocument || document;
        const id = anchor.id;

        if (id && doc.querySelector) {
            const escapedId = typeof CSS !== 'undefined' && CSS.escape
                ? CSS.escape(id)
                : id.replace(/"/g, '\\"');
            const explicitLabel = doc.querySelector(`label[for="${escapedId}"]`);

            if (explicitLabel) {
                const marker = (explicitLabel.textContent || '').replace(/\s+/g, ' ');

                if (/\*/.test(marker) || explicitLabel.querySelector('em')?.textContent?.includes('*')) {
                    return true;
                }
            }
        }

        // Teamtailor and similar: question title includes "*Required" beside the control.
        const questionRoot = anchor.closest(
            'fieldset, [class*="question"], [class*="Question"], [data-question], .form-group',
        );

        if (questionRoot) {
            const heading = (questionRoot.querySelector('label, legend, h1, h2, h3, h4, p, span')?.textContent
                || questionRoot.textContent
                || '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 180);

            if (/\*\s*required\b|\brequired\s*\*/i.test(heading) || /\S\*\s*required\b/i.test(heading)) {
                return true;
            }
        }

        return false;
    }

    function appendSnapshotFromRoot(root, profile, settings, memo, merged, jobPostingLocation = null) {
        // Inventory must surface every application question, including already-filled
        // ones - Draft All still uses eachDraftableField without includeFilled.
        AutoCVApplyFormHeuristics.eachDraftableField(
            root,
            profile,
            settings,
            memo,
            (field, target, roleRadios) => {
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
                    job_posting_location: jobPostingLocation,
                    dom: buildDomMetadata(target, roleRadios),
                });
            },
            { includeFilled: true },
        );

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
        const jobPostingLocation = getJobPostingLocationFromPage(root.ownerDocument || document);

        appendSnapshotFromRoot(root, profile, settings, memo, snapshot, jobPostingLocation);

        return snapshot;
    }

    async function enrichSnapshotOptions(elements) {
        if (typeof AutoCVApplyFormHeuristics?.harvestLazyComboboxOptionLabels !== 'function') {
            return elements;
        }

        // Greenhouse location/phone-country menus are already skipped inside
        // harvestLazyComboboxOptionLabels. Keep a hard per-harvest cap so a stuck
        // react-select open cannot block BUILD_FIELD_SNAPSHOT past Draft All's
        // 45s timeout (live Ripple embed). Still harvest Yes/No screeners so
        // type-coherence does not reject profile No as yes_no_on_choice.
        const MAX_LAZY_HARVESTS = 24;
        const harvestDeadlineMs = Date.now() + 8_000;
        const PER_HARVEST_TIMEOUT_MS = 1_500;
        let harvestCount = 0;

        for (const element of elements || []) {
            if (Date.now() > harvestDeadlineMs) {
                break;
            }

            if (!['select', 'radio'].includes(element.field_type)) {
                continue;
            }

            if (Array.isArray(element.options) && element.options.length >= 2) {
                continue;
            }

            const entry = refRegistry.get(element.ref);
            const target = entry?.target;
            const anchor = Array.isArray(target) ? target[0] : target;

            if (!anchor || anchor.getAttribute?.('role') !== 'combobox') {
                continue;
            }

            if (harvestCount >= MAX_LAZY_HARVESTS) {
                break;
            }

            harvestCount += 1;

            let labels = [];

            try {
                labels = await Promise.race([
                    AutoCVApplyFormHeuristics.harvestLazyComboboxOptionLabels(anchor),
                    new Promise((resolve) => {
                        setTimeout(() => resolve([]), PER_HARVEST_TIMEOUT_MS);
                    }),
                ]);
            } catch {
                labels = [];
            }

            if (labels.length >= 2) {
                element.options = labels;
            }
        }

        inventoryLog('info', 'snapshot.options', 'Lazy combobox option harvest complete', {
            harvestCount,
            withOptions: (elements || []).filter((element) => Array.isArray(element.options) && element.options.length >= 2).length,
        });

        return elements;
    }

    function resolveLinkedInEasyApplyInventoryRoot() {
        const linkedInApi = typeof AutoCVApplyLinkedInAutoApply !== 'undefined'
            ? AutoCVApplyLinkedInAutoApply
            : (typeof window !== 'undefined' ? window.AutoCVApplyLinkedInAutoApply : null);

        if (typeof linkedInApi?.readEasyApplyModal !== 'function') {
            return null;
        }

        try {
            return linkedInApi.readEasyApplyModal() || null;
        } catch {
            return null;
        }
    }

    function isLinkedInJobsApplySurfaceLocation() {
        try {
            const host = window.location.hostname.replace(/^www\./, '');
            const path = window.location.pathname || '';

            return host === 'linkedin.com'
                && (path.startsWith('/jobs/search') || path.startsWith('/jobs/view/'));
        } catch {
            return false;
        }
    }

    /**
     * New LinkedIn /jobs/search-results/ UI uses hashed classes + JobDetails_* ids
     * instead of .jobs-search__job-details. Walk up to the pane that owns those sections.
     */
    function resolveLinkedInJobDetailsPaneFromSection(section) {
        if (!(section instanceof Element)) {
            return null;
        }

        let node = section;

        for (let depth = 0; depth < 10 && node; depth += 1) {
            const parent = node.parentElement;

            if (!parent) {
                break;
            }

            const detailCount = parent.querySelectorAll('[id^="JobDetails_"]').length;

            if (detailCount >= 2) {
                return parent;
            }

            if (parent.querySelector?.('[aria-label*="Easy Apply"], [aria-label*="easy apply"]')) {
                return parent;
            }

            node = parent;
        }

        return section;
    }

    function resolveLinkedInJobDetailInventoryRoot() {
        const selectors = [
            '.jobs-search__job-details--container',
            '.jobs-search__job-details',
            '.jobs-details__main-content',
            '.jobs-details',
            '.job-view-layout',
            '#job-details',
            // LinkedIn 2026 search-results two-pane UI
            '[id^="JobDetails_AboutTheJob_"]',
            '[componentkey^="JobDetails_AboutTheJob_"]',
            '[id^="JobDetails_"]',
            '[componentkey^="JobDetails_"]',
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);

            if (!element) {
                continue;
            }

            if (/JobDetails_/i.test(selector)) {
                return resolveLinkedInJobDetailsPaneFromSection(element) || element;
            }

            return element;
        }

        return null;
    }

    /**
     * Mechanical highlight scope - same rules as Draft All inventory.
     * Easy Apply modal > LinkedIn job detail > full document.
     * Returns null on LinkedIn SERP/view when there is no job-detail pane
     * (avoids outlining search filter checkboxes).
     */
    function resolveHighlightRoot() {
        const easyApplyModal = resolveLinkedInEasyApplyInventoryRoot();

        if (easyApplyModal) {
            return easyApplyModal;
        }

        if (isLinkedInJobsApplySurfaceLocation()) {
            return resolveLinkedInJobDetailInventoryRoot();
        }

        return document;
    }

    function appendSnapshotFromRootIncludingSameOriginFrames(root, profile, settings, memo, merged, jobPostingLocation) {
        appendSnapshotFromRoot(root, profile, settings, memo, merged, jobPostingLocation);

        if (!root || typeof root.querySelectorAll !== 'function') {
            return;
        }

        for (const iframe of root.querySelectorAll('iframe')) {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;

                if (doc) {
                    appendSnapshotFromRoot(doc, profile, settings, memo, merged, jobPostingLocation);
                }
            } catch {
                // Cross-origin iframe - skip.
            }
        }
    }

    function buildSnapshotAllFrames(root, profile, settings, memo = {}) {
        resetRegistry();

        const merged = {
            page_url: window.location.href.split('?')[0],
            page_title: document.title || '',
            elements: [],
            controls: [],
        };

        const jobPostingLocation = getJobPostingLocationFromPage(document);
        const easyApplyModal = resolveLinkedInEasyApplyInventoryRoot();

        // When Easy Apply is open, only inventory the modal - never SERP filters / tracker frames.
        if (easyApplyModal) {
            appendSnapshotFromRoot(easyApplyModal, profile, settings, memo, merged, jobPostingLocation);
            inventoryLog('info', 'snapshot.build', 'buildSnapshotAllFrames scoped to Easy Apply modal', {
                elementCount: merged.elements.length,
                controlCount: merged.controls.length,
            });

            return merged;
        }

        // LinkedIn jobs SERP/view without modal: job detail / apply regions only.
        // Never walk the full document + tracker iframes (that was ~45s of filter checkboxes).
        if (isLinkedInJobsApplySurfaceLocation()) {
            const jobDetailRoot = resolveLinkedInJobDetailInventoryRoot();

            if (jobDetailRoot) {
                appendSnapshotFromRootIncludingSameOriginFrames(
                    jobDetailRoot,
                    profile,
                    settings,
                    memo,
                    merged,
                    jobPostingLocation,
                );
                inventoryLog('info', 'snapshot.build', 'buildSnapshotAllFrames scoped to LinkedIn job detail', {
                    elementCount: merged.elements.length,
                    controlCount: merged.controls.length,
                });

                return merged;
            }

            inventoryLog('info', 'snapshot.build', 'buildSnapshotAllFrames skipped LinkedIn SERP without job detail', {
                elementCount: 0,
            });

            return merged;
        }

        AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
            appendSnapshotFromRoot(doc, profile, settings, memo, merged, jobPostingLocation);
        });

        inventoryLog('info', 'snapshot.build', 'buildSnapshotAllFrames complete', {
            elementCount: merged.elements.length,
            controlCount: merged.controls.length,
        });

        return merged;
    }

    async function buildSnapshotAllFramesAsync(root, profile, settings, memo = {}) {
        const merged = buildSnapshotAllFrames(root, profile, settings, memo);

        await enrichSnapshotOptions(merged.elements);

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
            const groupInputs = typeof AutoCVApplyFormHeuristics?.getGroupInputs === 'function'
                ? AutoCVApplyFormHeuristics.getGroupInputs(element)
                : (() => {
                    const group = element.closest('fieldset, [role="radiogroup"], [role="group"], .gfield, .application-field');
                    const groupInputs = group
                        ? [...group.querySelectorAll(`input[type="${element.type}"]`)]
                            .filter((input) => !element.name || input.name === element.name)
                        : [element];

                    return groupInputs.length ? groupInputs : [element];
                })();

            return registerTarget(groupInputs.length > 1 ? groupInputs : element, groupInputs.length > 1 ? groupInputs : null);
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
        }, { includeFilled: true });

        return resolved;
    }

    return {
        buildSnapshot,
        buildSnapshotAllFrames,
        buildSnapshotAllFramesAsync,
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
        resolveHighlightRoot,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyFieldInventory = AutoCVApplyFieldInventory;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyFieldInventory = AutoCVApplyFieldInventory;
}
