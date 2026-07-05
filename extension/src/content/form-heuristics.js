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

    function isMicro1ApplicationPage(doc = document) {
        const hostname = doc?.location?.hostname
            || (typeof location !== 'undefined' ? location.hostname : '');

        return /(?:^|\.)micro1\.ai$/i.test(hostname);
    }

    function getMicro1QuestionBlock(element) {
        if (!element?.closest) {
            return null;
        }

        let node = element.parentElement;

        while (node) {
            const label = node.querySelector(':scope > label');

            if (label
                && !label.querySelector('input[type="radio"], input[type="checkbox"]')
                && /^Q\d+\./i.test((label.textContent || '').trim())) {
                return node;
            }

            if (node.tagName?.toLowerCase() === 'form') {
                break;
            }

            node = node.parentElement;
        }

        return null;
    }

    function getMicro1QuestionLabel(element) {
        if (!isMicro1ApplicationPage(element.ownerDocument || document)) {
            return '';
        }

        const block = getMicro1QuestionBlock(element);

        if (!block) {
            return '';
        }

        const label = block.querySelector(':scope > label');

        return label ? normalize(label.textContent) : '';
    }

    function isMicro1YesNoRadio(element) {
        return element?.type === 'radio'
            && /^yes_no_/i.test(element.name || '');
    }

    function isMicro1DefaultNumberValue(element) {
        if (!isMicro1ApplicationPage(element.ownerDocument || document) || element.type !== 'number') {
            return false;
        }

        if (String(element.value || '').trim() !== '1') {
            return false;
        }

        return getMicro1QuestionLabel(element).length >= 3;
    }

    function isMicro1ApplicationQuestionStep(root = document) {
        const doc = root.ownerDocument || root.defaultView?.document || (root.nodeType === 9 ? root : document);

        if (!isMicro1ApplicationPage(doc)) {
            return false;
        }

        return Array.from(root.querySelectorAll('label')).some(
            (label) => /^Q\d+\./i.test((label.textContent || '').trim())
                && !label.querySelector('input[type="radio"]'),
        );
    }

    function getQuestionContainer(element) {
        const micro1Block = getMicro1QuestionBlock(element);

        if (micro1Block) {
            return micro1Block;
        }

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

    function readReactSelectValue(element) {
        if (!element || element.getAttribute?.('role') !== 'combobox') {
            return null;
        }

        const shell = element.closest('.select-shell, .select__container');
        const control = element.closest('.select__control') || shell?.querySelector('.select__control');

        if (control) {
            const singleValue = control.querySelector('.select__single-value, .select__multi-value__label');

            if (singleValue?.textContent?.trim()) {
                return singleValue.textContent.replace(/\s+/g, ' ').trim();
            }
        }

        const hiddenValue = shell?.querySelector('input[tabindex="-1"][aria-hidden="true"]');

        if (hiddenValue?.value?.trim()) {
            return hiddenValue.value.trim();
        }

        const typed = String(element.value || '').trim();

        return typed || null;
    }

    function openReactSelectDropdown(element) {
        const control = element.closest('.select__control');
        const toggle = control?.querySelector('.select__indicators button, button[aria-label="Toggle flyout"]');

        if (toggle) {
            dispatchPointerClick(toggle);

            return;
        }

        dispatchPointerClick(element);
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

        return valueMatchesAnswer(element.value, stringValue);
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

    function waitForComboboxOptions(doc, element, timeoutMs = 800) {
        const existing = collectComboboxOptions(doc, element);

        if (existing.length > 0) {
            return Promise.resolve(existing);
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                observer.disconnect();
                resolve(collectComboboxOptions(doc, element));
            }, timeoutMs);

            const observer = new MutationObserver(() => {
                const options = collectComboboxOptions(doc, element);

                if (options.length > 0) {
                    clearTimeout(timeout);
                    observer.disconnect();
                    resolve(options);
                }
            });

            observer.observe(doc.body || doc.documentElement, {
                childList: true,
                subtree: true,
            });
        });
    }

    function isGreenhouseLocationCombobox(element) {
        if (!element) {
            return false;
        }

        const id = element.id || '';

        if (id === 'candidate-location') {
            return true;
        }

        const label = getFieldLabel(element);

        return /\blocation\s*\(\s*city\b/i.test(label)
            || (/\blocation\b/i.test(label) && /\b(?:city|town)\b/i.test(label));
    }

    function commitGreenhouseLocationValue(element, value) {
        const stringValue = String(value).trim();
        const typedValue = stringValue.split(',')[0].trim() || stringValue;

        fillReactTextControl(element, typedValue);

        const shell = element.closest('.select-shell, .select__container');
        const hiddenValue = shell?.querySelector('input[tabindex="-1"][aria-hidden="true"]');

        if (hiddenValue) {
            setNativeValue(hiddenValue, typedValue);
            hiddenValue.dispatchEvent(new Event('input', { bubbles: true }));
            hiddenValue.dispatchEvent(new Event('change', { bubbles: true }));
        }

        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

        return valueMatchesAnswer(readReactSelectValue(element), typedValue)
            || valueMatchesAnswer(element.value, typedValue)
            || valueMatchesAnswer(hiddenValue?.value, typedValue);
    }

    async function setAshbyComboboxValue(element, value) {
        if (!element || value === null || value === undefined || value === '') {
            heuristicsLog('warn', 'apply.combobox', 'Combobox fill skipped - empty value or element', {});

            return false;
        }

        heuristicsLog('debug', 'apply.combobox', 'Starting combobox fill', {
            valuePreview: String(value).slice(0, 80),
            ariaControls: element.getAttribute('aria-controls'),
        });

        const doc = element.ownerDocument || document;
        const stringValue = String(value);

        element.focus();
        openReactSelectDropdown(element);

        const isYesNoAnswer = /^(yes|no)\b/i.test(stringValue.trim());

        if (!isYesNoAnswer) {
            fillReactTextControl(element, stringValue);
        }

        const normalizedAnswer = normalizeOption(stringValue);
        let options = await waitForComboboxOptions(doc, element);

        if (options.length === 0 && !isYesNoAnswer) {
            openReactSelectDropdown(element);
            options = await waitForComboboxOptions(doc, element, 1200);
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

                return valueMatchesAnswer(readReactSelectValue(element), stringValue)
                    || valueMatchesAnswer(element.value, stringValue);
            }
        }

        if (options.length > 0) {
            const fallbackText = (options[0].textContent || '').replace(/\s+/g, ' ').trim();
            heuristicsLog('warn', 'apply.combobox', 'Combobox using first option fallback', { fallbackText });
            dispatchPointerClick(options[0]);
            element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

            return valueMatchesAnswer(readReactSelectValue(element), fallbackText)
                || valueMatchesAnswer(readReactSelectValue(element), stringValue);
        }

        if (isGreenhouseLocationCombobox(element)) {
            const committed = commitGreenhouseLocationValue(element, stringValue);
            heuristicsLog(committed ? 'info' : 'warn', 'apply.combobox', committed
                ? 'Greenhouse location typed value committed'
                : 'Greenhouse location fill failed', {
                typedValue: element.value?.slice(0, 80),
            });

            return committed;
        }

        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

        const shell = element.closest('.select-shell, .select__container');
        const hiddenValue = shell?.querySelector('input[tabindex="-1"][aria-hidden="true"]');

        if (hiddenValue) {
            setNativeValue(hiddenValue, stringValue);
            hiddenValue.dispatchEvent(new Event('input', { bubbles: true }));
            hiddenValue.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const selectedValue = readReactSelectValue(element);
        const typedOnly = valueMatchesAnswer(selectedValue || element.value, stringValue);
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
        const phoneInputLabel = getPhoneInputFieldLabel(element);

        if (phoneInputLabel) {
            return phoneInputLabel;
        }

        const micro1Label = getMicro1QuestionLabel(element);

        if (micro1Label.length >= 3) {
            return micro1Label;
        }

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

            const legend = container.classList?.contains('phone-input')
                ? null
                : container.querySelector('legend');

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

            return Array.from((container || doc).querySelectorAll(selector))
                .filter((input) => input.type !== 'hidden' && isVisible(input));
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

    function isConsentWildcardAnswer(answer) {
        const text = String(answer ?? '').trim();

        if (text === '*') {
            return true;
        }

        const normalized = text.toLowerCase();

        return /\bprivacy policy\b/.test(normalized)
            || /\bconsent\b/.test(normalized)
            || /\bi agree\b/.test(normalized)
            || /^yes\b/.test(normalized)
            || /\bfuture job\b/.test(normalized);
    }

    function resolveCheckboxClickTargets(input) {
        const doc = input.ownerDocument || document;
        const id = input.getAttribute('id');
        const targets = [];
        const seen = new Set();

        function add(target) {
            if (target && !seen.has(target)) {
                seen.add(target);
                targets.push(target);
            }
        }

        add(input);

        if (id) {
            add(doc.querySelector(`label[for="${escapeSelectorValue(id)}"]`));
        }

        add(input.labels?.[0]);
        add(input.closest('.c-spl-checkbox-wrapper, .c-spl-checkbox, .choice-input-wrapper, .wpforms-field-label-inline'));

        if (isMicro1YesNoRadio(input)) {
            add(input.closest('[role="button"]'));
        }

        return targets;
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

        if (input.checked) {
            return true;
        }

        input.focus();

        for (const target of resolveCheckboxClickTargets(input)) {
            nativeClick(target);

            if (input.checked) {
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));

                return true;
            }
        }

        setNativeChecked(input, true);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        return Boolean(input.checked);
    }

    function setRadioGroupValue(element, answer) {
        for (const radio of getGroupInputs(element)) {
            const optionText = getOptionLabel(radio);
            const optionValue = String(radio.value || '');

            if (optionMatchesAnswer(optionText, answer) || optionMatchesAnswer(optionValue, answer)) {
                return markInputChecked(radio);
            }

            if (isMicro1YesNoRadio(radio)) {
                const id = String(radio.id || '').toLowerCase();
                const suffix = id.includes('_') ? id.split('_').pop() : '';

                if (suffix && optionMatchesAnswer(suffix, answer)) {
                    return markInputChecked(radio);
                }
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
        if (isConsentWildcardAnswer(answer) && element.type === 'checkbox' && markInputChecked(element)) {
            return true;
        }

        if (isConsentWildcardAnswer(answer)) {
            const groupInputs = getGroupInputs(element).filter((input) => input.type === 'checkbox');
            const consentTarget = groupInputs.length === 1
                ? groupInputs[0]
                : groupInputs.find((input) => input.required || input.getAttribute('aria-required') === 'true');

            if (consentTarget && markInputChecked(consentTarget)) {
                return true;
            }
        }

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

        if (answers.some(isConsentWildcardAnswer)) {
            const groupInputs = getGroupInputs(element).filter((input) => input.type === 'checkbox');
            const consentTarget = groupInputs.length === 1
                ? groupInputs[0]
                : groupInputs.find((input) => input.required || input.getAttribute('aria-required') === 'true');

            if (consentTarget && markInputChecked(consentTarget)) {
                return true;
            }
        }

        let matched = 0;
        let applied = 0;
        const visibleCheckboxes = getGroupInputs(element).filter((input) => input.type === 'checkbox');

        if (visibleCheckboxes.length === 1 && /^yes\b/i.test(String(answer).trim())) {
            return markInputChecked(visibleCheckboxes[0]);
        }

        for (const checkbox of visibleCheckboxes) {
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

        if (applied === 0) {
            const visibleCheckboxes = getGroupInputs(element).filter((input) => input.type === 'checkbox');

            if (visibleCheckboxes.length === 1 && answers.some(isConsentWildcardAnswer)) {
                return markInputChecked(visibleCheckboxes[0]);
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

    function isGreenhouseHiddenSelectInput(element) {
        return element.tagName?.toLowerCase() === 'input'
            && element.tabIndex === -1
            && element.getAttribute('aria-hidden') === 'true'
            && element.closest('.select-shell, .select__container') !== null;
    }

    function getPhoneInputFieldLabel(element) {
        const fieldset = element.closest('fieldset.phone-input');

        if (fieldset) {
            const id = element.getAttribute('id');

            if (id) {
                const doc = element.ownerDocument || document;
                const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
                const explicit = doc.querySelector(`label[for="${escapedId}"]`);

                if (explicit) {
                    return normalize(explicit.textContent);
                }
            }
        }

        const phoneWidget = element.closest('.PhoneInput, [class*="phone-input-"]');

        if (!phoneWidget) {
            return null;
        }

        for (let node = phoneWidget.parentElement; node; node = node.parentElement) {
            for (const label of node.querySelectorAll(':scope > label')) {
                if (label.querySelector('input, textarea, select, .PhoneInput')) {
                    continue;
                }

                const text = normalize(label.textContent);

                if (text.length >= 3 && /phone|mobile|tel/i.test(text)) {
                    return text;
                }
            }
        }

        return null;
    }

    function getFieldLabel(element) {
        const phoneInputLabel = getPhoneInputFieldLabel(element);

        if (phoneInputLabel) {
            return phoneInputLabel;
        }

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

    function isTargetConnected(target) {
        if (Array.isArray(target)) {
            return target.some((element) => element?.isConnected);
        }

        return Boolean(target?.isConnected);
    }

    function isNativeChoiceInput(element, fieldType) {
        return element?.tagName?.toLowerCase() === 'input' && element.type === fieldType;
    }

    function queryNativeChoiceInput(doc, fieldType, { name = null, container = null } = {}) {
        if (name) {
            const byName = doc.querySelector(`input[type="${fieldType}"][name="${escapeSelectorValue(name)}"]`)
                || doc.querySelector(`input[name="${escapeSelectorValue(name)}"]`);

            if (byName) {
                return byName;
            }
        }

        if (container) {
            const inContainer = container.querySelector(`input[type="${fieldType}"]`);

            if (inContainer) {
                return inContainer;
            }
        }

        return null;
    }

    function resolveElementFromDom(doc, dom, fieldType) {
        if (!dom || !doc) {
            return null;
        }

        const isChoiceField = fieldType === 'radio' || fieldType === 'checkbox';

        if (isChoiceField && dom.name) {
            const byName = queryNativeChoiceInput(doc, fieldType, { name: dom.name });

            if (byName) {
                return byName;
            }
        }

        if (dom.id) {
            const byId = doc.getElementById(dom.id);

            if (byId) {
                if (isChoiceField && !isNativeChoiceInput(byId, fieldType)) {
                    const input = queryNativeChoiceInput(doc, fieldType, {
                        name: dom.name,
                        container: byId,
                    });

                    if (input) {
                        return input;
                    }
                }

                return byId;
            }
        }

        if (dom.name) {
            if (isChoiceField) {
                return queryNativeChoiceInput(doc, fieldType, { name: dom.name });
            }

            return doc.querySelector(`[name="${escapeSelectorValue(dom.name)}"]`);
        }

        if (dom.data_testid) {
            return doc.querySelector(`[data-testid="${escapeSelectorValue(dom.data_testid)}"]`);
        }

        if (dom.data_field_path) {
            const scope = doc.querySelector(`[data-field-path="${escapeSelectorValue(dom.data_field_path)}"]`);

            if (scope) {
                const combobox = scope.querySelector('[role="combobox"]');

                if (combobox) {
                    return combobox;
                }
            }

            return doc.querySelector(`[data-field-path="${escapeSelectorValue(dom.data_field_path)}"]`);
        }

        if (dom.role === 'combobox') {
            const comboboxes = Array.from(doc.querySelectorAll('[role="combobox"]')).filter(isVisible);

            if (comboboxes.length === 1) {
                return comboboxes[0];
            }
        }

        if (fieldType === 'tel' && dom.type === 'tel') {
            return doc.querySelector('input[type="tel"].PhoneInputInput')
                || doc.querySelector('.PhoneInput input[type="tel"]')
                || doc.querySelector('input[type="tel"]');
        }

        if (dom.question_prefix) {
            for (const label of doc.querySelectorAll('label')) {
                if (!label.textContent.trim().startsWith(dom.question_prefix)) {
                    continue;
                }

                if (label.querySelector('input[type="radio"], input[type="checkbox"]')) {
                    continue;
                }

                const block = label.parentElement;
                const input = block?.querySelector(`input[type="${escapeSelectorValue(dom.type || fieldType)}"], textarea, select`);

                if (input) {
                    return input;
                }
            }
        }

        if (dom.placeholder) {
            const byPlaceholder = doc.querySelector(`input[placeholder="${escapeSelectorValue(dom.placeholder)}"]`);

            if (byPlaceholder) {
                return byPlaceholder;
            }
        }

        if (dom.min && dom.type) {
            const byMin = doc.querySelector(`input[type="${escapeSelectorValue(dom.type)}"][min="${escapeSelectorValue(dom.min)}"]`);

            if (byMin) {
                return byMin;
            }
        }

        return null;
    }

    function resolveTargetFromDom(doc, dom, fieldType, dataFieldPath = null) {
        const fieldPath = dataFieldPath || dom?.data_field_path || null;

        if (fieldPath) {
            const scope = doc.querySelector(`[data-field-path="${escapeSelectorValue(fieldPath)}"]`);

            if (scope) {
                const yesNoButtons = queryAshbyYesNoButtons(scope, doc);

                if (yesNoButtons.length >= 2) {
                    return yesNoButtons;
                }

                const combobox = scope.querySelector('[role="combobox"]');

                if (combobox) {
                    return combobox;
                }

                const input = scope.querySelector('input, textarea, select');

                if (input) {
                    return input;
                }
            }
        }

        if (dom?.role === 'listbox' && dom?.id) {
            const listbox = doc.getElementById(dom.id);

            if (listbox?.getAttribute('role') === 'listbox') {
                return listbox;
            }
        }

        if (fieldType === 'radio' || fieldType === 'checkbox') {
            const anchor = resolveElementFromDom(doc, dom, fieldType);

            if (isNativeChoiceInput(anchor, fieldType)) {
                return anchor;
            }
        }

        return resolveElementFromDom(doc, dom, fieldType);
    }

    function valueMatchesAnswer(actual, expected) {
        const actualDigits = normalizePhoneDigits(actual);
        const expectedDigits = normalizePhoneDigits(expected);

        if (actualDigits.length >= 8 && expectedDigits.length >= 8 && actualDigits === expectedDigits) {
            return true;
        }

        const normalizedActual = normalizeOption(actual);
        const normalizedExpected = normalizeOption(expected);

        if (!normalizedExpected) {
            return false;
        }

        if (!normalizedActual) {
            return false;
        }

        if (normalizedActual === normalizedExpected) {
            return true;
        }

        if (normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual)) {
            return true;
        }

        return optionMatchesAnswer(actual, expected);
    }

    function readSimpleFieldValue(element, fieldType) {
        if (!element) {
            return null;
        }

        if (Array.isArray(element)) {
            return readAshbyYesNoSelection(element[0], element[0]?.ownerDocument || document);
        }

        if (element.getAttribute?.('role') === 'combobox') {
            return readReactSelectValue(element);
        }

        if (element.tagName?.toLowerCase() === 'select') {
            const selected = element.selectedOptions?.[0] || element.options?.[element.selectedIndex];

            return (selected?.textContent || selected?.value || '').replace(/\s+/g, ' ').trim() || null;
        }

        if (fieldType === 'textarea' || element.tagName?.toLowerCase() === 'textarea') {
            return element.value?.trim() || null;
        }

        return element.value?.trim() || null;
    }

    function readNativeInputGroupSelection(element, fieldType) {
        const inputs = getGroupInputs(element);
        const checked = inputs.filter((input) => input.checked);

        if (fieldType === 'radio') {
            const selected = checked[0];

            if (!selected) {
                return null;
            }

            return getOptionLabel(selected) || selected.value || null;
        }

        if (fieldType === 'checkbox') {
            return checked
                .map((input) => getOptionLabel(input) || input.value)
                .filter(Boolean);
        }

        return null;
    }

    function verifyFieldApplied(target, fieldType, answer, options = {}) {
        if (Array.isArray(target)) {
            if (target[0]?.tagName?.toLowerCase() === 'button') {
                const selection = readAshbyYesNoSelection(
                    findAshbyYesNoScope(options.root || document, {
                        dataFieldPath: options.dataFieldPath || null,
                        anchor: target[0],
                    }),
                    options.root || document,
                );

                return optionMatchesAnswer(selection, answer);
            }

            if (target[0]?.getAttribute?.('role') === 'checkbox') {
                const selected = target
                    .filter((checkbox) => checkbox.getAttribute('aria-checked') === 'true')
                    .map((checkbox) => (checkbox.textContent || checkbox.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
                    .filter(Boolean);

                if (fieldType === 'checkbox') {
                    const expected = String(answer).split(/[,;|]/).map((part) => part.trim()).filter(Boolean);

                    return expected.every((part) => selected.some((value) => optionMatchesAnswer(value, part)));
                }

                return selected.some((value) => optionMatchesAnswer(value, answer));
            }

            const selectedRoleRadio = target.find((radio) => radio.getAttribute('aria-checked') === 'true');

            if (selectedRoleRadio) {
                const optionText = (selectedRoleRadio.textContent || selectedRoleRadio.getAttribute('aria-label') || '')
                    .replace(/\s+/g, ' ')
                    .trim();

                return optionMatchesAnswer(optionText, answer);
            }
        }

        if (target?.getAttribute?.('role') === 'listbox') {
            const selected = Array.from(target.querySelectorAll('[role="option"]'))
                .find((option) => option.getAttribute('aria-selected') === 'true');

            if (selected) {
                const optionText = (selected.textContent || selected.getAttribute('aria-label') || '')
                    .replace(/\s+/g, ' ')
                    .trim();

                return optionMatchesAnswer(optionText, answer);
            }

            return false;
        }

        if (fieldType === 'radio' || fieldType === 'checkbox') {
            if (target?.type === 'radio' || target?.type === 'checkbox') {
                const selection = readNativeInputGroupSelection(target, fieldType);

                if (fieldType === 'checkbox' && Array.isArray(selection)) {
                    const expected = String(answer).split(/[,;|]/).map((part) => part.trim()).filter(Boolean);

                    return expected.every((part) => selection.some((value) => optionMatchesAnswer(value, part)));
                }

                return optionMatchesAnswer(selection, answer);
            }
        }

        const actual = readSimpleFieldValue(target, fieldType);

        return valueMatchesAnswer(actual, answer);
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

    function isIntlTelInput(element) {
        if (!element || element.type !== 'tel') {
            return false;
        }

        return element.closest('.iti') !== null
            || element.dataset?.controller === 'phone-input'
            || element.hasAttribute('data-phone-input-country-value');
    }

    function normalizePhoneDigits(value) {
        return String(value || '').replace(/[^\d+]/g, '');
    }

    function isPhoneDialCodeOnlyValue(value) {
        const digits = normalizePhoneDigits(value);

        if (!digits.startsWith('+')) {
            return false;
        }

        return digits.slice(1).length <= 3;
    }

    function isReactPhoneCountrySelect(element) {
        if (element.tagName?.toLowerCase() !== 'select') {
            return false;
        }

        return element.classList?.contains('PhoneInputCountrySelect')
            || element.closest('.PhoneInputCountry') !== null
            || /phone number country/i.test(element.getAttribute('aria-label') || '');
    }

    function isReactPhoneNumberInput(element) {
        if (!element || element.type !== 'tel') {
            return false;
        }

        return element.classList?.contains('PhoneInputInput')
            || element.closest('.PhoneInput') !== null;
    }

    const PHONE_CALLING_CODE_TO_ISO = [
        ['971', 'AE'], ['966', 'SA'], ['972', 'IL'], ['886', 'TW'], ['852', 'HK'],
        ['353', 'IE'], ['351', 'PT'], ['358', 'FI'], ['420', 'CZ'], ['421', 'SK'],
        ['44', 'GB'], ['49', 'DE'], ['33', 'FR'], ['39', 'IT'], ['34', 'ES'],
        ['61', 'AU'], ['64', 'NZ'], ['91', 'IN'], ['81', 'JP'], ['86', 'CN'],
        ['55', 'BR'], ['52', 'MX'], ['27', 'ZA'], ['65', 'SG'], ['31', 'NL'],
        ['32', 'BE'], ['41', 'CH'], ['46', 'SE'], ['47', 'NO'], ['45', 'DK'],
        ['48', 'PL'], ['1', 'US'],
    ];

    function resolveCountryIsoFromE164(e164, countrySelect) {
        if (!countrySelect || !String(e164).trim().startsWith('+')) {
            return null;
        }

        const digits = String(e164).replace(/\D/g, '');
        const options = new Set(Array.from(countrySelect.options).map((option) => option.value));

        for (const [code, iso] of PHONE_CALLING_CODE_TO_ISO) {
            if (digits.startsWith(code) && options.has(iso)) {
                return iso;
            }
        }

        return null;
    }

    async function setReactPhoneNumberInputValue(element, value) {
        const stringValue = String(value).trim();

        if (!stringValue) {
            return false;
        }

        const widget = element.closest('.PhoneInput');
        const countrySelect = widget?.querySelector('.PhoneInputCountrySelect');
        const countryIso = countrySelect ? resolveCountryIsoFromE164(stringValue, countrySelect) : null;

        if (countrySelect && countryIso) {
            countrySelect.value = countryIso;
            countrySelect.dispatchEvent(new Event('change', { bubbles: true }));
        }

        element.focus();
        dispatchPointerClick(element);

        const filled = fillReactTextControl(element, stringValue);

        if (filled) {
            heuristicsLog('info', 'apply.phone', 'react-phone-number-input filled', {
                valuePreview: stringValue.slice(0, 80),
                countryIso,
            });
        }

        return filled;
    }

    function readIntlTelInputInstance(element) {
        const view = element.ownerDocument?.defaultView || window;

        return view.intlTelInputGlobals?.getInstance?.(element) ?? null;
    }

    async function setIntlTelInputValue(element, value) {
        const stringValue = String(value).trim();

        if (!stringValue) {
            return false;
        }

        element.focus();
        dispatchPointerClick(element);

        for (let attempt = 0; attempt < 2; attempt += 1) {
            const iti = readIntlTelInputInstance(element);

            if (iti?.setNumber) {
                iti.setNumber(stringValue);
                element.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertFromPaste',
                    data: stringValue,
                }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

                const entered = normalizePhoneDigits(iti.getNumber?.() || element.value);
                const expected = normalizePhoneDigits(stringValue);

                if (entered.length >= Math.min(expected.length, 8)) {
                    heuristicsLog('info', 'apply.phone', 'intl-tel-input filled', {
                        valuePreview: stringValue.slice(0, 80),
                        attempt: attempt + 1,
                    });

                    return true;
                }
            }

            if (attempt === 0) {
                await sleep(40);
            }
        }

        fillReactTextControl(element, stringValue);

        heuristicsLog('info', 'apply.phone', 'intl-tel-input fallback to text fill', {
            valuePreview: stringValue.slice(0, 80),
        });

        return valueMatchesAnswer(element.value, stringValue);
    }

    async function setFieldValue(element, value) {
        if (!element || value === null || value === undefined || value === '') {
            heuristicsLog('warn', 'apply.setFieldValue', 'setFieldValue skipped - empty', {});

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
            const filled = await setAshbyComboboxValue(element, value);

            return filled && verifyFieldApplied(element, 'select', value);
        }

        if (element.type === 'tel' && isReactPhoneNumberInput(element)) {
            return setReactPhoneNumberInputValue(element, value);
        }

        if (element.type === 'tel' && isIntlTelInput(element)) {
            return setIntlTelInputValue(element, value);
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

            return verifyFieldApplied(element, 'select', value);
        }

        if (element.type === 'checkbox' || element.type === 'radio') {
            return setGroupValue(element, value);
        }

        if (tag === 'fieldset' || tag === 'div') {
            const choiceInput = element.querySelector('input[type="checkbox"], input[type="radio"]');

            if (choiceInput) {
                return setGroupValue(choiceInput, value);
            }
        }

        const filled = fillReactTextControl(element, value);

        heuristicsLog(filled ? 'info' : 'warn', 'apply.setFieldValue', filled ? 'React text control filled' : 'React text control fill did not stick', {
            tag,
            valuePreview: String(value).slice(0, 80),
            actualPreview: String(element.value || '').slice(0, 80),
        });

        return filled;
    }

    function collectFillableElements(root) {
        return Array.from(root.querySelectorAll('input, textarea, select')).filter((element) => {
            if (isAshbyHiddenYesNoInput(element)) {
                return false;
            }

            if (isGreenhouseHiddenSelectInput(element)) {
                return false;
            }

            if (isReactPhoneCountrySelect(element)) {
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
                // Cross-origin iframe - skip.
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
                // Cross-origin iframe - skip.
            }
        }
    }

    function looksLikeApplicationForm() {
        let score = 0;

        forEachIframeDocument((doc) => {
            if (isMicro1ApplicationQuestionStep(doc)) {
                score += 3;
            }

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
        if (isMicro1ApplicationQuestionStep(root)) {
            return true;
        }

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

        if (element.getAttribute?.('role') === 'combobox') {
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
            if (element.type === 'tel' && isPhoneDialCodeOnlyValue(element.value)) {
                // Treat dial-code-only phone widgets as unfilled.
            } else if (isMicro1DefaultNumberValue(element)) {
                // micro1 steppers and hourly rate inputs ship with placeholder default "1".
            } else {
                return false;
            }
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
        if (!answer || !isTargetConnected(target)) {
            heuristicsLog('warn', 'apply.ref', 'applyAnswerForTarget skipped - missing answer or detached target', {
                fieldType,
                hasTarget: Boolean(target),
                connected: isTargetConnected(target),
            });

            return false;
        }

        heuristicsLog('debug', 'apply.ref', 'applyAnswerForTarget', {
            fieldType,
            dataFieldPath: options.data_field_path || null,
            answerPreview: String(answer).slice(0, 80),
            targetRole: Array.isArray(target) ? target[0]?.getAttribute?.('role') : target?.getAttribute?.('role'),
            targetTag: Array.isArray(target) ? target[0]?.tagName : target?.tagName,
        });

        let applied = false;

        if (Array.isArray(target)) {
            if (target[0]?.tagName?.toLowerCase() === 'button') {
                applied = await setAshbyYesNoValue(
                    resolveAshbyYesNoButtons(target, options.data_field_path, root),
                    answer,
                    { dataFieldPath: options.data_field_path, root },
                );
            } else if (target[0]?.getAttribute?.('role') === 'checkbox') {
                applied = setRoleCheckboxGroupValue(target, answer);
            } else {
                applied = setRoleRadioGroupValue(target, answer);
            }
        } else if (target?.getAttribute?.('role') === 'listbox') {
            applied = setRoleListboxValue(target, answer);
        } else if (target?.getAttribute?.('role') === 'combobox') {
            applied = await setAshbyComboboxValue(target, answer);
        } else if (target.type === 'radio' || target.type === 'checkbox') {
            applied = setGroupValue(target, answer);
        } else if ((fieldType === 'radio' || fieldType === 'checkbox') && target.querySelector?.(`input[type="${fieldType}"]`)) {
            applied = setGroupValue(target.querySelector(`input[type="${fieldType}"]`), answer);
        } else {
            applied = await setFieldValue(target, answer);
        }

        if (!applied) {
            return false;
        }

        if (Array.isArray(target) && target[0]?.tagName?.toLowerCase() === 'button') {
            return applied;
        }

        return verifyFieldApplied(target, fieldType, answer, {
            root,
            dataFieldPath: options.data_field_path || null,
        });
    }

    function isQuickDraftEligible(element, root = document) {
        if (!(element instanceof Element)) {
            return false;
        }

        if (element.closest('#autocvapply-portal-bar, #autocvapply-quick-draft, [data-autocvapply-ui]')) {
            return false;
        }

        const tag = element.tagName?.toLowerCase();
        const type = (element.type || '').toLowerCase();
        const role = element.getAttribute?.('role');

        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && role !== 'combobox' && role !== 'listbox') {
            return false;
        }

        if (['hidden', 'file', 'password', 'submit', 'button', 'reset', 'image', 'search'].includes(type)) {
            return false;
        }

        if (element.closest('header, nav, [role="search"]')
            && !element.closest('form, [role="form"], [class*="application"], [data-field-path]')) {
            return false;
        }

        const identity = [element.name, element.id].filter(Boolean).join(' ').toLowerCase().trim();

        if (/^(search|q|query|s)$/.test(identity)) {
            return false;
        }

        if (!elementNeedsDraft(element)) {
            return false;
        }

        return frameHasApplicationForm(root)
            || looksLikeApplicationForm()
            || Boolean(element.closest(
                'form, [role="form"], [class*="application"], [class*="job"], [data-field-path], .ashby-application-form-field-entry',
            ));
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
        isQuickDraftEligible,
        isTargetConnected,
        looksLikeApplicationForm,
        resolveTargetFromDom,
        setFieldValue,
        setGroupValue,
        setRoleRadioGroupValue,
        valueMatchesAnswer,
        verifyFieldApplied,
    };
})();
