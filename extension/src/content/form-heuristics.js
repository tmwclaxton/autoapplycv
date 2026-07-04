/**
 * Mechanical DOM helpers for job application forms: label discovery, ref-based fill, iframe traversal.
 */
const AutoCVApplyFormHeuristics = (() => {
    function normalize(text) {
        return (text || '').replace(/\s+/g, ' ').replace(/\*/g, '').trim().toLowerCase();
    }

    function labelsMatch(left, right) {
        const a = normalize(left);
        const b = normalize(right);

        if (a === b) {
            return true;
        }

        if (a.length >= 12 && b.length >= 12 && (a.includes(b) || b.includes(a))) {
            return true;
        }

        const prefixLength = Math.min(48, a.length, b.length);

        return prefixLength >= 12 && a.slice(0, prefixLength) === b.slice(0, prefixLength);
    }

    function normalizeOption(text) {
        return normalize(text).replace(/[^\w\s>\/-]/g, '').replace(/\s+/g, ' ').trim();
    }

    function escapeSelectorValue(value) {
        if (typeof CSS !== 'undefined' && CSS.escape) {
            return CSS.escape(value);
        }

        return String(value).replace(/"/g, '\\"');
    }

    function getQuestionContainer(element) {
        return element.closest(
            'fieldset[data-testid^="input-q_"], [data-testid^="input-q_"], .ia-Questions-item, fieldset[name^="q_"], fieldset',
        );
    }

    function getOptionLabel(input) {
        if (input.labels?.length) {
            return input.labels[0].textContent.replace(/\s+/g, ' ').trim();
        }

        const doc = input.ownerDocument || document;
        const id = input.getAttribute('id');

        if (id) {
            const label = doc.querySelector(`label[for="${escapeSelectorValue(id)}"]`);

            if (label) {
                return label.textContent.replace(/\s+/g, ' ').trim();
            }
        }

        return String(input.value || '').trim();
    }

    function getQuestionLabel(element) {
        const container = getQuestionContainer(element);

        if (container) {
            const testLabel = container.querySelector('[data-testid$="-label"] span[data-testid="safe-markup"], [data-testid$="-label"]');

            if (testLabel) {
                return normalize(testLabel.textContent);
            }

            const legend = container.querySelector('legend');

            if (legend) {
                return normalize(legend.textContent);
            }

            const groupLabel = container.querySelector('label[aria-required], label[id*="question-label"]');

            if (groupLabel && !groupLabel.querySelector('input, textarea, select')) {
                return normalize(groupLabel.textContent);
            }
        }

        return getFieldLabel(element);
    }

    function getGroupName(element) {
        if (element.name) {
            return element.name;
        }

        const container = getQuestionContainer(element);

        return container?.getAttribute('data-testid')
            || container?.getAttribute('name')
            || getQuestionLabel(element);
    }

    function getGroupInputs(element) {
        const doc = element.ownerDocument || document;
        const container = getQuestionContainer(element);

        if (element.name) {
            const selector = `input[type="${element.type}"][name="${escapeSelectorValue(element.name)}"]`;

            return Array.from((container || doc).querySelectorAll(selector)).filter(isVisible);
        }

        return [element].filter(isVisible);
    }

    function isGroupAnswered(element) {
        if (element.type === 'radio' || element.type === 'checkbox') {
            return getGroupInputs(element).some((input) => input.checked);
        }

        return Boolean(element.value?.trim());
    }

    function optionMatchesAnswer(optionText, answer) {
        const option = normalizeOption(optionText);
        const normalizedAnswer = normalizeOption(answer);

        if (!option || !normalizedAnswer) {
            return false;
        }

        if (option === normalizedAnswer || option.includes(normalizedAnswer) || normalizedAnswer.includes(option)) {
            return true;
        }

        if (normalizedAnswer === 'yes') {
            return /^yes\b/.test(option) || option.includes('i am open') || option.includes('i can start');
        }

        if (normalizedAnswer === 'no') {
            return /^no\b/.test(option) || option.includes('not open') || option.includes('i am not');
        }

        return false;
    }

    function getGroupOptions(element) {
        if (element.type === 'radio' || element.type === 'checkbox') {
            return getGroupInputs(element)
                .map((input) => getOptionLabel(input))
                .filter((label) => label.length > 0);
        }

        return getSelectOptions(element);
    }

    function markInputChecked(input) {
        input.checked = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        return true;
    }

    function setRadioGroupValue(element, answer) {
        for (const radio of getGroupInputs(element)) {
            const optionText = getOptionLabel(radio);
            const optionValue = String(radio.value || '');

            if (optionMatchesAnswer(optionText, answer) || optionMatchesAnswer(optionValue, answer)) {
                return markInputChecked(radio);
            }
        }

        return false;
    }

    function setCheckboxGroupValue(element, answer) {
        const answers = String(answer)
            .split(/[,;|]/)
            .map((part) => part.trim())
            .filter(Boolean);

        if (answers.length === 0) {
            return false;
        }

        let matched = 0;

        for (const checkbox of getGroupInputs(element)) {
            const optionText = getOptionLabel(checkbox);
            const optionValue = String(checkbox.value || '');

            if (answers.some((candidate) => optionMatchesAnswer(optionText, candidate) || optionMatchesAnswer(optionValue, candidate))) {
                markInputChecked(checkbox);
                matched += 1;
            }
        }

        return matched > 0;
    }

    function setGroupValue(element, answer) {
        if (element.type === 'radio') {
            return setRadioGroupValue(element, answer);
        }

        if (element.type === 'checkbox') {
            return setCheckboxGroupValue(element, answer);
        }

        return setFieldValue(element, answer);
    }

    function getRadiogroupLabel(group) {
        const doc = group.ownerDocument || document;
        const labelledBy = group.getAttribute('aria-labelledby');

        if (labelledBy) {
            for (const id of labelledBy.split(/\s+/)) {
                const labelEl = doc.getElementById(id);

                if (labelEl?.textContent?.trim()) {
                    return normalize(labelEl.textContent);
                }
            }
        }

        const legend = group.querySelector('legend');

        if (legend?.textContent?.trim()) {
            return normalize(legend.textContent);
        }

        const heading = group.closest('fieldset, section, div')?.querySelector(
            'legend, label[aria-required], [class*="question"], h1, h2, h3, h4, p',
        );

        if (heading?.textContent?.trim() && !heading.querySelector('input, textarea, select, [role="radio"]')) {
            return normalize(heading.textContent);
        }

        return normalize(group.getAttribute('aria-label') || '');
    }

    function collectRoleRadioGroups(root) {
        const groups = [];
        const seen = new Set();

        for (const group of root.querySelectorAll('[role="radiogroup"]')) {
            if (!isVisible(group)) {
                continue;
            }

            const radios = Array.from(group.querySelectorAll('[role="radio"]')).filter(isVisible);

            if (radios.length < 2) {
                continue;
            }

            const key = group.id
                || group.getAttribute('data-testid')
                || group.getAttribute('name')
                || `${getRadiogroupLabel(group)}:${radios.length}`;

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            groups.push({ group, radios, label: getRadiogroupLabel(group) });
        }

        return groups;
    }

    function isRoleGroupAnswered(radios) {
        return radios.some((radio) => radio.getAttribute('aria-checked') === 'true');
    }

    function getRoleRadioOptions(radios) {
        return radios
            .map((radio) => (radio.textContent || radio.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
            .filter((label) => label.length > 0);
    }

    function setRoleRadioGroupValue(radios, answer) {
        for (const radio of radios) {
            const optionText = (radio.textContent || radio.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
            const optionValue = String(radio.getAttribute('data-value') || radio.getAttribute('value') || '');

            if (optionMatchesAnswer(optionText, answer) || optionMatchesAnswer(optionValue, answer)) {
                radio.click();
                radio.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
                radio.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));

                return true;
            }
        }

        return false;
    }

    function getFieldLabel(element) {
        const parts = [];
        const doc = element.ownerDocument || document;

        if (element.labels?.length) {
            parts.push(...Array.from(element.labels).map((label) => label.textContent));
        }

        const id = element.getAttribute('id');

        if (id) {
            const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
            const explicit = doc.querySelector(`label[for="${escapedId}"]`);

            if (explicit) {
                parts.push(explicit.textContent);
            }
        }

        parts.push(
            element.getAttribute('aria-label'),
            element.getAttribute('placeholder'),
            element.getAttribute('name'),
            element.getAttribute('id'),
            element.closest('label')?.textContent,
            element.closest('.form-group, .field, .input-wrapper, [class*="question"]')?.querySelector('label, legend, .label, h3, h4, p')?.textContent,
        );

        return normalize(parts.filter(Boolean).join(' '));
    }

    function elementDefaultView(element) {
        return element?.ownerDocument?.defaultView || window;
    }

    function isVisible(element) {
        if (!element || element.disabled || element.readOnly) {
            return false;
        }

        if (element.type === 'hidden') {
            return false;
        }

        const view = elementDefaultView(element);

        if (!view?.getComputedStyle) {
            return false;
        }

        try {
            const style = view.getComputedStyle(element);

            return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
        } catch {
            return false;
        }
    }

    function setNativeValue(element, value) {
        const stringValue = String(value);
        const view = elementDefaultView(element);
        const tag = element.tagName?.toLowerCase();
        let prototype = null;

        if (tag === 'textarea') {
            prototype = view.HTMLTextAreaElement?.prototype;
        } else if (tag === 'input') {
            prototype = view.HTMLInputElement?.prototype;
        }

        if (prototype) {
            const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

            if (descriptor?.set) {
                descriptor.set.call(element, stringValue);

                return;
            }
        }

        element.value = stringValue;
    }

    function setFieldValue(element, value) {
        if (!element || value === null || value === undefined || value === '') {
            return false;
        }

        const tag = element.tagName.toLowerCase();

        if (tag === 'select') {
            const normalizedValue = String(value).toLowerCase();
            const options = Array.from(element.options);

            const match = options.find((option) => {
                const text = option.textContent.trim().toLowerCase();
                const val = option.value.toLowerCase();

                return text === normalizedValue || val === normalizedValue || text.includes(normalizedValue);
            }) || options.find((option) => option.value && option.value !== '');

            if (!match) {
                return false;
            }

            element.value = match.value;
            element.dispatchEvent(new Event('change', { bubbles: true }));

            return true;
        }

        if (element.type === 'checkbox' || element.type === 'radio') {
            return setGroupValue(element, value);
        }

        setNativeValue(element, value);

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));

        return true;
    }

    function collectFillableElements(root) {
        return Array.from(root.querySelectorAll('input, textarea, select')).filter(isVisible);
    }

    function forEachIframeDocument(callback) {
        callback(document);

        for (const iframe of document.querySelectorAll('iframe')) {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;

                if (doc) {
                    callback(doc);
                    forEachIframeDocumentIn(doc, callback);
                }
            } catch {
                // Cross-origin iframe — skip.
            }
        }
    }

    function forEachIframeDocumentIn(rootDocument, callback) {
        for (const iframe of rootDocument.querySelectorAll('iframe')) {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;

                if (doc) {
                    callback(doc);
                    forEachIframeDocumentIn(doc, callback);
                }
            } catch {
                // Cross-origin iframe — skip.
            }
        }
    }

    function looksLikeApplicationForm() {
        let score = 0;

        forEachIframeDocument((doc) => {
            const inputs = collectFillableElements(doc);

            if (inputs.length >= 2) {
                score += 1;
            }

            const labels = inputs.map((input) => getFieldLabel(input)).join(' ');

            if (/email/.test(labels) && (/phone|tel/.test(labels) || /name/.test(labels))) {
                score += 2;
            }

            if (/resume|cv|cover letter|linkedin|ia-questions|employer questions/.test(labels)) {
                score += 1;
            }
        });

        return score >= 2;
    }

    function frameHasApplicationForm(root = document) {
        const inputs = collectFillableElements(root);

        if (inputs.length < 2) {
            return false;
        }

        const labels = inputs.map((input) => getFieldLabel(input)).join(' ');

        return /email/.test(labels) && (/phone|tel|name/.test(labels));
    }

    function getFieldType(element) {
        const tag = element.tagName.toLowerCase();

        if (tag === 'textarea') {
            return 'textarea';
        }

        if (tag === 'select') {
            return 'select';
        }

        if (element.type === 'checkbox') {
            return 'checkbox';
        }

        if (element.type === 'radio') {
            return 'radio';
        }

        return element.type || 'text';
    }

    function getSelectOptions(element) {
        if (element.tagName.toLowerCase() !== 'select') {
            return undefined;
        }

        return Array.from(element.options)
            .map((option) => option.textContent.trim())
            .filter((text) => text.length > 0)
            .slice(0, 30);
    }

    function elementNeedsDraft(element) {
        if (!isVisible(element) || element.type === 'file') {
            return false;
        }

        if (element.type === 'checkbox' || element.type === 'radio') {
            if (isGroupAnswered(element)) {
                return false;
            }

            return getQuestionLabel(element).length >= 3;
        }

        if (element.value?.trim()) {
            return false;
        }

        return getQuestionLabel(element).length >= 3;
    }

    function eachDraftableField(root, profile, settings, memo, callback) {
        const seen = new Set();
        const processedGroups = new Set();
        let id = 0;

        for (const element of collectFillableElements(root)) {
            if (element.type === 'radio' || element.type === 'checkbox') {
                const groupName = getGroupName(element);

                if (processedGroups.has(groupName)) {
                    continue;
                }

                processedGroups.add(groupName);

                if (!elementNeedsDraft(element, profile, settings, memo)) {
                    continue;
                }

                const label = getQuestionLabel(element);

                if (seen.has(label)) {
                    continue;
                }

                seen.add(label);

                callback({
                    id,
                    label,
                    field_type: element.type === 'radio' ? 'radio' : 'checkbox',
                    max_chars: undefined,
                    options: getGroupOptions(element),
                }, element);

                id += 1;

                continue;
            }

            if (!elementNeedsDraft(element, profile, settings, memo)) {
                continue;
            }

            const label = getQuestionLabel(element);

            if (seen.has(label)) {
                continue;
            }

            seen.add(label);

            callback({
                id,
                label,
                field_type: getFieldType(element),
                max_chars: element.maxLength > 0 ? element.maxLength : undefined,
                options: getGroupOptions(element),
            }, element);

            id += 1;
        }

        for (const { radios, label } of collectRoleRadioGroups(root)) {
            if (label.length < 3 || seen.has(label)) {
                continue;
            }

            if (isRoleGroupAnswered(radios)) {
                continue;
            }

            seen.add(label);

            callback({
                id,
                label,
                field_type: 'radio',
                max_chars: undefined,
                options: getRoleRadioOptions(radios),
            }, radios[0], radios);

            id += 1;
        }
    }

    function collectDraftableFields(root, profile, settings, memo = {}) {
        const items = [];

        eachDraftableField(root, profile, settings, memo, (field) => {
            items.push(field);
        });

        return items;
    }

    function applyAnswerByLabel(root, label, answer) {
        if (!answer) {
            return false;
        }

        const normalizedTarget = normalize(label);
        const processedGroups = new Set();

        for (const { radios, label: groupLabel } of collectRoleRadioGroups(root)) {
            if (!labelsMatch(groupLabel, normalizedTarget)) {
                continue;
            }

            if (setRoleRadioGroupValue(radios, answer)) {
                return true;
            }
        }

        for (const element of collectFillableElements(root)) {
            if (element.type === 'radio' || element.type === 'checkbox') {
                const groupName = getGroupName(element);

                if (processedGroups.has(groupName)) {
                    continue;
                }

                processedGroups.add(groupName);

                if (!labelsMatch(getQuestionLabel(element), normalizedTarget)) {
                    continue;
                }

                if (setGroupValue(element, answer)) {
                    return true;
                }

                continue;
            }

            if (!labelsMatch(getQuestionLabel(element), normalizedTarget)) {
                continue;
            }

            if (setFieldValue(element, answer)) {
                return true;
            }
        }

        return false;
    }

    function collectAllDraftableFields(root, profile, settings, memo = {}) {
        const items = [];
        const seen = new Set();

        forEachIframeDocument((doc) => {
            for (const field of collectDraftableFields(doc, profile, settings, memo)) {
                if (seen.has(field.label)) {
                    continue;
                }

                seen.add(field.label);
                items.push({
                    ...field,
                    id: items.length,
                });
            }
        });

        return items;
    }

    function applyAnswerByLabelAllFrames(root, label, answer) {
        let applied = false;

        forEachIframeDocument((doc) => {
            if (applyAnswerByLabel(doc, label, answer)) {
                applied = true;
            }
        });

        return applied;
    }

    function countDraftableFields(root, profile, settings, memo = {}) {
        return collectDraftableFields(root, profile, settings, memo).length;
    }

    function applyAnswerForTarget(root, target, fieldType, answer) {
        if (!answer) {
            return false;
        }

        if (Array.isArray(target)) {
            return setRoleRadioGroupValue(target, answer);
        }

        if (target.type === 'radio' || target.type === 'checkbox') {
            return setGroupValue(target, answer);
        }

        return setFieldValue(target, answer);
    }

    return {
        applyAnswerByLabel,
        applyAnswerByLabelAllFrames,
        applyAnswerForTarget,
        collectAllDraftableFields,
        collectDraftableFields,
        countDraftableFields,
        eachDraftableField,
        forEachIframeDocument,
        frameHasApplicationForm,
        getFieldLabel,
        getFieldType,
        getQuestionLabel,
        looksLikeApplicationForm,
        setFieldValue,
        setGroupValue,
        setRoleRadioGroupValue,
    };
})();
