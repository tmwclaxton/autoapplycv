/**
 * Mechanical DOM helpers for job application forms: label discovery, ref-based fill, iframe traversal.
 */
const AutoCVApplyFormHeuristics = (() => {
    function heuristicsLog(level, phase, message, data) {
        if (typeof AutoCVApplyDebugLog === 'undefined') {
            return;
        }

        const logger = AutoCVApplyDebugLog[`log${level.charAt(0).toUpperCase()}${level.slice(1)}`];

        if (typeof logger === 'function') {
            logger('content', phase, message, data);
        }
    }

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
            'fieldset[data-testid^="input-q_"], [data-testid^="input-q_"], .ia-Questions-item, fieldset[name^="q_"], fieldset, [data-field-path], .ashby-application-form-field-entry',
        );
    }

    function getAshbyFieldEntry(element) {
        return element.closest('[data-field-path], .ashby-application-form-field-entry');
    }

    function getAshbyQuestionTitle(element) {
        const entry = getAshbyFieldEntry(element);

        if (!entry) {
            return '';
        }

        const title = entry.querySelector('.ashby-application-form-question-title');

        return title?.textContent ? normalize(title.textContent) : '';
    }

    function isAshbyHiddenYesNoInput(element) {
        return element.type === 'checkbox'
            && element.tabIndex === -1
            && element.closest('[class*="_yesno_"]') !== null;
    }

    function isAshbyStyledChoiceInput(element) {
        return (element.type === 'radio' || element.type === 'checkbox')
            && getAshbyFieldEntry(element) !== null
            && !isAshbyHiddenYesNoInput(element);
    }

    function resolveAshbyChoiceClickTarget(input) {
        return resolveAshbyChoiceClickTargets(input)[0] || input;
    }

    function resolveAshbyChoiceClickTargets(input) {
        const doc = input.ownerDocument || document;
        const id = input.getAttribute('id');
        const option = input.closest('[class*="_option_"]');
        const styledContainer = input.closest('[class*="_container_"]');
        const targets = [];
        const seen = new Set();

        function add(target) {
            if (target && !seen.has(target)) {
                seen.add(target);
                targets.push(target);
            }
        }

        if (input.type === 'checkbox') {
            add(styledContainer);
            add(option);
        }

        if (id) {
            add(doc.querySelector(`label[for="${escapeSelectorValue(id)}"]`));
        }

        add(option);
        add(styledContainer);
        add(input.parentElement);
        add(input);

        return targets;
    }

    function isAshbyChoiceVisuallyChecked(input) {
        if (input.checked) {
            return true;
        }

        const container = input.closest('[class*="_container_"]');
        const option = input.closest('[class*="_option_"]');

        for (const element of [container, option]) {
            if (!element) {
                continue;
            }

            if (element.getAttribute('data-selected') === 'true'
                || element.getAttribute('aria-checked') === 'true'
                || element.getAttribute('data-state') === 'checked') {
                return true;
            }

            const className = String(element.className || '');

            if (/\b(selected|checked|active|true)\b/i.test(className)) {
                return true;
            }
        }

        return false;
    }

    function isAshbyYesNoContainer(element) {
        if (!element) {
            return false;
        }

        const className = String(element.className || '');

        if (className.includes('_yesno_')) {
            return true;
        }

        return element.querySelector?.('[class*="_yesno_"]') !== null;
    }

    function findAshbyYesNoScope(root, { dataFieldPath = null, anchor = null } = {}) {
        const doc = root?.ownerDocument || root || document;

        if (dataFieldPath) {
            const byPath = doc.querySelector(
                `[data-field-path="${escapeSelectorValue(dataFieldPath)}"]`,
            );

            if (byPath) {
                return byPath;
            }
        }

        if (anchor?.isConnected) {
            const fromAnchor = anchor.closest('[data-field-path], .ashby-application-form-field-entry')
                || anchor.closest('[class*="_yesno_"]');

            if (fromAnchor) {
                return fromAnchor;
            }
        }

        return null;
    }

    function queryAshbyYesNoContainer(scope) {
        if (!scope) {
            return null;
        }

        if (String(scope.className || '').includes('_yesno_')) {
            return scope;
        }

        return scope.querySelector('[class*="_yesno_"]')
            || scope.querySelector('._container_1svni_28');
    }

    function queryAshbyYesNoButtons(scope, root = document) {
        const fieldScope = findAshbyYesNoScope(root, { anchor: scope }) || scope;
        const container = queryAshbyYesNoContainer(fieldScope);

        if (!container) {
            return [];
        }

        return Array.from(container.querySelectorAll('button')).filter(isVisible);
    }

    function readAshbyYesNoSelection(scope, root = document) {
        const fieldScope = findAshbyYesNoScope(root, { anchor: scope }) || scope;
        const container = queryAshbyYesNoContainer(fieldScope);

        if (!container) {
            return null;
        }

        const selected = Array.from(container.querySelectorAll('button')).find((button) => {
            if (button.getAttribute('aria-pressed') === 'true') {
                return true;
            }

            const className = String(button.className || '');

            return /selected|active|checked|true/i.test(className);
        });

        if (selected) {
            return selected.textContent.replace(/\s+/g, ' ').trim();
        }

        const checkbox = container.querySelector('input[type="checkbox"]');

        if (checkbox?.checked) {
            const pressed = Array.from(container.querySelectorAll('button')).find(
                (button) => button.getAttribute('aria-pressed') === 'true',
            );

            if (pressed) {
                return pressed.textContent.replace(/\s+/g, ' ').trim();
            }
        }

        return null;
    }

    function isAshbyYesNoScopeAnswered(scope, dataFieldPath = null, root = document) {
        const fieldScope = findAshbyYesNoScope(root, { dataFieldPath, anchor: scope }) || scope;

        return readAshbyYesNoSelection(fieldScope, root) !== null;
    }

    function resolveAshbyYesNoButtons(target, dataFieldPath = null, root = document) {
        const anchor = Array.isArray(target) ? target[0] : target;
        const scope = findAshbyYesNoScope(root, {
            dataFieldPath,
            anchor,
        });

        if (scope) {
            const freshButtons = queryAshbyYesNoButtons(scope, root);

            if (freshButtons.length >= 2) {
                return freshButtons;
            }
        }

        return Array.isArray(target) ? target.filter((button) => button?.isConnected) : [];
    }

    function extractBooleanAnswer(answer) {
        const normalized = normalizeOption(answer);

        if (!normalized) {
            return normalized;
        }

        if (/^(yes|y|true)\b/.test(normalized) || normalized.includes(' i am open') || normalized.includes(' i can start')) {
            return 'yes';
        }

        if (/^(no|n|false)\b/.test(normalized) || normalized.includes(' not open') || normalized.includes(' i am not')) {
            return 'no';
        }

        const yesMatch = normalized.match(/\b(yes|yeah|yep|true)\b/);
        const noMatch = normalized.match(/\b(no|nope|false)\b/);

        if (yesMatch && !noMatch) {
            return 'yes';
        }

        if (noMatch && !yesMatch) {
            return 'no';
        }

        return normalized;
    }

    function collectAshbyYesNoFields(root) {
        const fields = [];
        const seen = new Set();

        for (const fieldEntry of root.querySelectorAll('[data-field-path], .ashby-application-form-field-entry')) {
            const yesNoContainer = fieldEntry.querySelector('[class*="_yesno_"]');

            if (!yesNoContainer) {
                continue;
            }

            const buttons = Array.from(yesNoContainer.querySelectorAll('button')).filter(isVisible);

            if (buttons.length < 2) {
                continue;
            }

            const label = getAshbyQuestionTitle(fieldEntry);

            if (label.length < 3) {
                continue;
            }

            const key = fieldEntry.getAttribute('data-field-path') || label;

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            fields.push({
                fieldEntry,
                dataFieldPath: fieldEntry.getAttribute('data-field-path') || null,
                buttons,
                label,
                optionLabels: buttons
                    .map((button) => button.textContent.replace(/\s+/g, ' ').trim())
                    .filter((text) => text.length > 0),
            });
        }

        return fields;
    }

    function isAshbyYesNoAnswered(buttons, dataFieldPath = null, root = document) {
        const anchor = Array.isArray(buttons) ? buttons[0] : buttons;

        return isAshbyYesNoScopeAnswered(anchor, dataFieldPath, root);
    }

    function sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    function dispatchPointerClick(element) {
        if (!element) {
            return;
        }

        const view = elementDefaultView(element);
        const PointerEventCtor = view.PointerEvent || view.MouseEvent;

        element.focus();
        element.dispatchEvent(new PointerEventCtor('pointerdown', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new PointerEventCtor('pointerup', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    function nativeClick(element) {
        if (!element) {
            return;
        }

        element.focus();

        if (typeof element.click === 'function') {
            element.click();

            return;
        }

        dispatchPointerClick(element);
    }

    function clickAshbyYesNoButton(button) {
        button.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        button.focus();
        nativeClick(button);
    }

    function syncAshbyYesNoInertDom(scope, booleanAnswer, root = document) {
        const fieldScope = findAshbyYesNoScope(root, { anchor: scope }) || scope;
        const container = queryAshbyYesNoContainer(fieldScope);

        if (!container) {
            return false;
        }

        const buttons = Array.from(container.querySelectorAll('button'));
        const targetButton = buttons.find((button) => optionMatchesAnswer(
            button.textContent.replace(/\s+/g, ' ').trim(),
            booleanAnswer,
        ));

        if (!targetButton) {
            return false;
        }

        for (const candidate of buttons) {
            candidate.setAttribute('aria-pressed', candidate === targetButton ? 'true' : 'false');
        }

        const checkbox = container.querySelector('input[type="checkbox"]');

        if (checkbox) {
            setNativeChecked(checkbox, true);
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }

        return optionMatchesAnswer(readAshbyYesNoSelection(fieldScope, root), booleanAnswer);
    }

    async function setAshbyYesNoValue(buttons, answer, options = {}) {
        const root = options.root || document;
        const dataFieldPath = options.dataFieldPath || null;
        const booleanAnswer = extractBooleanAnswer(answer);
        const anchor = Array.isArray(buttons) ? buttons[0] : buttons;
        const scope = findAshbyYesNoScope(root, { dataFieldPath, anchor });

        if (!booleanAnswer) {
            heuristicsLog('warn', 'apply.yesno', 'Could not extract boolean answer', {
                dataFieldPath,
                answerPreview: String(answer).slice(0, 80),
            });

            return false;
        }

        const clickStrategies = [clickAshbyYesNoButton, dispatchPointerClick];

        for (let attempt = 0; attempt < clickStrategies.length; attempt += 1) {
            const currentButtons = resolveAshbyYesNoButtons(buttons, dataFieldPath, root);

            for (const button of currentButtons) {
                const optionText = button.textContent.replace(/\s+/g, ' ').trim();

                if (!optionMatchesAnswer(optionText, booleanAnswer)) {
                    continue;
                }

                heuristicsLog('info', 'apply.yesno', 'Clicking Yes/No button', {
                    dataFieldPath,
                    optionText,
                    answerPreview: String(answer).slice(0, 80),
                    booleanAnswer,
                    attempt: attempt + 1,
                });

                clickStrategies[attempt](button);
                await sleep(attempt === 0 ? 40 : 80);

                const selection = readAshbyYesNoSelection(scope, root);

                if (optionMatchesAnswer(selection, booleanAnswer)) {
                    const container = queryAshbyYesNoContainer(scope);
                    const checkbox = container?.querySelector('input[type="checkbox"]');

                    heuristicsLog('info', 'apply.yesno', 'Yes/No selection verified', {
                        dataFieldPath,
                        selection,
                        checkboxChecked: checkbox?.checked ?? null,
                        attempt: attempt + 1,
                    });

                    return true;
                }
            }
        }

        if (scope && syncAshbyYesNoInertDom(scope, booleanAnswer, root)) {
            heuristicsLog('info', 'apply.yesno', 'Yes/No synced on inert DOM fallback', {
                dataFieldPath,
                booleanAnswer,
            });

            return true;
        }

        heuristicsLog('warn', 'apply.yesno', 'Yes/No fill failed after click attempts', {
            dataFieldPath,
            answerPreview: String(answer).slice(0, 80),
            booleanAnswer,
            options: resolveAshbyYesNoButtons(buttons, dataFieldPath, root)
                .map((button) => button.textContent.replace(/\s+/g, ' ').trim()),
            selection: readAshbyYesNoSelection(scope, root),
        });

        return false;
    }

    function fillReactTextControl(element, value) {
        const stringValue = String(value);

        element.focus();
        setNativeValue(element, stringValue);
        element.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertFromPaste',
            data: stringValue,
        }));
        element.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertFromPaste',
            data: stringValue,
        }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    }

    function collectComboboxOptions(doc, element) {
        const listboxId = element.getAttribute('aria-controls');
        let options = [];

        if (listboxId) {
            const listbox = doc.getElementById(listboxId);

            if (listbox) {
                options = Array.from(listbox.querySelectorAll('[role="option"]'));
            }
        }

        if (options.length === 0) {
            options = Array.from(doc.querySelectorAll('[role="listbox"] [role="option"]'))
                .filter(isVisible);
        }

        return options;
    }

    async function setAshbyComboboxValue(element, value) {
        if (!element || value === null || value === undefined || value === '') {
            heuristicsLog('warn', 'apply.combobox', 'Combobox fill skipped — empty value or element', {});

            return false;
        }

        heuristicsLog('debug', 'apply.combobox', 'Starting combobox fill', {
            valuePreview: String(value).slice(0, 80),
            ariaControls: element.getAttribute('aria-controls'),
        });

        const doc = element.ownerDocument || document;
        const stringValue = String(value);

        element.focus();
        dispatchPointerClick(element);
        fillReactTextControl(element, stringValue);

        const normalizedAnswer = normalizeOption(stringValue);
        let options = collectComboboxOptions(doc, element);

        for (let attempt = 0; attempt < 6 && options.length === 0; attempt += 1) {
            await sleep(250);
            options = collectComboboxOptions(doc, element);
        }

        heuristicsLog('debug', 'apply.combobox', 'Combobox options collected', {
            optionCount: options.length,
            options: options.slice(0, 8).map((option) => (option.textContent || '').replace(/\s+/g, ' ').trim()),
        });

        for (const option of options) {
            const optionText = (option.textContent || option.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();

            if (optionMatchesAnswer(optionText, stringValue) || normalizeOption(optionText).includes(normalizedAnswer.slice(0, 24))) {
                heuristicsLog('info', 'apply.combobox', 'Combobox option matched', { optionText });
                dispatchPointerClick(option);
                element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

                return true;
            }
        }

        if (options.length > 0) {
            const fallbackText = (options[0].textContent || '').replace(/\s+/g, ' ').trim();
            heuristicsLog('warn', 'apply.combobox', 'Combobox using first option fallback', { fallbackText });
            dispatchPointerClick(options[0]);
            element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

            return true;
        }

        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

        const typedOnly = element.value?.trim().length > 0;
        heuristicsLog(typedOnly ? 'info' : 'warn', 'apply.combobox', typedOnly ? 'Combobox typed value only' : 'Combobox fill failed', {
            typedValue: element.value?.slice(0, 80),
        });

        return typedOnly;
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
        const ashbyTitle = getAshbyQuestionTitle(element);

        if (ashbyTitle.length >= 3) {
            return ashbyTitle;
        }

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
        const ashbyFieldPath = getAshbyFieldEntry(element)?.getAttribute('data-field-path');

        if (ashbyFieldPath) {
            return ashbyFieldPath;
        }

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
        const ashbyEntry = getAshbyFieldEntry(element);

        if (ashbyEntry && (element.type === 'radio' || element.type === 'checkbox')) {
            return Array.from(ashbyEntry.querySelectorAll(`input[type="${element.type}"]`))
                .filter((input) => !isAshbyHiddenYesNoInput(input));
        }

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
        const normalizedAnswer = extractBooleanAnswer(answer);

        if (!option || !normalizedAnswer) {
            return false;
        }

        if (option === normalizedAnswer || option.includes(normalizedAnswer) || normalizedAnswer.includes(option)) {
            return true;
        }

        const booleanOption = extractBooleanAnswer(optionText);

        if (booleanOption === 'yes' || booleanOption === 'no') {
            if (booleanOption === normalizedAnswer) {
                return true;
            }
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

    function setNativeChecked(input, checked) {
        const ownDescriptor = Object.getOwnPropertyDescriptor(input, 'checked');

        if (ownDescriptor?.set) {
            ownDescriptor.set.call(input, checked);

            return;
        }

        const view = elementDefaultView(input);
        const prototype = view.HTMLInputElement?.prototype;
        const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'checked') : null;

        if (descriptor?.set) {
            descriptor.set.call(input, checked);
        } else {
            input.checked = checked;
        }
    }

    function markInputChecked(input) {
        if (isAshbyStyledChoiceInput(input)) {
            const optionText = getOptionLabel(input);
            const optionValue = String(input.value || input.name || '');
            const clickTargets = resolveAshbyChoiceClickTargets(input);

            heuristicsLog('debug', 'apply.checkbox', 'Attempting Ashby styled choice fill', {
                inputType: input.type,
                optionText,
                optionValue,
                targetCount: clickTargets.length,
                targetTags: clickTargets.map((target) => target.tagName?.toLowerCase()).filter(Boolean),
            });

            if (isAshbyChoiceVisuallyChecked(input)) {
                heuristicsLog('info', 'apply.checkbox', 'Ashby choice already selected', {
                    optionText,
                    checked: input.checked,
                });

                return true;
            }

            for (const target of clickTargets) {
                nativeClick(target);

                if (isAshbyChoiceVisuallyChecked(input)) {
                    heuristicsLog('info', 'apply.checkbox', 'Ashby choice selected via click', {
                        optionText,
                        optionValue,
                        clickedTag: target.tagName?.toLowerCase() || null,
                        clickedClass: String(target.className || '').slice(0, 80),
                        checked: input.checked,
                    });

                    return true;
                }
            }

            if (!isAshbyChoiceVisuallyChecked(input)) {
                input.checked = true;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const checked = isAshbyChoiceVisuallyChecked(input);

            heuristicsLog(checked ? 'info' : 'warn', 'apply.checkbox', checked ? 'Ashby choice selected via fallback' : 'Ashby choice fill failed', {
                optionText,
                optionValue,
                checked: input.checked,
            });

            return checked;
        }

        input.focus();
        setNativeChecked(input, true);
        nativeClick(input);
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

    function coerceCheckboxAnswers(answer) {
        if (Array.isArray(answer)) {
            return answer
                .map((part) => String(part).trim())
                .filter(Boolean);
        }

        if (answer && typeof answer === 'object') {
            return [];
        }

        return String(answer)
            .split(/[,;|]/)
            .map((part) => part.trim())
            .filter(Boolean);
    }

    function setCheckboxGroupValue(element, answer) {
        const answers = coerceCheckboxAnswers(answer);

        if (answers.length === 0) {
            heuristicsLog('warn', 'apply.checkbox', 'Checkbox group received empty answer', {
                answerPreview: String(answer).slice(0, 80),
                groupLabel: getQuestionLabel(element),
            });

            return false;
        }

        heuristicsLog('debug', 'apply.checkbox', 'Filling checkbox group', {
            groupLabel: getQuestionLabel(element),
            answers,
            optionCount: getGroupInputs(element).length,
        });

        let matched = 0;
        let applied = 0;

        for (const checkbox of getGroupInputs(element)) {
            const optionText = getOptionLabel(checkbox);
            const optionValue = String(checkbox.value || checkbox.name || '');

            if (!answers.some((candidate) => optionMatchesAnswer(optionText, candidate) || optionMatchesAnswer(optionValue, candidate))) {
                continue;
            }

            matched += 1;

            if (markInputChecked(checkbox)) {
                applied += 1;
            }
        }

        heuristicsLog(applied > 0 ? 'info' : 'warn', 'apply.checkbox', applied > 0 ? 'Checkbox group fill complete' : 'Checkbox group fill failed', {
            groupLabel: getQuestionLabel(element),
            answers,
            matched,
            applied,
        });

        return applied > 0;
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
                nativeClick(radio);
                radio.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
                radio.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));

                if (!isRoleGroupAnswered(radios)) {
                    radios.forEach((candidate) => {
                        const selected = candidate === radio;
                        candidate.setAttribute('aria-checked', selected ? 'true' : 'false');
                        candidate.setAttribute('tabindex', selected ? '0' : '-1');
                    });
                }

                return true;
            }
        }

        return false;
    }

    function getAccessibleLabel(doc, element) {
        const labelledBy = element.getAttribute('aria-labelledby');

        if (labelledBy) {
            for (const id of labelledBy.split(/\s+/)) {
                const labelEl = doc.getElementById(id);

                if (labelEl?.textContent?.trim()) {
                    return normalize(labelEl.textContent);
                }
            }
        }

        const ariaLabel = element.getAttribute('aria-label');

        if (ariaLabel?.trim()) {
            return normalize(ariaLabel);
        }

        const container = element.closest('.field-row, .form-group, .field, [class*="question"]');
        const explicit = container?.querySelector('label, legend, [id$="-lbl"]');

        if (explicit?.textContent?.trim() && !explicit.querySelector('input, textarea, select, [role="radio"], [role="checkbox"]')) {
            return normalize(explicit.textContent);
        }

        return '';
    }

    function isIncidentalListbox(listbox, label) {
        if (/list of countries|country list|phone country|dial code|country code/i.test(label)) {
            return true;
        }

        if (listbox.classList.contains('iti__country-list') || listbox.closest('.iti, .iti__country-container')) {
            return true;
        }

        return false;
    }

    function getComboboxForListbox(root, listbox) {
        const listboxId = listbox.id;

        if (!listboxId) {
            return null;
        }

        return root.querySelector(
            `[role="combobox"][aria-controls="${escapeSelectorValue(listboxId)}"], [aria-controls="${escapeSelectorValue(listboxId)}"][role="combobox"]`,
        );
    }

    function isApplicationListbox(root, listbox, label) {
        if (isIncidentalListbox(listbox, label)) {
            return false;
        }

        if (getComboboxForListbox(root, listbox)) {
            return true;
        }

        return listbox.closest(
            '.field-row, .form-group, .input-wrapper, [data-testid^="input-q_"], .ia-Questions-item, .application-field, .v-select, .MuiAutocomplete-root, .ashby-application-form-field-entry, [data-field-path]',
        ) !== null;
    }

    function collectRoleListboxFields(root) {
        const fields = [];
        const seen = new Set();
        const doc = root.ownerDocument || document;

        for (const listbox of root.querySelectorAll('[role="listbox"]')) {
            const combobox = getComboboxForListbox(root, listbox);
            const comboboxControlled = combobox !== null;

            if (!comboboxControlled && !isVisible(listbox)) {
                continue;
            }

            const options = Array.from(listbox.querySelectorAll('[role="option"]'))
                .filter((option) => comboboxControlled || isVisible(option));

            if (options.length < 2) {
                continue;
            }

            let label = getAccessibleLabel(doc, listbox);

            if ((label.length < 3 || /^(open|select)\s+/i.test(label)) && listbox.id) {
                const labelledBy = listbox.getAttribute('aria-labelledby');

                if (labelledBy) {
                    const explicitLabel = labelledBy
                        .split(/\s+/)
                        .map((id) => doc.getElementById(id))
                        .filter(Boolean)
                        .map((element) => (element.textContent || '').replace(/\s+/g, ' ').trim())
                        .find((text) => text.length >= 3);

                    if (explicitLabel) {
                        label = explicitLabel;
                    }
                }

                if (label.length < 3 && combobox) {
                    label = getAccessibleLabel(doc, combobox) || getFieldLabel(combobox);
                }
            }

            if (!isApplicationListbox(root, listbox, label)) {
                continue;
            }

            const key = listbox.id || `${label}:${options.length}`;

            if (label.length < 3 || seen.has(key)) {
                continue;
            }

            seen.add(key);
            fields.push({
                listbox,
                options,
                label,
                optionLabels: options
                    .map((option) => (option.textContent || option.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
                    .filter((text) => text.length > 0),
            });
        }

        return fields;
    }

    function isRoleListboxAnswered(listbox) {
        return Array.from(listbox.querySelectorAll('[role="option"]')).some(
            (option) => option.getAttribute('aria-selected') === 'true' || option.classList.contains('selected'),
        );
    }

    function setRoleListboxValue(listbox, answer) {
        for (const option of listbox.querySelectorAll('[role="option"]')) {
            const optionText = (option.textContent || option.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
            const optionValue = String(option.getAttribute('data-value') || option.getAttribute('value') || '');

            if (optionMatchesAnswer(optionText, answer) || optionMatchesAnswer(optionValue, answer)) {
                option.click();
                option.setAttribute('aria-selected', 'true');

                return true;
            }
        }

        return false;
    }

    function collectRoleCheckboxGroups(root) {
        const groups = [];
        const seen = new Set();
        const doc = root.ownerDocument || document;

        for (const group of root.querySelectorAll('[role="group"], fieldset, [role="radiogroup"]')) {
            const checkboxes = Array.from(group.querySelectorAll('[role="checkbox"]')).filter(isVisible);

            if (checkboxes.length < 2) {
                continue;
            }

            const label = getAccessibleLabel(doc, group) || getRadiogroupLabel(group);
            const key = group.id || `${label}:${checkboxes.length}`;

            if (label.length < 3 || seen.has(key)) {
                continue;
            }

            seen.add(key);
            groups.push({
                group,
                checkboxes,
                label,
                optionLabels: checkboxes
                    .map((checkbox) => (checkbox.textContent || checkbox.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
                    .filter((text) => text.length > 0),
            });
        }

        return groups;
    }

    function isRoleCheckboxGroupAnswered(checkboxes) {
        return checkboxes.some((checkbox) => checkbox.getAttribute('aria-checked') === 'true');
    }

    function setRoleCheckboxGroupValue(checkboxes, answer) {
        for (const checkbox of checkboxes) {
            const optionText = (checkbox.textContent || checkbox.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
            const optionValue = String(checkbox.getAttribute('data-value') || checkbox.getAttribute('value') || '');

            if (optionMatchesAnswer(optionText, answer) || optionMatchesAnswer(optionValue, answer)) {
                nativeClick(checkbox);

                if (checkbox.getAttribute('aria-checked') !== 'true') {
                    checkbox.setAttribute('aria-checked', 'true');
                }

                return true;
            }
        }

        return false;
    }

    function getFieldLabel(element) {
        const ashbyTitle = getAshbyQuestionTitle(element);

        if (ashbyTitle.length >= 3) {
            return ashbyTitle;
        }

        const labelParts = [];
        const doc = element.ownerDocument || document;

        if (element.labels?.length) {
            labelParts.push(...Array.from(element.labels).map((label) => label.textContent));
        }

        const id = element.getAttribute('id');

        if (id) {
            const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
            const explicit = doc.querySelector(`label[for="${escapedId}"]`);

            if (explicit) {
                labelParts.push(explicit.textContent);
            }
        }

        labelParts.push(
            element.getAttribute('aria-label'),
            element.getAttribute('placeholder'),
            element.closest('label')?.textContent,
            element.closest('.form-group, .field, .input-wrapper, [class*="question"]')?.querySelector('label, legend, .label, h3, h4, p')?.textContent,
        );

        const humanLabel = normalize(labelParts.filter(Boolean).join(' '));

        if (humanLabel.length >= 3) {
            return humanLabel;
        }

        return normalize([
            humanLabel,
            element.getAttribute('name'),
            element.getAttribute('id'),
        ].filter(Boolean).join(' '));
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

    async function setFieldValue(element, value) {
        if (!element || value === null || value === undefined || value === '') {
            heuristicsLog('warn', 'apply.setFieldValue', 'setFieldValue skipped — empty', {});

            return false;
        }

        const role = element.getAttribute?.('role');
        const tag = element.tagName?.toLowerCase();

        heuristicsLog('debug', 'apply.setFieldValue', 'setFieldValue called', {
            role,
            tag,
            type: element.type,
            valuePreview: String(value).slice(0, 80),
        });

        if (role === 'combobox') {
            return setAshbyComboboxValue(element, value);
        }

        if (tag === 'select') {
            const normalizedValue = String(value).toLowerCase();
            const options = Array.from(element.options);

            const match = options.find((option) => {
                const text = option.textContent.trim().toLowerCase();
                const val = option.value.toLowerCase();

                return text === normalizedValue || val === normalizedValue || text.includes(normalizedValue);
            }) || options.find((option) => option.value && option.value !== '');

            if (!match) {
                heuristicsLog('warn', 'apply.setFieldValue', 'Select option not found', {
                    valuePreview: String(value).slice(0, 80),
                    optionCount: options.length,
                });

                return false;
            }

            element.value = match.value;
            element.dispatchEvent(new Event('change', { bubbles: true }));

            return true;
        }

        if (element.type === 'checkbox' || element.type === 'radio') {
            return setGroupValue(element, value);
        }

        fillReactTextControl(element, value);

        heuristicsLog('info', 'apply.setFieldValue', 'React text control filled', {
            tag,
            valuePreview: String(value).slice(0, 80),
        });

        return true;
    }

    function collectFillableElements(root) {
        return Array.from(root.querySelectorAll('input, textarea, select')).filter((element) => {
            if (isAshbyHiddenYesNoInput(element)) {
                return false;
            }

            if (isAshbyStyledChoiceInput(element)) {
                return true;
            }

            return isVisible(element);
        });
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

        for (const { buttons, label, optionLabels, dataFieldPath } of collectAshbyYesNoFields(root)) {
            if (label.length < 3 || seen.has(label)) {
                continue;
            }

            if (isAshbyYesNoAnswered(buttons, dataFieldPath, root)) {
                continue;
            }

            seen.add(label);

            callback({
                id,
                label,
                field_type: 'radio',
                max_chars: undefined,
                options: optionLabels,
            }, buttons, buttons);

            id += 1;
        }

        for (const element of collectFillableElements(root)) {
            if (getAshbyFieldEntry(element)?.querySelector('[class*="_yesno_"]')) {
                continue;
            }

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

        for (const { listbox, label, optionLabels } of collectRoleListboxFields(root)) {
            if (label.length < 3 || seen.has(label)) {
                continue;
            }

            if (isRoleListboxAnswered(listbox)) {
                continue;
            }

            seen.add(label);

            callback({
                id,
                label,
                field_type: 'select',
                max_chars: undefined,
                options: optionLabels,
            }, listbox);

            id += 1;
        }

        for (const { checkboxes, label, optionLabels } of collectRoleCheckboxGroups(root)) {
            if (label.length < 3 || seen.has(label)) {
                continue;
            }

            if (isRoleCheckboxGroupAnswered(checkboxes)) {
                continue;
            }

            seen.add(label);

            callback({
                id,
                label,
                field_type: 'checkbox',
                max_chars: undefined,
                options: optionLabels,
            }, checkboxes[0], checkboxes);

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

    async function applyAnswerByLabel(root, label, answer) {
        if (!answer) {
            return false;
        }

        heuristicsLog('debug', 'apply.label', 'applyAnswerByLabel', {
            label,
            answerPreview: String(answer).slice(0, 80),
        });

        const normalizedTarget = normalize(label);
        const processedGroups = new Set();

        for (const { buttons, label: yesNoLabel, dataFieldPath } of collectAshbyYesNoFields(root)) {
            if (!labelsMatch(yesNoLabel, normalizedTarget)) {
                continue;
            }

            if (await setAshbyYesNoValue(buttons, answer, { dataFieldPath, root })) {
                return true;
            }
        }

        for (const { radios, label: groupLabel } of collectRoleRadioGroups(root)) {
            if (!labelsMatch(groupLabel, normalizedTarget)) {
                continue;
            }

            if (setRoleRadioGroupValue(radios, answer)) {
                return true;
            }
        }

        for (const { listbox, label: listboxLabel } of collectRoleListboxFields(root)) {
            if (!labelsMatch(listboxLabel, normalizedTarget)) {
                continue;
            }

            if (setRoleListboxValue(listbox, answer)) {
                return true;
            }
        }

        for (const { checkboxes, label: checkboxLabel } of collectRoleCheckboxGroups(root)) {
            if (!labelsMatch(checkboxLabel, normalizedTarget)) {
                continue;
            }

            if (setRoleCheckboxGroupValue(checkboxes, answer)) {
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

            if (await setFieldValue(element, answer)) {
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

    async function applyAnswerByLabelAllFrames(root, label, answer) {
        const documents = [];
        let applied = false;

        forEachIframeDocument((doc) => {
            documents.push(doc);
        });

        for (const doc of documents) {
            if (await applyAnswerByLabel(doc, label, answer)) {
                applied = true;
            }
        }

        return applied;
    }

    function countDraftableFields(root, profile, settings, memo = {}) {
        return collectDraftableFields(root, profile, settings, memo).length;
    }

    async function applyAnswerForTarget(root, target, fieldType, answer, options = {}) {
        if (!answer) {
            return false;
        }

        heuristicsLog('debug', 'apply.ref', 'applyAnswerForTarget', {
            fieldType,
            dataFieldPath: options.data_field_path || null,
            answerPreview: String(answer).slice(0, 80),
            targetRole: Array.isArray(target) ? target[0]?.getAttribute?.('role') : target?.getAttribute?.('role'),
            targetTag: Array.isArray(target) ? target[0]?.tagName : target?.tagName,
        });

        if (Array.isArray(target)) {
            if (target[0]?.tagName?.toLowerCase() === 'button') {
                return setAshbyYesNoValue(
                    resolveAshbyYesNoButtons(target, options.data_field_path, root),
                    answer,
                    { dataFieldPath: options.data_field_path, root },
                );
            }

            if (target[0]?.getAttribute?.('role') === 'checkbox') {
                return setRoleCheckboxGroupValue(target, answer);
            }

            return setRoleRadioGroupValue(target, answer);
        }

        if (target?.getAttribute?.('role') === 'listbox') {
            return setRoleListboxValue(target, answer);
        }

        if (target?.getAttribute?.('role') === 'combobox') {
            return setAshbyComboboxValue(target, answer);
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
