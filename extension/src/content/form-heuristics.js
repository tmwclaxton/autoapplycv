/**
 * Mechanical DOM helpers for job application forms: label discovery, ref-based fill, iframe traversal.
 *
 * Content-script form modules (incremental split under extension/src/content/form/):
 * - phone-country-listbox (Recruitee PhoneInput) - next extraction target
 * - labels / fill / field-scan - shared ATS logic vs platform adapters in *-auto-apply.js
 */
var AutoCVApplyFormHeuristics = (() => {
    function heuristicsLog(level, phase, message, data) {
        if (typeof AutoCVApplyDebugLog === 'undefined') {
            return;
        }

        const logger =
            AutoCVApplyDebugLog[
                `log${level.charAt(0).toUpperCase()}${level.slice(1)}`
            ];

        if (typeof logger === 'function') {
            logger('content', phase, message, data);
        }
    }

    /**
     * Strip screen-reader / visual "required" markers that ATS themes glue onto
     * labels (e.g. Teamtailor: Vorname*<span class="sr-only">Erforderlich</span>
     * becomes "vornameerforderlich" after asterisk removal without this step).
     *
     * @param {string} text
     * @returns {string}
     */
    function stripRequiredMarkerText(text) {
        return (
            String(text || '')
                .replace(
                    /\b(erforderlich|required|obligatoire|obbligatorio|verplicht|obrigat[oó]rio|wymagane|obligatorio)\b/gi,
                    ' ',
                )
                // Glued suffix after removing "*" between label and sr-only marker.
                .replace(
                    /([a-z0-9äöüáéíóúàèìòùâêîôûßñç])(erforderlich|required|obligatoire|obbligatorio|verplicht|obrigat[oó]rio|wymagane|obligatorio)\b/gi,
                    '$1',
                )
        );
    }

    function stripWorkableSvgFallbackNoise(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .replace(/svgs not supported by this browser\.\s*/gi, '')
            .trim();
    }

    function normalize(text) {
        return stripRequiredMarkerText(
            stripWorkableSvgFallbackNoise(text || '')
                .replace(/[\u2731*]/g, '')
                .replace(/\bchoose file\b/gi, '')
                .trim(),
        )
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function dedupeRepeatedLabelTokens(label) {
        const tokens = String(label || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (tokens.length <= 1) {
            return String(label || '').trim();
        }

        for (
            let phraseLen = 1;
            phraseLen <= Math.floor(tokens.length / 2);
            phraseLen += 1
        ) {
            if (tokens.length % phraseLen !== 0) {
                continue;
            }

            const phrase = tokens.slice(0, phraseLen);
            let repeats = true;

            for (
                let index = phraseLen;
                index < tokens.length;
                index += phraseLen
            ) {
                if (
                    tokens.slice(index, index + phraseLen).join(' ') !==
                    phrase.join(' ')
                ) {
                    repeats = false;
                    break;
                }
            }

            if (repeats) {
                return phrase.join(' ');
            }
        }

        return String(label || '').trim();
    }

    function isGlassdoorNavSearchInput(element) {
        if (!/glassdoor\.(com|co\.uk)$/i.test(window.location.hostname)) {
            return false;
        }

        const testId = element?.getAttribute?.('data-test') || '';

        return (
            testId === 'keyword-search-input' ||
            testId === 'location-search-input'
        );
    }

    function isIndeedJobsSearchPage(doc = document) {
        try {
            const { hostname, pathname } = doc.location || {};

            if (hostname?.includes('smartapply.indeed.com')) {
                return false;
            }

            return (
                /(^|\.)indeed\.(com|co\.uk)$/i.test(hostname || '') &&
                /\/jobs\b/i.test(pathname || '')
            );
        } catch {
            return false;
        }
    }

    /**
     * Job-board keyword/location search chrome on results pages - not application questions.
     */
    function isJobBoardNavSearchInput(element) {
        if (!element || element.tagName?.toLowerCase() !== 'input') {
            return false;
        }

        if (isGlassdoorNavSearchInput(element)) {
            return true;
        }

        const doc = element.ownerDocument || document;
        const hostname = doc.location?.hostname || '';
        const pathname = doc.location?.pathname || '';

        if (
            /linkedin\.com$/i.test(hostname) &&
            /\/jobs\/search/i.test(pathname)
        ) {
            if (
                element.closest?.('.jobs-search-box') ||
                element.classList?.contains('jobs-search-box__text-input') ||
                element.classList?.contains(
                    'jobs-search-global-typeahead__input',
                ) ||
                element.hasAttribute?.(
                    'data-job-search-box-keywords-input-trigger',
                ) ||
                element.hasAttribute?.(
                    'data-job-search-box-location-input-trigger',
                )
            ) {
                return true;
            }
        }

        if (isIndeedJobsSearchPage(doc)) {
            const id = String(element.id || '').toLowerCase();
            const name = String(element.name || '').toLowerCase();
            const testId = String(
                element.getAttribute?.('data-testid') || '',
            ).toLowerCase();

            if (
                id === 'text-input-what' ||
                id === 'text-input-where' ||
                testId.includes('what') ||
                testId.includes('where') ||
                (name === 'q' && element.closest?.('form'))
            ) {
                return true;
            }
        }

        if (/totaljobs\.com$/i.test(hostname)) {
            if (
                element.closest?.(
                    '#app-searchBar, [data-atx-component="searchBar"], .header-searchbar-container',
                )
            ) {
                return true;
            }
        }

        if (/reed\.co\.uk$/i.test(hostname) && /\/jobs\b/i.test(pathname)) {
            const testId = String(
                element.getAttribute?.('data-qa') || '',
            ).toLowerCase();

            if (
                testId === 'searchkeywords' ||
                testId === 'searchlocation' ||
                element.closest?.(
                    '[data-qa="searchbox"], [data-qa="search-form"], form[action*="/jobs/"]',
                )
            ) {
                return true;
            }
        }

        if (
            /(^|\.)cv-library\.co\.uk$/i.test(hostname) &&
            /\/jobs\b/i.test(pathname)
        ) {
            if (
                element.closest?.(
                    '#keywords, .search-form, [data-qa="search-keywords"], header form',
                )
            ) {
                return true;
            }
        }

        if (
            /simplyhired\.(com|co\.uk)$/i.test(hostname) &&
            /\/search\b/i.test(pathname)
        ) {
            if (
                element.closest?.(
                    '#qc-start, .SearchBox, form[action*="/search"]',
                )
            ) {
                return true;
            }
        }

        return false;
    }

    function isIndeedApplyPage(root = document) {
        const doc =
            root.ownerDocument ||
            root.defaultView?.document ||
            (root.nodeType === 9 ? root : document);

        try {
            const { hostname, pathname } = doc.location || {};

            if (hostname?.includes('smartapply.indeed.com')) {
                return true;
            }

            if (/indeedapply/i.test(pathname || '')) {
                return true;
            }

            const docTitle = doc.title || '';

            if (/job application form/i.test(docTitle)) {
                return true;
            }

            if (
                /glassdoor\.(com|co\.uk)$/i.test(hostname) &&
                doc.querySelector?.('iframe[title*="Job application form"]')
            ) {
                return true;
            }

            return false;
        } catch {
            return false;
        }
    }

    function getIndeedLocationFieldLabel(element) {
        const testId = element?.getAttribute?.('data-testid') || '';

        if (
            !testId.startsWith('location-fields-') ||
            !testId.endsWith('-input')
        ) {
            return '';
        }

        const doc = element.ownerDocument || document;
        const labelTestId = testId.replace(/-input$/, '-label');
        const labelSpan = doc.querySelector(`[data-testid="${labelTestId}"]`);

        if (labelSpan?.textContent?.trim()) {
            return dedupeRepeatedLabelTokens(normalize(labelSpan.textContent));
        }

        return '';
    }

    function labelsMatch(left, right) {
        const a = normalize(left);
        const b = normalize(right);

        if (a === b) {
            return true;
        }

        if (
            a.length >= 12 &&
            b.length >= 12 &&
            (a.includes(b) || b.includes(a))
        ) {
            return true;
        }

        const prefixLength = Math.min(48, a.length, b.length);

        return (
            prefixLength >= 12 &&
            a.slice(0, prefixLength) === b.slice(0, prefixLength)
        );
    }

    function normalizeOption(text) {
        const stripped = String(text || '').replace(
            /^svgs not supported by this browser\.\s*/i,
            '',
        );

        return normalize(stripped)
            .replace(/[^\w\s>\/-]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const PLACEHOLDER_SELECT_OPTION_PATTERN =
        /^(select an option|choose an option|choose one|please select|please choose|select\s*\.\.\.?|--)$/i;

    const PHONE_CALLING_CODE_TO_ISO = [
        ['971', 'AE'],
        ['966', 'SA'],
        ['972', 'IL'],
        ['886', 'TW'],
        ['852', 'HK'],
        ['353', 'IE'],
        ['351', 'PT'],
        ['358', 'FI'],
        ['420', 'CZ'],
        ['421', 'SK'],
        ['44', 'GB'],
        ['49', 'DE'],
        ['33', 'FR'],
        ['39', 'IT'],
        ['34', 'ES'],
        ['61', 'AU'],
        ['64', 'NZ'],
        ['91', 'IN'],
        ['81', 'JP'],
        ['86', 'CN'],
        ['55', 'BR'],
        ['52', 'MX'],
        ['27', 'ZA'],
        ['65', 'SG'],
        ['31', 'NL'],
        ['32', 'BE'],
        ['41', 'CH'],
        ['46', 'SE'],
        ['47', 'NO'],
        ['45', 'DK'],
        ['48', 'PL'],
        ['1', 'US'],
    ];

    function isPlaceholderSelectOption(option) {
        if (!option) {
            return true;
        }

        const text = normalize(option.textContent);
        const value = normalize(option.value);

        return (
            PLACEHOLDER_SELECT_OPTION_PATTERN.test(text) ||
            PLACEHOLDER_SELECT_OPTION_PATTERN.test(value) ||
            value === ''
        );
    }

    function isSelectMeaningfullyFilled(select) {
        if (select?.tagName?.toLowerCase() !== 'select') {
            return Boolean(select?.value?.trim());
        }

        const selected =
            select.selectedOptions?.[0] ||
            select.options?.[select.selectedIndex];

        return Boolean(selected) && !isPlaceholderSelectOption(selected);
    }

    function extractDialCodeFromPhoneValue(value) {
        const normalized = String(value || '').replace(/\s/g, '');

        if (!normalized.startsWith('+')) {
            return '';
        }

        const digits = normalized.replace(/\D/g, '');
        const sortedCodes = [...PHONE_CALLING_CODE_TO_ISO].sort(
            (left, right) => right[0].length - left[0].length,
        );

        for (const [code] of sortedCodes) {
            if (digits.startsWith(code)) {
                return code;
            }
        }

        return '';
    }

    function resolveIsoFromDialCodeDigits(dialCodeDigits) {
        const entry = PHONE_CALLING_CODE_TO_ISO.find(
            ([code]) => code === dialCodeDigits,
        );

        return entry?.[1] || '';
    }

    function parseIndeedPhoneParts(value) {
        const normalized = String(value || '').replace(/\s/g, '');
        const digits = normalized.replace(/\D/g, '');

        if (!digits) {
            return { iso: '', dialCodeDigits: '', nationalDigits: '' };
        }

        // National-only values (no leading +) must not be treated as E.164 -
        // otherwise 7837… is misread as dial code 7 (Russia) and UK country never sets.
        if (!normalized.startsWith('+')) {
            return {
                iso: '',
                dialCodeDigits: '',
                nationalDigits: digits.replace(/^0+/, ''),
            };
        }

        const dialCodeDigits = extractDialCodeFromPhoneValue(normalized);
        const iso = resolveIsoFromDialCodeDigits(dialCodeDigits);
        let nationalDigits =
            dialCodeDigits && digits.startsWith(dialCodeDigits)
                ? digits.slice(dialCodeDigits.length)
                : digits;

        nationalDigits = nationalDigits.replace(/^0+/, '');

        return { iso, dialCodeDigits, nationalDigits };
    }

    function findSelectOptionMatch(options, value) {
        const validOptions = options.filter(
            (option) => !isPlaceholderSelectOption(option),
        );
        const normalizedValue = String(value).toLowerCase().trim();

        if (!normalizedValue || validOptions.length === 0) {
            return null;
        }

        let match = validOptions.find((option) => {
            const text = option.textContent.trim().toLowerCase();
            const val = option.value.toLowerCase();

            return val === normalizedValue || text === normalizedValue;
        });

        if (!match && normalizedValue.includes('@')) {
            match = validOptions.find((option) => {
                const text = option.textContent.trim().toLowerCase();
                const val = option.value.toLowerCase();

                return (
                    val === normalizedValue ||
                    text === normalizedValue ||
                    val.includes(normalizedValue) ||
                    normalizedValue.includes(val)
                );
            });
        }

        if (!match && /^\+?\d/.test(normalizedValue)) {
            const dialDigits = extractDialCodeFromPhoneValue(
                normalizedValue.startsWith('+')
                    ? normalizedValue
                    : `+${normalizedValue.replace(/\D/g, '')}`,
            );

            if (dialDigits) {
                const dialPattern = new RegExp(
                    `\\(\\+${dialDigits}\\)|\\+${dialDigits}\\b`,
                );

                match = validOptions.find((option) => {
                    const text = option.textContent || '';
                    const val = option.value || '';

                    return dialPattern.test(text) || dialPattern.test(val);
                });
            }
        }

        if (!match) {
            match = validOptions.find((option) => {
                const text = option.textContent.trim().toLowerCase();
                const val = option.value.toLowerCase();

                return (
                    text.includes(normalizedValue) ||
                    normalizedValue.includes(text) ||
                    val.includes(normalizedValue) ||
                    normalizedValue.includes(val)
                );
            });
        }

        if (!match) {
            match = validOptions.find((option) => {
                const text = (option.textContent || '')
                    .replace(/\s+/g, ' ')
                    .trim();
                const val = String(option.value || '');

                return (
                    optionMatchesAnswer(text, value) ||
                    optionMatchesAnswer(val, value)
                );
            });
        }

        return match || null;
    }

    function isSplCheckboxInput(input) {
        if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') {
            return false;
        }

        return (
            input.classList.contains('c-spl-checkbox__input') ||
            input.closest('spl-checkbox') !== null
        );
    }

    function escapeSelectorValue(value) {
        if (typeof CSS !== 'undefined' && CSS.escape) {
            return CSS.escape(value);
        }

        return String(value).replace(/"/g, '\\"');
    }

    function isMicro1ApplicationPage(doc = document) {
        const hostname =
            doc?.location?.hostname ||
            (typeof location !== 'undefined' ? location.hostname : '');

        return /(?:^|\.)micro1\.ai$/i.test(hostname);
    }

    function getMicro1QuestionBlock(element) {
        if (!element?.closest) {
            return null;
        }

        let node = element.parentElement;

        while (node) {
            const label = node.querySelector(':scope > label');

            if (
                label &&
                !label.querySelector(
                    'input[type="radio"], input[type="checkbox"]',
                ) &&
                /^Q\d+\./i.test((label.textContent || '').trim())
            ) {
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
        return (
            element?.type === 'radio' && /^yes_no_/i.test(element.name || '')
        );
    }

    function isMicro1DefaultNumberValue(element) {
        if (
            !isMicro1ApplicationPage(element.ownerDocument || document) ||
            element.type !== 'number'
        ) {
            return false;
        }

        if (String(element.value || '').trim() !== '1') {
            return false;
        }

        return getMicro1QuestionLabel(element).length >= 3;
    }

    function isMicro1ApplicationQuestionStep(root = document) {
        const doc =
            root.ownerDocument ||
            root.defaultView?.document ||
            (root.nodeType === 9 ? root : document);

        if (!isMicro1ApplicationPage(doc)) {
            return false;
        }

        return Array.from(root.querySelectorAll('label')).some(
            (label) =>
                /^Q\d+\./i.test((label.textContent || '').trim()) &&
                !label.querySelector('input[type="radio"]'),
        );
    }

    function getIndeedQualificationQuestionRoot(element) {
        const container = element?.closest?.(
            'div[data-testid^="testid-qualques--select-"]',
        );

        if (container) {
            return container;
        }

        const testId = element?.getAttribute?.('data-testid') || '';

        if (testId.startsWith('testid-qualques--select-')) {
            return element.closest('div[data-testid^="testid-qualques--"]');
        }

        return null;
    }

    function isIndeedQuestionFieldRoot(element) {
        const testId = element?.getAttribute?.('data-testid') || '';

        if (/^input-q_[a-f0-9]+$/i.test(testId)) {
            return true;
        }

        return (
            element?.tagName?.toLowerCase() === 'div' &&
            testId.startsWith('testid-qualques--select-')
        );
    }

    function getIndeedQualificationQuestionLabel(element) {
        const root = getIndeedQualificationQuestionRoot(element);

        if (!root) {
            return '';
        }

        const markup = root.querySelector(
            '[data-testid$="-label"] [data-testid="safe-markup"]',
        );

        if (markup?.textContent?.trim()) {
            return dedupeRepeatedLabelTokens(normalize(markup.textContent));
        }

        const labelSpan = root.querySelector('[data-testid$="-label"]');

        if (labelSpan?.textContent?.trim()) {
            return dedupeRepeatedLabelTokens(normalize(labelSpan.textContent));
        }

        return '';
    }

    function getIndeedQuestionFieldRoot(element) {
        let node = element;

        while (node) {
            if (isIndeedQuestionFieldRoot(node)) {
                return node;
            }

            node = node.parentElement;
        }

        return null;
    }

    function getQuestionContainer(element) {
        const micro1Block = getMicro1QuestionBlock(element);

        if (micro1Block) {
            return micro1Block;
        }

        const indeedQuestionRoot = getIndeedQuestionFieldRoot(element);

        if (indeedQuestionRoot) {
            return indeedQuestionRoot;
        }

        const leverQuestion = getLeverApplicationQuestion(element);

        if (leverQuestion) {
            return leverQuestion;
        }

        const greenhouseField = element.closest('.field-wrapper');

        if (
            greenhouseField &&
            isGreenhouseApplyHost(element.ownerDocument || document)
        ) {
            return greenhouseField;
        }

        return element.closest(
            'fieldset[data-testid^="input-q_"], [data-testid^="input-q_"]:not(input):not(textarea):not(select), .ia-Questions-item, fieldset[name^="q_"], fieldset, [data-field-path], .ashby-application-form-field-entry, .input-row, .apply-flow-block',
        );
    }

    /**
     * Gravity Forms address/name/date compounds share one fieldset legend.
     * Prefer the per-input sublabel or placeholder so each control stays distinct.
     */
    function getComplexSubfieldLabel(element) {
        if (!element?.closest) {
            return '';
        }

        const complex = element.closest(
            '.ginput_complex, .ginput_container_address, .ginput_container_name, .ginput_container_date, .ginput_container_email',
        );

        if (!complex) {
            return '';
        }

        const doc = element.ownerDocument || document;
        const id = element.getAttribute?.('id');

        if (id) {
            const escapedId =
                typeof CSS !== 'undefined' && CSS.escape
                    ? CSS.escape(id)
                    : id.replace(/"/g, '\\"');
            const explicit = doc.querySelector(`label[for="${escapedId}"]`);
            const explicitText = explicit?.textContent
                ? normalize(explicit.textContent)
                : '';

            if (explicitText.length >= 2) {
                return explicitText;
            }
        }

        if (element.labels?.length) {
            const labelText = normalize(element.labels[0].textContent || '');

            if (labelText.length >= 2) {
                return labelText;
            }
        }

        const placeholder = normalize(
            element.getAttribute?.('placeholder') || '',
        );

        if (placeholder.length >= 2) {
            return placeholder;
        }

        const ariaLabel = normalize(element.getAttribute?.('aria-label') || '');

        if (ariaLabel.length >= 2) {
            return ariaLabel;
        }

        // Gravity Forms address/name inputs use input_N.1 .. input_N.5 when sublabels are absent.
        const nameHint = String(
            element.getAttribute?.('name') || element.name || '',
        );
        const addressSuffix = nameHint.match(/\.([1-6])$/);

        if (addressSuffix && complex.matches?.('.ginput_container_address')) {
            const addressLabels = {
                1: 'Street Address',
                2: 'Address Line 2',
                3: 'City',
                4: 'State',
                5: 'ZIP Code',
                6: 'Country',
            };
            const mapped = addressLabels[addressSuffix[1]];

            if (mapped) {
                return normalize(mapped);
            }
        }

        const nameSuffix = nameHint.match(/\.([1-8])$/);

        if (nameSuffix && complex.matches?.('.ginput_container_name')) {
            const nameLabels = {
                2: 'Prefix',
                3: 'First',
                4: 'Middle',
                6: 'Last',
                8: 'Suffix',
            };
            const mapped = nameLabels[nameSuffix[1]];

            if (mapped) {
                return normalize(mapped);
            }
        }

        return '';
    }

    function draftableIdentityKey(
        element,
        label,
        { dataFieldPath = null, groupName = null } = {},
    ) {
        if (dataFieldPath) {
            return `path:${dataFieldPath}`;
        }

        if (groupName) {
            return `group:${groupName}`;
        }

        if (element?.id) {
            return `id:${element.id}`;
        }

        if (element?.name) {
            return `name:${element.name}:${(element.type || element.tagName || '').toLowerCase()}`;
        }

        return `label:${label}`;
    }

    function getAshbyFieldEntry(element) {
        return element.closest(
            '[data-field-path], .ashby-application-form-field-entry',
        );
    }

    function getAshbyQuestionTitle(element) {
        const entry = getAshbyFieldEntry(element);

        if (!entry) {
            return '';
        }

        const title = entry.querySelector(
            '.ashby-application-form-question-title',
        );

        return title?.textContent ? normalize(title.textContent) : '';
    }

    function getLeverApplicationQuestion(element) {
        return (
            element?.closest?.(
                'li.application-question, .application-question, li.application-additional, .application-additional',
            ) || null
        );
    }

    /**
     * Lever posts use .application-label (often with nested .text) beside the control.
     * Prefer that over the wrapping <label> textContent, which includes options and upload UI.
     */
    function getLeverQuestionLabel(element) {
        const question = getLeverApplicationQuestion(element);

        if (!question) {
            return '';
        }

        const labelEl = question.querySelector(
            ':scope > label > .application-label, :scope > .application-label, .application-label',
        );

        if (!labelEl) {
            return '';
        }

        const textEl = labelEl.querySelector('.text');
        const raw = (textEl || labelEl).textContent || '';

        return normalize(raw);
    }

    function isLeverLocationInput(element) {
        if (!element || !isLeverJobsHost(element.ownerDocument || document)) {
            return false;
        }

        return (
            element.id === 'location-input' ||
            element.classList?.contains('location-input')
        );
    }

    async function setLeverLocationValue(element, value) {
        const stringValue = String(value).trim();

        if (!stringValue) {
            return false;
        }

        const fieldRoot = element.closest('.application-field');
        const dropdown = fieldRoot?.querySelector('.dropdown-container');
        const selectedHidden = fieldRoot?.querySelector(
            '#selected-location, input[name="selectedLocation"]',
        );
        const city = stringValue.split(',')[0].trim() || stringValue;
        const queries = [
            ...new Set(
                [
                    stringValue,
                    city,
                    /united kingdom|\buk\b/i.test(stringValue)
                        ? `${city}, United Kingdom`
                        : '',
                    /england|scotland|wales/i.test(stringValue)
                        ? `${city}, United Kingdom`
                        : '',
                ].filter(Boolean),
            ),
        ];

        const readVisibleResults = () =>
            Array.from(
                fieldRoot?.querySelectorAll('.dropdown-results > *') || [],
            ).filter(
                (node) =>
                    isVisible(node) &&
                    normalize(node.textContent || '').length >= 2,
            );

        const noResultsVisible = () => {
            const empty = fieldRoot?.querySelector('.dropdown-no-results');

            return Boolean(
                empty &&
                    isVisible(empty) &&
                    /no location found/i.test(empty.textContent || ''),
            );
        };

        for (const query of queries) {
            // Do not use fillReactTextControl here - it blurs and cancels Lever's
            // async geocomplete before dropdown results can appear.
            element.focus();
            dispatchPointerClick(element);
            fillTextControlInstant(element, query);
            element.dispatchEvent(
                new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertText',
                    data: query,
                }),
            );
            element.dispatchEvent(
                new KeyboardEvent('keyup', {
                    key: 'Unidentified',
                    bubbles: true,
                }),
            );

            if (dropdown) {
                dropdown.style.display = 'block';
            }

            let results = [];

            for (let attempt = 0; attempt < 10; attempt += 1) {
                await sleep(attempt === 0 ? 200 : 150);
                results = readVisibleResults();

                if (results.length > 0 || noResultsVisible()) {
                    break;
                }
            }

            // Instant fill sometimes skips Lever's listener; retry with fast typing.
            if (results.length === 0 && !noResultsVisible()) {
                element.focus();
                setNativeValue(element, '');
                element.dispatchEvent(
                    new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        inputType: 'deleteContentBackward',
                    }),
                );
                let typed = '';

                for (const char of query) {
                    typed += char;
                    dispatchInsertedCharacter(element, char, typed);
                    await sleep(12);
                }

                for (let attempt = 0; attempt < 10; attempt += 1) {
                    await sleep(150);
                    results = readVisibleResults();

                    if (results.length > 0 || noResultsVisible()) {
                        break;
                    }
                }
            }

            if (results.length === 0) {
                continue;
            }

            let best = null;
            let bestScore = -1;
            const normalizedAnswer = normalizeOption(stringValue);
            const normalizedQuery = normalizeOption(query);
            const normalizedCity = normalizeOption(city);

            for (const result of results) {
                const text = normalize(result.textContent || '');
                let score = 0;

                if (normalizedCity && text.includes(normalizedCity)) {
                    score += 12;
                }

                if (normalizedQuery && text.includes(normalizedQuery)) {
                    score += 8;
                }

                if (normalizedAnswer && text.includes(normalizedAnswer)) {
                    score += 6;
                }

                if (score > bestScore) {
                    bestScore = score;
                    best = result;
                }
            }

            const choice = best || results[0];
            nativeClick(choice);
            await sleep(80);
            element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

            const visibleValue = String(element.value || '').trim();
            const hiddenValue = String(selectedHidden?.value || '').trim();

            if (
                hiddenValue.length >= 2 ||
                valueMatchesAnswer(visibleValue, stringValue) ||
                valueMatchesAnswer(visibleValue, city) ||
                valueMatchesAnswer(visibleValue, query) ||
                (visibleValue.length >= 2 && bestScore >= 6)
            ) {
                heuristicsLog('info', 'apply.lever-location', 'selected', {
                    query,
                    visiblePreview: visibleValue.slice(0, 80),
                    hiddenPreview: hiddenValue.slice(0, 80),
                });

                return true;
            }
        }

        heuristicsLog('warn', 'apply.lever-location', 'no geocomplete match', {
            valuePreview: stringValue.slice(0, 80),
            queriesTried: queries.slice(0, 4),
        });

        return false;
    }

    function isRecruiteeApplyHost(doc = document) {
        try {
            return /\.recruitee\.com$/i.test(doc.location?.hostname || '');
        } catch {
            return false;
        }
    }

    function isPersonioJobsHost(doc = document) {
        try {
            return (
                /\.jobs\.personio\.(?:de|com)$/i.test(
                    doc.location?.hostname || '',
                ) ||
                /\.personio\.(?:de|com)$/i.test(doc.location?.hostname || '')
            );
        } catch {
            return false;
        }
    }

    function personioDocumentFieldLabelFromName(name) {
        const normalized = String(name || '').toLowerCase();

        if (normalized.includes('documents.cv') || normalized.endsWith('.cv')) {
            return 'cv resume';
        }

        if (normalized.includes('work-sample')) {
            return 'work sample';
        }

        if (normalized.includes('cover')) {
            return 'cover letter';
        }

        if (
            normalized.includes('employment') ||
            normalized.includes('reference')
        ) {
            return 'employment reference';
        }

        if (
            normalized.includes('documents.other') ||
            normalized.endsWith('.other')
        ) {
            return 'other file';
        }

        return '';
    }

    function getPersonioQuestionLabel(element) {
        if (
            !element ||
            !isPersonioJobsHost(element.ownerDocument || document)
        ) {
            return '';
        }

        if (element.type === 'file') {
            const fromName = personioDocumentFieldLabelFromName(
                element.name || element.id || '',
            );

            if (fromName.length >= 2) {
                return fromName;
            }

            const wrapper = element.closest(
                '[class*="documentCategoryWrapper"], [class*="DocumentCategory"]',
            );
            const wrapperText = normalize(wrapper?.textContent || '');

            if (/^cv\b/i.test(wrapperText)) {
                return 'cv resume';
            }

            if (/work sample/i.test(wrapperText)) {
                return 'work sample';
            }

            if (/cover letter/i.test(wrapperText)) {
                return 'cover letter';
            }
        }

        const fieldName = String(element.name || element.id || '');

        if (
            /^custom_attribute_/i.test(fieldName) ||
            /^field-custom_attribute_/i.test(element.id || '')
        ) {
            const wrapper = element.closest(
                '[class*="fieldWrapper"], [class*="FieldWrapper"]',
            );
            const labelEl = wrapper?.querySelector(
                '[class*="formLabel"], .form-label, label',
            );

            if (labelEl) {
                const clone = labelEl.cloneNode(true);

                for (const node of clone.querySelectorAll(
                    '.sr-only, [aria-hidden="true"]',
                )) {
                    node.remove();
                }

                const raw = clone.textContent
                    ? normalize(clone.textContent)
                    : '';

                if (raw.length >= 3) {
                    return raw;
                }
            }
        }

        return '';
    }

    function isPersonioApplicationFileInput(element) {
        if (!element || element.type !== 'file' || element.disabled) {
            return false;
        }

        if (!isPersonioJobsHost(element.ownerDocument || document)) {
            return false;
        }

        return (
            /^documents\./i.test(String(element.name || '')) ||
            getPersonioQuestionLabel(element).length >= 2
        );
    }

    function isWorkableApplyHost(doc = document) {
        try {
            return /(?:^|\.)workable\.com$/i.test(doc.location?.hostname || '');
        } catch {
            return false;
        }
    }

    function getWorkableFieldDataUi(element) {
        return (
            element?.closest?.('[data-ui]')?.getAttribute?.('data-ui') || null
        );
    }

    function getWorkableFieldLabelText(element) {
        const dataUi = getWorkableFieldDataUi(element);
        const doc = element?.ownerDocument || document;
        const fromLabelId = dataUi
            ? doc.getElementById(`${dataUi}_label`)?.textContent
            : '';
        const fromQuestion = getWorkableQuestionLabel(element);

        return normalize(fromLabelId || fromQuestion || '');
    }

    function isWorkableWashingtonCountyField(element) {
        if (
            !element ||
            !isWorkableApplyHost(element.ownerDocument || document)
        ) {
            return false;
        }

        const label = getWorkableFieldLabelText(element);

        return (
            /if you live in washington state.*county/i.test(label) ||
            getWorkableFieldDataUi(element) === 'CA_45368'
        );
    }

    function isWorkableWashingtonResidencyDeclined(doc = document) {
        if (!isWorkableApplyHost(doc)) {
            return false;
        }

        for (const input of doc.querySelectorAll(
            'input[type="radio"][name="CA_45367"]',
        )) {
            if (!input.checked) {
                continue;
            }

            const labelEl = doc.getElementById(`radio_label_${input.id}`);
            const text = normalize(
                labelEl?.textContent ||
                    input.closest('label')?.textContent ||
                    '',
            );

            if (/do not live in wa|not live in wa state/i.test(text)) {
                return true;
            }
        }

        for (const label of doc.querySelectorAll('[id^="radio_label_"]')) {
            const text = normalize(label.textContent || '');

            if (!/do not live in wa|not live in wa state/i.test(text)) {
                continue;
            }

            const wrapper = label.previousElementSibling;

            if (wrapper?.getAttribute?.('aria-checked') === 'true') {
                return true;
            }

            if (
                label.closest('label')?.getAttribute?.('data-checked') ===
                'true'
            ) {
                return true;
            }

            const inputId = label.id.replace(/^radio_label_/, '');
            const input = doc.getElementById(inputId);

            if (input?.checked) {
                return true;
            }
        }

        return false;
    }

    function isWorkableInactiveConditionalField(element) {
        if (!element) {
            return false;
        }

        if (isWorkableWashingtonCountyField(element)) {
            return isWorkableWashingtonResidencyDeclined(
                element.ownerDocument || document,
            );
        }

        return false;
    }

    function isInactiveConditionalField(element) {
        return isWorkableInactiveConditionalField(element);
    }

    /**
     * Workable apply fields often wrap controls in SVG-only <label for> nodes while the
     * real question lives on `{token}_label` (aria-labelledby / sibling span).
     * Without this, inventory falls back to opaque ids like input_files_input_* / qa_*.
     *
     * @param {Element} element
     * @returns {string}
     */
    function getWorkableChoiceGroup(element) {
        if (
            !element ||
            !isWorkableApplyHost(element.ownerDocument || document)
        ) {
            return null;
        }

        if (element.type !== 'radio' && element.type !== 'checkbox') {
            return null;
        }

        return (
            element.closest('fieldset[role="radiogroup"][aria-labelledby]') ||
            element.closest('[role="radiogroup"][aria-labelledby]') ||
            element.closest('[role="group"][aria-labelledby]')
        );
    }

    function getWorkableRoleRadioHost(element) {
        return (
            element?.closest?.('[role="radio"][data-ui="option"]') ||
            element?.closest?.('[role="radio"]') ||
            null
        );
    }

    function readWorkableRoleRadioLabel(roleHost) {
        if (!roleHost) {
            return '';
        }

        const doc = roleHost.ownerDocument || document;
        const labelledBy = roleHost.getAttribute('aria-labelledby') || '';

        for (const refId of labelledBy.split(/\s+/)) {
            if (!/radio_label_/i.test(refId)) {
                continue;
            }

            const labelEl = doc.getElementById(refId);
            const text = labelEl?.textContent
                ? normalize(labelEl.textContent)
                : '';

            if (text.length >= 1) {
                return text;
            }
        }

        const native = roleHost.querySelector('input[type="radio"]');
        const nativeValue = String(native?.value || '').trim();

        if (/^(true|false)$/i.test(nativeValue)) {
            return nativeValue.toLowerCase() === 'true' ? 'Yes' : 'No';
        }

        return nativeValue;
    }

    function syncWorkableNativeRadioFromRoleHost(roleHost) {
        if (!roleHost) {
            return;
        }

        const native = roleHost.querySelector('input[type="radio"]');

        if (!native) {
            return;
        }

        const selected = roleHost.getAttribute('aria-checked') === 'true';

        setNativeChecked(native, selected);

        if (selected) {
            native.dispatchEvent(new Event('input', { bubbles: true }));
            native.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function syncWorkableRoleRadioGroup(roleRadios) {
        for (const roleRadio of roleRadios || []) {
            syncWorkableNativeRadioFromRoleHost(roleRadio);
        }
    }

    function getWorkableCheckboxOptionLabel(element) {
        const doc = element.ownerDocument || document;
        const roleHost = element.closest('[role="checkbox"], [role="radio"]');
        const labelledBy =
            roleHost?.getAttribute?.('aria-labelledby') ||
            element.getAttribute?.('aria-labelledby');

        if (!labelledBy) {
            return '';
        }

        for (const refId of labelledBy.split(/\s+/)) {
            if (!/checkbox_label_|radio_label_/i.test(refId)) {
                continue;
            }

            const labelEl = doc.getElementById(refId);
            const text = labelEl?.textContent
                ? normalize(labelEl.textContent)
                : '';

            if (text.length >= 1) {
                return text;
            }
        }

        return '';
    }

    function getWorkableQuestionLabel(element) {
        if (
            !element ||
            !isWorkableApplyHost(element.ownerDocument || document)
        ) {
            return '';
        }

        const choiceGroup = getWorkableChoiceGroup(element);

        if (choiceGroup) {
            const groupLabel = getRadiogroupLabel(choiceGroup);

            if (groupLabel.length >= 2) {
                return groupLabel.slice(0, 200);
            }
        }

        const doc = element.ownerDocument || document;
        const labelledBy = element.getAttribute?.('aria-labelledby');

        if (labelledBy) {
            for (const refId of labelledBy.split(/\s+/)) {
                const labelEl = doc.getElementById(refId);
                const labelledText = labelEl?.textContent
                    ? normalize(labelEl.textContent)
                    : '';

                if (
                    labelledText.length >= 2 &&
                    !/^select an option/i.test(labelledText)
                ) {
                    return labelledText.slice(0, 200);
                }
            }
        }

        const id = String(element.getAttribute?.('id') || '');
        const tokenMatch =
            id.match(/input_files_input_(.+)$/i) ||
            id.match(/^input_(.+)_input$/i) ||
            id.match(/^input_(.+)$/i);

        if (tokenMatch?.[1]) {
            const byToken = doc.getElementById(`${tokenMatch[1]}_label`);
            const tokenText = byToken?.textContent
                ? normalize(byToken.textContent)
                : '';

            if (tokenText.length >= 2) {
                return tokenText.slice(0, 200);
            }
        }

        const dataUi = element.closest('[data-ui]')?.getAttribute('data-ui');

        if (
            dataUi &&
            !/^(section-fields|autofill-button|apply-button|phone)$/i.test(
                dataUi,
            )
        ) {
            const byUi = doc.getElementById(`${dataUi}_label`);
            const uiText = byUi?.textContent ? normalize(byUi.textContent) : '';

            if (uiText.length >= 2) {
                return uiText.slice(0, 200);
            }
        }

        // Prefer an explicit name/id label over scanning the whole form (avoids city/postcode
        // companions inheriting "First name" from the first *_label in the form).
        const identity = String(element.id || element.name || '');

        if (
            identity &&
            !/^(city|postcode|postalcode|zip|country|state)$/i.test(identity)
        ) {
            const byIdentity = doc.getElementById(`${identity}_label`);
            const identityText = byIdentity?.textContent
                ? normalize(byIdentity.textContent)
                : '';

            if (identityText.length >= 2) {
                return identityText.slice(0, 200);
            }
        }

        const fieldRoot =
            element.closest(
                '[data-role="dropzone"], [data-input-type], [data-ui], label.styles--3aPac, .styles--3IYUq',
            ) || element.parentElement;
        const nearby = fieldRoot?.querySelector?.(
            '[id$="_label"] strong, [id$="_label"]',
        );
        const nearbyText = nearby?.textContent
            ? normalize(nearby.textContent)
            : '';

        if (nearbyText.length >= 2 && !/^select an option/i.test(nearbyText)) {
            return nearbyText.slice(0, 200);
        }

        return '';
    }

    function isLeverJobsHost(doc = document) {
        try {
            return /(?:^|\.)lever\.co$/i.test(doc.location?.hostname || '');
        } catch {
            return false;
        }
    }

    /**
     * Recruitee keeps the real apply form in a hidden Reach tab panel until "Apply" is
     * clicked. File inputs already bypass visibility via isLabeledApplicationFileInput;
     * include the rest of #offer-application-form the same way.
     */
    function isRecruiteeApplicationFormControl(element) {
        if (
            !element ||
            !isRecruiteeApplyHost(element.ownerDocument || document)
        ) {
            return false;
        }

        if (element.type === 'hidden') {
            return false;
        }

        return (
            element.closest('#offer-application-form') !== null ||
            Boolean(
                element
                    .closest('form')
                    ?.id?.toLowerCase?.()
                    .includes('application-form'),
            )
        );
    }

    /**
     * Lever location-conditional EEO surveys live in `.application-form.hidden` until a
     * country is chosen. Keep them in inventory so Draft All / dual-oracle match the DOM.
     */
    function isLeverDeferredSurveyControl(element) {
        if (!element || !isLeverJobsHost(element.ownerDocument || document)) {
            return false;
        }

        if (element.type === 'hidden') {
            return false;
        }

        const name = String(
            element.getAttribute?.('name') || element.name || '',
        );

        if (!/surveysResponses\[/i.test(name)) {
            return false;
        }

        return getLeverApplicationQuestion(element) !== null;
    }

    const revealedApplicationFormDocs = new WeakSet();

    /**
     * Open Recruitee / Personio / Workable apply UI when the JD page still shows the closed form shell.
     * Sync click only - callers that need hydration should re-poll inventory shortly after.
     */
    function revealDeferredApplicationForm(doc = document) {
        if (!doc || revealedApplicationFormDocs.has(doc)) {
            return false;
        }

        if (isRecruiteeApplyHost(doc)) {
            const applyForm =
                doc.querySelector('#offer-application-form') ||
                Array.from(doc.querySelectorAll('form')).find((form) =>
                    String(form.id || '')
                        .toLowerCase()
                        .includes('application-form'),
                );
            const hiddenPanel = applyForm?.closest(
                '[hidden], [aria-hidden="true"]',
            );

            if (applyForm && !hiddenPanel) {
                return false;
            }

            const applyTab = Array.from(
                doc.querySelectorAll('[role="tab"], button, a'),
            ).find((node) => {
                const label = normalize(
                    node.textContent || node.getAttribute?.('aria-label') || '',
                );

                return (
                    node.getAttribute?.('data-cy') === 'apply-button' ||
                    /^(apply|application|bewerben|postuler)$/i.test(label)
                );
            });

            if (applyTab && !applyTab.disabled) {
                revealedApplicationFormDocs.add(doc);
                applyTab.click();

                return true;
            }
        }

        if (isPersonioJobsHost(doc)) {
            const hasFields = doc.querySelector(
                'form input:not([type="hidden"]), form textarea, form select, [name="first_name"], [name="email"]',
            );

            if (hasFields) {
                return false;
            }

            const applyControl = Array.from(
                doc.querySelectorAll('a[href*="apply"], button, a'),
            ).find((node) => {
                const href = String(node.getAttribute?.('href') || '');
                const label = normalize(
                    node.textContent || node.getAttribute?.('aria-label') || '',
                );

                return (
                    /[?&]apply(?:&|$)/i.test(href) ||
                    /apply for this job|bewerben|jetzt bewerben|postuler/i.test(
                        label,
                    )
                );
            });

            if (applyControl && !applyControl.disabled) {
                revealedApplicationFormDocs.add(doc);
                applyControl.click();

                return true;
            }
        }

        if (isWorkableApplyHost(doc)) {
            const hasFields = doc.querySelector(
                'input:not([type="hidden"]), textarea, select, [data-ui="firstname"], [data-ui="email"]',
            );

            if (hasFields) {
                return false;
            }

            const applyControl = doc.querySelector(
                'a[data-ui="apply-button"], [data-ui="apply-button"], a[data-ui="application-form-tab"], [data-ui="application-form-tab"]',
            );

            if (applyControl && !applyControl.disabled) {
                revealedApplicationFormDocs.add(doc);
                applyControl.click();

                return true;
            }
        }

        return false;
    }

    /**
     * Recruitee often surfaces section titles ("My information", "Questions") instead of
     * the per-field label. Prefer label[for], visible field label text, then placeholder.
     */
    function isRecruiteeSectionHeadingLabel(text) {
        return /^(my information|questions|legal agreements|fill out the information below|please fill in additional questions)$/i.test(
            String(text || '').trim(),
        );
    }

    function getRecruiteeQuestionLabel(element) {
        if (
            !element ||
            !isRecruiteeApplyHost(element.ownerDocument || document)
        ) {
            return '';
        }

        const doc = element.ownerDocument || document;

        // Agreement checkboxes use aria-labelledby pointing at rich-text consent copy
        // (e.g. "I agree to … Privacy Policy"), not the fieldset legend "Legal Agreements".
        const labelledBy = element.getAttribute?.('aria-labelledby');

        if (labelledBy) {
            for (const refId of labelledBy.split(/\s+/)) {
                const labelEl = doc.getElementById(refId);
                const labelledText = labelEl?.textContent
                    ? normalize(labelEl.textContent)
                    : '';

                if (
                    labelledText.length >= 2 &&
                    !isRecruiteeSectionHeadingLabel(labelledText)
                ) {
                    return labelledText.slice(0, 180);
                }
            }
        }

        const id = element.getAttribute?.('id');

        if (id) {
            const escapedId =
                typeof CSS !== 'undefined' && CSS.escape
                    ? CSS.escape(id)
                    : id.replace(/"/g, '\\"');
            const explicit = doc.querySelector(`label[for="${escapedId}"]`);
            const explicitText = explicit?.textContent
                ? normalize(explicit.textContent)
                : '';

            if (
                explicitText.length >= 2 &&
                !isRecruiteeSectionHeadingLabel(explicitText)
            ) {
                return explicitText;
            }
        }

        const name = String(
            element.getAttribute?.('name') || element.name || '',
        );
        const isAgreementConsent =
            element.type === 'checkbox' &&
            /candidate\.agreements\.\d+\.consent/i.test(name);

        if (isAgreementConsent) {
            const consentCopy =
                element.parentElement?.querySelector('[id*="consent"]') ||
                element.nextElementSibling;
            const consentText = consentCopy?.textContent
                ? normalize(consentCopy.textContent)
                : '';

            if (
                consentText.length >= 8 &&
                !isRecruiteeSectionHeadingLabel(consentText)
            ) {
                return consentText.slice(0, 180);
            }
        }

        const fieldRoot = element.closest(
            '[class*="field"], [data-testid*="field"], .sc-input, form',
        );
        const nearbyLabel = fieldRoot?.querySelector(
            'label span, label, legend, [class*="label"]',
        );
        const nearbyText = nearbyLabel?.textContent
            ? normalize(nearbyLabel.textContent)
            : '';

        if (
            nearbyText.length >= 2 &&
            !isRecruiteeSectionHeadingLabel(nearbyText)
        ) {
            // Prefer the first short label line when the node includes helper copy.
            const firstLine = nearbyText.split(/\s{2,}|\n/)[0] || nearbyText;

            if (firstLine.length >= 2 && firstLine.length <= 120) {
                return firstLine;
            }
        }

        const placeholder = normalize(
            element.getAttribute?.('placeholder') || '',
        );

        if (placeholder.length >= 2) {
            return placeholder.replace(/^your\s+/i, '');
        }

        if (element.type === 'checkbox') {
            const agreement =
                element.closest('label')?.textContent ||
                element.parentElement?.textContent ||
                '';
            const agreementText = normalize(agreement);

            if (
                agreementText.length >= 12 &&
                !isRecruiteeSectionHeadingLabel(agreementText)
            ) {
                return agreementText.slice(0, 180);
            }
        }

        return '';
    }

    function isReedApplyHost(doc = document) {
        try {
            return /(?:^|\.)reed\.co\.uk$/i.test(doc.location?.hostname || '');
        } catch {
            return false;
        }
    }

    /**
     * Reed screening questions hide a generic "Answer the question" label and show the
     * real prompt in #question-wrapper-{id} [class*="questions_title"].
     */
    function getReedQuestionLabel(element) {
        if (!element || !isReedApplyHost(element.ownerDocument || document)) {
            return '';
        }

        const doc = element.ownerDocument || document;
        const id = String(
            element.getAttribute?.('id') || element.id || '',
        ).trim();

        if (id) {
            const wrapper = doc.getElementById(`question-wrapper-${id}`);
            const title = normalize(
                wrapper?.querySelector?.('[class*="questions_title"]')
                    ?.textContent || '',
            );

            if (title.length >= 2 && !/^answer the question$/i.test(title)) {
                return title.slice(0, 200);
            }
        }

        const formGroup = element.closest(
            '.form-group, [class*="questions_text"]',
        );
        const siblingTitle = formGroup?.previousElementSibling?.matches?.(
            '[id^="question-wrapper-"], [class*="questions_question"]',
        )
            ? formGroup.previousElementSibling
            : null;
        const siblingText = normalize(
            siblingTitle?.querySelector?.('[class*="questions_title"]')
                ?.textContent ||
                siblingTitle?.textContent ||
                '',
        )
            .replace(/\*$/, '')
            .trim();

        if (
            siblingText.length >= 2 &&
            !/^answer the question$/i.test(siblingText)
        ) {
            return siblingText.slice(0, 200);
        }

        const containerTitle = normalize(
            element
                .closest(
                    '[data-qa="screening-questions-container"], [class*="screening-questions_container"]',
                )
                ?.querySelector?.('[class*="questions_title"]')?.textContent ||
                '',
        );

        if (
            containerTitle.length >= 2 &&
            !/^answer the question$/i.test(containerTitle)
        ) {
            return containerTitle.slice(0, 200);
        }

        return '';
    }

    function isGreenhouseApplyHost(doc = document) {
        const host = String(doc.location?.hostname || '');

        return (
            /greenhouse\.io/i.test(host) ||
            Boolean(
                doc.querySelector('form.application--form, #application-form'),
            )
        );
    }

    /**
     * Greenhouse job boards use per-field .field-wrapper containers. Avoid
     * .application--questions (matches all custom questions) when resolving labels.
     */
    function getGreenhouseQuestionLabel(element) {
        if (
            !element ||
            !isGreenhouseApplyHost(element.ownerDocument || document)
        ) {
            return '';
        }

        const doc = element.ownerDocument || document;
        const id = String(element.getAttribute?.('id') || element.id || '');

        if (element.type === 'file' && id) {
            const uploadLabel =
                doc.getElementById(`upload-label-${id}`) ||
                element
                    .closest('.field-wrapper')
                    ?.querySelector('.upload-label, .label.upload-label');
            const uploadText = uploadLabel?.textContent
                ? normalize(uploadLabel.textContent)
                : '';

            if (uploadText.length >= 2) {
                return uploadText.replace(/\*/g, '').trim().slice(0, 120);
            }
        }

        const labelledBy = element.getAttribute?.('aria-labelledby');

        if (labelledBy) {
            for (const refId of labelledBy.split(/\s+/)) {
                const labelEl = doc.getElementById(refId);
                const labelledText = labelEl?.textContent
                    ? normalize(labelEl.textContent)
                    : '';

                if (labelledText.length >= 2) {
                    return labelledText.replace(/\*/g, '').trim().slice(0, 200);
                }
            }
        }

        const ariaLabel = normalize(element.getAttribute?.('aria-label') || '');

        if (ariaLabel.length >= 2) {
            return ariaLabel.slice(0, 200);
        }

        if (id) {
            const escapedId =
                typeof CSS !== 'undefined' && CSS.escape
                    ? CSS.escape(id)
                    : id.replace(/"/g, '\\"');
            const explicit = doc.querySelector(`label[for="${escapedId}"]`);
            const explicitText = explicit?.textContent
                ? normalize(explicit.textContent)
                : '';

            if (explicitText.length >= 2) {
                return explicitText.replace(/\*/g, '').trim().slice(0, 200);
            }
        }

        const fieldWrapper = element.closest('.field-wrapper');

        if (fieldWrapper) {
            const scopedLabel = fieldWrapper.querySelector(
                'label.label, label.select__label, .upload-label, .label',
            );
            const scopedText = scopedLabel?.textContent
                ? normalize(scopedLabel.textContent)
                : '';

            if (scopedText.length >= 2) {
                return scopedText.replace(/\*/g, '').trim().slice(0, 200);
            }
        }

        return '';
    }

    function isAshbyHiddenYesNoInput(element) {
        return (
            element.type === 'checkbox' &&
            element.tabIndex === -1 &&
            element.closest('[class*="_yesno_"]') !== null
        );
    }

    function isAshbyStyledChoiceInput(element) {
        return (
            (element.type === 'radio' || element.type === 'checkbox') &&
            getAshbyFieldEntry(element) !== null &&
            !isAshbyHiddenYesNoInput(element)
        );
    }

    function getOracleApplyFlowFieldRow(element) {
        return element.closest(
            '.input-row, .input-row--radiogroup, [role="radiogroup"].input-row',
        );
    }

    function getOracleApplyFlowQuestionLabel(element) {
        const row = getOracleApplyFlowFieldRow(element);

        if (!row) {
            return '';
        }

        const labelledBy = row.getAttribute('aria-labelledby');

        if (labelledBy) {
            const doc = element.ownerDocument || document;

            for (const id of labelledBy.split(/\s+/)) {
                const labelEl = doc.getElementById(id);
                const linebreak =
                    labelEl?.querySelector?.('.input-row__linebreak') ||
                    labelEl;

                if (linebreak?.textContent?.trim()) {
                    return normalize(linebreak.textContent);
                }
            }
        }

        const linebreak = row.querySelector(
            '.input-row__label .input-row__linebreak, .input-row__label',
        );

        if (linebreak?.textContent?.trim()) {
            return normalize(linebreak.textContent);
        }

        return '';
    }

    function isOracleApplyFlowStyledChoiceInput(element) {
        return (
            (element.type === 'radio' || element.type === 'checkbox') &&
            (element.classList.contains('input-row__hidden-control') ||
                element.classList.contains('apply-flow-input-radio-control') ||
                element.closest('.input-row--radiogroup') !== null)
        );
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

            if (
                element.getAttribute('data-selected') === 'true' ||
                element.getAttribute('aria-checked') === 'true' ||
                element.getAttribute('data-state') === 'checked'
            ) {
                return true;
            }

            const className = String(element.className || '');

            if (/\b(selected|checked|active|true)\b/i.test(className)) {
                return true;
            }
        }

        return false;
    }

    function findAshbyYesNoScope(
        root,
        { dataFieldPath = null, anchor = null } = {},
    ) {
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
            const fromAnchor =
                anchor.closest(
                    '[data-field-path], .ashby-application-form-field-entry',
                ) || anchor.closest('[class*="_yesno_"]');

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

        return (
            scope.querySelector('[class*="_yesno_"]') ||
            scope.querySelector('._container_1svni_28')
        );
    }

    function queryAshbyYesNoButtons(scope, root = document) {
        const fieldScope =
            findAshbyYesNoScope(root, { anchor: scope }) || scope;
        const container = queryAshbyYesNoContainer(fieldScope);

        if (!container) {
            return [];
        }

        return Array.from(container.querySelectorAll('button')).filter(
            isVisible,
        );
    }

    function isAshbyYesNoButtonSelected(button) {
        if (!button) {
            return false;
        }

        if (button.getAttribute('aria-pressed') === 'true') {
            return true;
        }

        return /_active_/i.test(String(button.className || ''));
    }

    function readAshbyYesNoSelectedButton(container) {
        if (!container) {
            return null;
        }

        return (
            Array.from(container.querySelectorAll('button')).find(
                isAshbyYesNoButtonSelected,
            ) || null
        );
    }

    function readAshbyYesNoSelection(scope, root = document) {
        const fieldScope =
            findAshbyYesNoScope(root, { anchor: scope }) || scope;
        const container = queryAshbyYesNoContainer(fieldScope);

        if (!container) {
            return null;
        }

        const selected = readAshbyYesNoSelectedButton(container);

        if (selected) {
            return selected.textContent.replace(/\s+/g, ' ').trim();
        }

        const checkbox = container.querySelector('input[type="checkbox"]');

        // Live Ashby stores the choice on checkbox.value ("Yes"/"No") with checked=true.
        if (checkbox?.checked) {
            const value = String(checkbox.value || '').trim();

            if (/^(yes|no)$/i.test(value)) {
                const matchingButton = Array.from(
                    container.querySelectorAll('button'),
                ).find((button) => {
                    return optionMatchesAnswer(
                        button.textContent.replace(/\s+/g, ' ').trim(),
                        value,
                    );
                });

                return matchingButton
                    ? matchingButton.textContent.replace(/\s+/g, ' ').trim()
                    : value;
            }

            const yesButton = Array.from(
                container.querySelectorAll('button'),
            ).find((button) => {
                return optionMatchesAnswer(
                    button.textContent.replace(/\s+/g, ' ').trim(),
                    'yes',
                );
            });

            if (yesButton) {
                return yesButton.textContent.replace(/\s+/g, ' ').trim();
            }
        }

        return null;
    }

    function isAshbyYesNoCommitted(scope, booleanAnswer, root = document) {
        const fieldScope =
            findAshbyYesNoScope(root, { anchor: scope }) || scope;
        const container = queryAshbyYesNoContainer(fieldScope);

        if (!container || !booleanAnswer) {
            return false;
        }

        const selected = readAshbyYesNoSelectedButton(container);

        if (selected) {
            const selection = selected.textContent.replace(/\s+/g, ' ').trim();

            // Trust the visible Yes/No button state. Live Ashby keeps the hidden
            // checkbox checked=true for both Yes and No (value carries the choice).
            return optionMatchesAnswer(selection, booleanAnswer);
        }

        const checkbox = container.querySelector('input[type="checkbox"]');

        if (!checkbox?.checked) {
            return false;
        }

        const value = String(checkbox.value || '').trim();

        if (value && optionMatchesAnswer(value, booleanAnswer)) {
            return true;
        }

        // Legacy mocks only flip checked for Yes with an empty value.
        return optionMatchesAnswer(booleanAnswer, 'yes') && value === '';
    }

    function readAshbyYesNoValueForInput(input) {
        if (!input?.closest?.('[class*="_yesno_"]')) {
            return null;
        }

        return readAshbyYesNoSelection(input, input.ownerDocument || document);
    }

    function isAshbyYesNoScopeAnswered(
        scope,
        dataFieldPath = null,
        root = document,
    ) {
        const fieldScope =
            findAshbyYesNoScope(root, { dataFieldPath, anchor: scope }) ||
            scope;

        return readAshbyYesNoSelection(fieldScope, root) !== null;
    }

    function resolveAshbyYesNoButtons(
        target,
        dataFieldPath = null,
        root = document,
    ) {
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

        return Array.isArray(target)
            ? target.filter((button) => button?.isConnected)
            : [];
    }

    const MONTH_INDEX = {
        january: 0,
        jan: 0,
        february: 1,
        feb: 1,
        march: 2,
        mar: 2,
        april: 3,
        apr: 3,
        may: 4,
        june: 5,
        jun: 5,
        july: 6,
        jul: 6,
        august: 7,
        aug: 7,
        september: 8,
        sep: 8,
        sept: 8,
        october: 9,
        oct: 9,
        november: 10,
        nov: 10,
        december: 11,
        dec: 11,
    };

    function monthTokenToIndex(monthToken) {
        const key = String(monthToken || '').toLowerCase();

        return Object.prototype.hasOwnProperty.call(MONTH_INDEX, key)
            ? MONTH_INDEX[key]
            : undefined;
    }

    function isYesNoChoiceOptions(options) {
        const meaningful = (options || [])
            .map((option) => normalizeOption(option))
            .filter(
                (option) =>
                    option && !['on', 'off', 'true', 'false'].includes(option),
            );

        if (meaningful.length !== 2) {
            return false;
        }

        const sorted = [...meaningful].sort();

        return sorted[0] === 'no' && sorted[1] === 'yes';
    }

    function isAvailabilityYesNoQuestion(label) {
        const text = normalize(label);

        return (
            /\b(available to start|able to start|can you start|could you start)\b/.test(
                text,
            ) ||
            (/\bstart\b/.test(text) &&
                /\b(programme|program|role|position|internship|placement)\b/.test(
                    text,
                ))
        );
    }

    function parseMonthYearToken(monthToken, yearToken) {
        const month = monthTokenToIndex(monthToken);
        const year = Number.parseInt(String(yearToken), 10);

        if (month === undefined || Number.isNaN(year)) {
            return null;
        }

        return new Date(year, month, 1);
    }

    function extractTargetStartDateFromLabel(label) {
        const text = normalize(label);
        const monthYearMatch = text.match(
            /\b(?:in|from|by|on|starting)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/,
        );

        if (monthYearMatch) {
            return parseMonthYearToken(monthYearMatch[1], monthYearMatch[2]);
        }

        return null;
    }

    function parseDateFromAnswer(answer) {
        const text = String(answer ?? '').trim();

        if (!text) {
            return null;
        }

        if (/^(immediately|asap|now|straight away|right away)\b/i.test(text)) {
            return new Date(0);
        }

        const dayMonthYear = text.match(
            /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/i,
        );

        if (dayMonthYear) {
            const day = Number.parseInt(dayMonthYear[1], 10);
            const month = monthTokenToIndex(dayMonthYear[2]);
            const year = Number.parseInt(dayMonthYear[3], 10);

            if (
                month === undefined ||
                Number.isNaN(day) ||
                Number.isNaN(year)
            ) {
                return null;
            }

            return new Date(year, month, day);
        }

        const monthYearOnly = text.match(
            /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/i,
        );

        if (monthYearOnly) {
            return parseMonthYearToken(monthYearOnly[1], monthYearOnly[2]);
        }

        const parsed = Date.parse(text);

        if (!Number.isNaN(parsed)) {
            return new Date(parsed);
        }

        return null;
    }

    function coerceAvailabilityDateToYesNo(label, answer, options) {
        if (
            !isYesNoChoiceOptions(options) ||
            !isAvailabilityYesNoQuestion(label)
        ) {
            return null;
        }

        const booleanToken = extractBooleanAnswer(answer);

        if (booleanToken === 'yes' || booleanToken === 'no') {
            return (
                options.find(
                    (option) => normalizeOption(option) === booleanToken,
                ) || booleanToken
            );
        }

        const targetDate = extractTargetStartDateFromLabel(label);
        const answerDate = parseDateFromAnswer(answer);

        if (!targetDate || !answerDate) {
            return null;
        }

        const token =
            answerDate.getTime() <= targetDate.getTime() ? 'yes' : 'no';

        return (
            options.find((option) => normalizeOption(option) === token) || token
        );
    }

    function resolveRadioGroupAnswer(element, answer, roleRadios = null) {
        const questionLabel =
            getWorkableQuestionLabel(element) || getQuestionLabel(element);
        const optionLabels = roleRadios
            ? getRoleRadioOptions(roleRadios)
            : getGroupInputs(element)
                  .map((input) => getOptionLabel(input))
                  .filter(Boolean);
        const coerced = coerceAvailabilityDateToYesNo(
            questionLabel,
            answer,
            optionLabels,
        );

        return coerced || answer;
    }

    function extractBooleanAnswer(answer) {
        const normalized = normalizeOption(answer);

        if (!normalized) {
            return normalized;
        }

        if (
            /^(yes|y|true|tak|oui|ja|si|sí)\b/.test(normalized) ||
            normalized.includes(' i am open') ||
            normalized.includes(' i can start')
        ) {
            return 'yes';
        }

        if (
            /^(no|n|false|nie|non|nein)\b/.test(normalized) ||
            normalized.includes(' not open') ||
            normalized.includes(' i am not')
        ) {
            return 'no';
        }

        const yesMatch = normalized.match(
            /\b(yes|yeah|yep|true|tak|oui|ja)\b/,
        );
        const noMatch = normalized.match(/\b(no|nope|false|nie|non|nein)\b/);

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

        for (const fieldEntry of root.querySelectorAll(
            '[data-field-path], .ashby-application-form-field-entry',
        )) {
            const yesNoContainer =
                fieldEntry.querySelector('[class*="_yesno_"]');

            if (!yesNoContainer) {
                continue;
            }

            const buttons = Array.from(
                yesNoContainer.querySelectorAll('button'),
            ).filter(isVisible);

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
                dataFieldPath:
                    fieldEntry.getAttribute('data-field-path') || null,
                buttons,
                label,
                optionLabels: buttons
                    .map((button) =>
                        button.textContent.replace(/\s+/g, ' ').trim(),
                    )
                    .filter((text) => text.length > 0),
            });
        }

        return fields;
    }

    function collectOracleSelectPillFields(root) {
        const fields = [];
        const seen = new Set();

        for (const container of root.querySelectorAll(
            '.cx-select-pills-container, ul.cx-select-pills-container',
        )) {
            const row = container.closest('.input-row');
            const buttons = Array.from(
                container.querySelectorAll(
                    'button.cx-select-pill-section, button[class*="cx-select-pill"]',
                ),
            ).filter(isVisible);

            if (buttons.length < 2) {
                continue;
            }

            const label =
                container.getAttribute('aria-label') ||
                getOracleApplyFlowQuestionLabel(container) ||
                (row ? getOracleApplyFlowQuestionLabel(row) : '');

            if (label.length < 3) {
                continue;
            }

            const key =
                row?.getAttribute('data-qa') ||
                container.getAttribute('aria-label') ||
                label;

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);

            fields.push({
                container,
                row,
                buttons,
                label,
                optionLabels: buttons
                    .map((button) =>
                        button.textContent.replace(/\s+/g, ' ').trim(),
                    )
                    .filter((text) => text.length > 0),
            });
        }

        return fields;
    }

    function isOracleSelectPillAnswered(buttons) {
        return buttons.some(
            (button) => button.getAttribute('aria-pressed') === 'true',
        );
    }

    function setOracleSelectPillValue(buttons, answer) {
        for (const button of buttons) {
            const optionText = button.textContent.replace(/\s+/g, ' ').trim();

            if (optionMatchesAnswer(optionText, answer)) {
                button.scrollIntoView?.({ block: 'center', inline: 'nearest' });
                nativeClick(button);
                button.setAttribute('aria-pressed', 'true');

                for (const sibling of buttons) {
                    if (sibling !== button) {
                        sibling.setAttribute('aria-pressed', 'false');
                    }
                }

                clearValidationState(button);

                return true;
            }
        }

        return false;
    }

    /**
     * Reed Easy Apply screening Yes/No (and similar) questions use a Bootstrap-style
     * custom dropdown: button[data-qa=dropdown-toggle] + role=menuitem options.
     * There is no native <select> or role=combobox for inventory to find.
     */
    function isReedDropdownRoot(element) {
        if (!element || !isReedApplyHost(element.ownerDocument || document)) {
            return false;
        }

        return (
            element.matches?.('[data-qa="dropdown"]') ||
            Boolean(element.closest?.('[data-qa="dropdown"]'))
        );
    }

    function isReedDropdownToggle(element) {
        if (!element || element.tagName?.toLowerCase() !== 'button') {
            return false;
        }

        if (!isReedApplyHost(element.ownerDocument || document)) {
            return false;
        }

        if (element.getAttribute('data-qa') === 'dropdown-toggle') {
            return true;
        }

        return Boolean(
            element.closest('[data-qa="dropdown"]') &&
            element.matches(
                'button.dropdown-toggle, button[aria-haspopup="true"]',
            ),
        );
    }

    function getReedDropdownRoot(element) {
        if (!element) {
            return null;
        }

        if (element.matches?.('[data-qa="dropdown"]')) {
            return element;
        }

        return element.closest?.('[data-qa="dropdown"]') || null;
    }

    function readReedDropdownValue(dropdownOrToggle) {
        const dropdown = getReedDropdownRoot(dropdownOrToggle);

        if (!dropdown) {
            return '';
        }

        const toggle = dropdown.querySelector(
            '[data-qa="dropdown-toggle"], button.dropdown-toggle',
        );
        const selectedSpan = toggle?.querySelector('span');
        const selected = String(selectedSpan?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();

        if (selected && !/^select an option$/i.test(selected)) {
            return selected;
        }

        const aria = String(toggle?.getAttribute('aria-label') || '')
            .replace(/\s+/g, ' ')
            .trim();

        if (aria && !/^select an option$/i.test(aria)) {
            return aria;
        }

        return '';
    }

    function isReedDropdownAnswered(dropdownOrToggle) {
        return readReedDropdownValue(dropdownOrToggle).length > 0;
    }

    function getReedDropdownQuestionLabel(dropdown) {
        if (!dropdown) {
            return '';
        }

        const doc = dropdown.ownerDocument || document;
        const id = String(dropdown.id || '').trim();

        if (id) {
            const wrapper = doc.getElementById(`question-wrapper-${id}`);
            const title = normalize(
                wrapper?.querySelector?.('[class*="questions_title"]')
                    ?.textContent || '',
            );

            if (title.length >= 2 && !/^answer the question$/i.test(title)) {
                return title.slice(0, 200);
            }
        }

        return getReedQuestionLabel(dropdown);
    }

    function collectReedDropdownOptionLabels(dropdown) {
        return Array.from(
            dropdown.querySelectorAll(
                '[role="menuitem"], [data-qa="dropdown-item"]',
            ),
        )
            .map((item) =>
                String(item.textContent || '')
                    .replace(/\s+/g, ' ')
                    .trim(),
            )
            .filter((text) => text.length > 0);
    }

    function collectReedDropdownFields(root) {
        const fields = [];
        const seen = new Set();
        const doc = root.ownerDocument || root;

        if (!isReedApplyHost(doc)) {
            return fields;
        }

        for (const dropdown of root.querySelectorAll('[data-qa="dropdown"]')) {
            const toggle = dropdown.querySelector(
                '[data-qa="dropdown-toggle"], button.dropdown-toggle',
            );

            if (!toggle || !isVisible(toggle)) {
                continue;
            }

            const label = getReedDropdownQuestionLabel(dropdown);

            if (label.length < 3) {
                continue;
            }

            const key = String(dropdown.id || label);

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);

            const optionLabels = collectReedDropdownOptionLabels(dropdown);

            fields.push({
                dropdown,
                toggle,
                label,
                optionLabels,
            });
        }

        return fields;
    }

    async function setReedDropdownValue(dropdownOrToggle, answer) {
        const dropdown = getReedDropdownRoot(dropdownOrToggle);

        if (!dropdown || !answer) {
            return false;
        }

        const stringValue = String(answer).trim();
        const current = readReedDropdownValue(dropdown);

        if (current && optionMatchesAnswer(current, stringValue)) {
            return true;
        }

        const toggle = dropdown.querySelector(
            '[data-qa="dropdown-toggle"], button.dropdown-toggle',
        );

        if (!toggle) {
            return false;
        }

        if (toggle.getAttribute('aria-expanded') !== 'true') {
            toggle.scrollIntoView?.({ block: 'center', inline: 'nearest' });
            nativeClick(toggle);
            await pauseMs(80);
        }

        const items = Array.from(
            dropdown.querySelectorAll(
                '[role="menuitem"], [data-qa="dropdown-item"]',
            ),
        );

        for (const item of items) {
            const optionText = String(item.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();

            if (!optionMatchesAnswer(optionText, stringValue)) {
                continue;
            }

            item.scrollIntoView?.({ block: 'center', inline: 'nearest' });
            nativeClick(item);
            await pauseMs(80);

            const selectedSpan = toggle.querySelector('span');

            if (
                selectedSpan &&
                !String(selectedSpan.textContent || '').trim()
            ) {
                selectedSpan.textContent = optionText;
            }

            if (
                !toggle.getAttribute('aria-label') ||
                /^select an option$/i.test(toggle.getAttribute('aria-label'))
            ) {
                toggle.setAttribute('aria-label', optionText);
            }

            toggle.setAttribute('aria-expanded', 'false');
            clearValidationState(toggle);

            return optionMatchesAnswer(
                readReedDropdownValue(dropdown) || optionText,
                stringValue,
            );
        }

        return false;
    }

    function isAshbyYesNoAnswered(
        buttons,
        dataFieldPath = null,
        root = document,
    ) {
        const anchor = Array.isArray(buttons) ? buttons[0] : buttons;

        return isAshbyYesNoScopeAnswered(anchor, dataFieldPath, root);
    }

    function sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    const CHAR_BY_CHAR_INPUT_TYPES = new Set([
        'text',
        'email',
        'tel',
        'url',
        'number',
        'search',
        '',
    ]);
    const CHAR_BY_CHAR_MAX_LENGTH = 160;

    function humanTypingDelayMs(valueLength) {
        if (valueLength <= 3) {
            return 24 + Math.floor(Math.random() * 34);
        }

        if (valueLength > 60) {
            return 30 + Math.floor(Math.random() * 42);
        }

        return 40 + Math.floor(Math.random() * 58);
    }

    function isCharByCharFillElement(element) {
        if (!element || element.readOnly || element.disabled) {
            return false;
        }

        const tag = element.tagName?.toLowerCase();

        if (tag !== 'input' && tag !== 'textarea') {
            return false;
        }

        const type = (element.type || 'text').toLowerCase();

        if (
            [
                'hidden',
                'file',
                'checkbox',
                'radio',
                'password',
                'submit',
                'button',
                'reset',
                'image',
            ].includes(type)
        ) {
            return false;
        }

        if (tag === 'input' && !CHAR_BY_CHAR_INPUT_TYPES.has(type)) {
            return false;
        }

        return true;
    }

    function shouldTypeCharByChar(element, value) {
        const stringValue = String(value ?? '');

        if (!stringValue || !isCharByCharFillElement(element)) {
            return false;
        }

        if (
            element.getAttribute?.('role') === 'combobox' &&
            isIndeedApplyPage(element.ownerDocument || document)
        ) {
            return false;
        }

        // Indeed location postal/street fields: instant fill avoids autocomplete truncation
        // and APPLY_DRAFT_ANSWER timeouts from char-by-char typing.
        if (
            isIndeedApplyPage(element.ownerDocument || document) &&
            isIndeedIdentityField(element)
        ) {
            const name = String(
                element.getAttribute?.('name') || element.name || '',
            );
            const testId = String(element.getAttribute?.('data-testid') || '');

            if (
                name === 'location-postal-code' ||
                name === 'location-address' ||
                testId === 'location-fields-postal-code-input' ||
                testId === 'location-fields-address-input'
            ) {
                return false;
            }
        }

        if (isRecruiteeApplyHost(element.ownerDocument || document)) {
            const name = String(
                element.getAttribute?.('name') || element.name || '',
            );
            const id = String(element.id || element.getAttribute?.('id') || '');

            if (
                /candidate\.(name|email|phone)/i.test(name) ||
                /input-candidate\.(name|email|phone)/i.test(id)
            ) {
                return false;
            }

            if (
                element.tagName?.toLowerCase() === 'textarea' ||
                /openQuestionAnswers/i.test(name) ||
                /openQuestionAnswers/i.test(id)
            ) {
                return false;
            }
        }

        if (isGreenhouseApplyHost(element.ownerDocument || document)) {
            const id = String(element.id || element.getAttribute?.('id') || '');

            if (/^(first_name|last_name|email|phone)$/i.test(id)) {
                return false;
            }

            if (/^question_/i.test(id)) {
                return false;
            }

            if (element.getAttribute?.('role') === 'combobox') {
                return false;
            }
        }

        if (isLeverJobsHost(element.ownerDocument || document)) {
            const name = String(
                element.getAttribute?.('name') || element.name || '',
            );

            // Keep location-input on char-by-char so Lever geocomplete fires.
            if (/^(name|email|phone|org)$/i.test(name) || /^urls\[/i.test(name)) {
                return false;
            }
        }

        if (isWorkableApplyHost(element.ownerDocument || document)) {
            const name = String(
                element.getAttribute?.('name') || element.name || '',
            );
            const id = String(element.id || element.getAttribute?.('id') || '');

            if (
                /^(firstname|lastname|email|phone)$/i.test(name) ||
                /^(firstname|lastname|email)$/i.test(id)
            ) {
                return false;
            }
        }

        if (isTotaljobsGenesisFormInput(element)) {
            return false;
        }

        if (getAshbyFieldEntry(element)) {
            const fieldPath = String(
                element.getAttribute?.('data-field-path') || element.id || '',
            );
            const questionLabel = getAshbyQuestionTitle(element);

            if (
                /^_systemfield_(name|email|phone|location|resume)/i.test(
                    fieldPath,
                ) ||
                element.type === 'email' ||
                element.type === 'tel' ||
                element.type === 'url'
            ) {
                return false;
            }

            if (/linkedin|portfolio|github|website|url/i.test(questionLabel)) {
                return false;
            }

            if (element.tagName?.toLowerCase() === 'textarea') {
                return false;
            }
        }

        return stringValue.length <= CHAR_BY_CHAR_MAX_LENGTH;
    }

    function dispatchInsertedCharacter(element, char, nextValue) {
        setNativeValue(element, nextValue);
        element.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: char,
                code:
                    char.length === 1 && char >= 'A' && char <= 'Z'
                        ? `Key${char}`
                        : undefined,
                bubbles: true,
                cancelable: true,
            }),
        );
        element.dispatchEvent(
            new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: char,
            }),
        );
        element.dispatchEvent(
            new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: char,
            }),
        );
        element.dispatchEvent(
            new KeyboardEvent('keyup', {
                key: char,
                bubbles: true,
                cancelable: true,
            }),
        );
    }

    async function typeTextIntoElement(element, value, options = {}) {
        const stringValue = String(value);

        element.focus();
        setNativeValue(element, '');
        element.dispatchEvent(
            new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'deleteContentBackward',
            }),
        );

        let typed = '';

        for (const char of stringValue) {
            typed += char;
            dispatchInsertedCharacter(element, char, typed);
            await sleep(humanTypingDelayMs(stringValue.length));
        }

        if (!options.skipChangeUntilEnd) {
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (!options.skipBlur) {
            element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        }

        return valueMatchesAnswer(element.value, stringValue);
    }

    function isContentEditableField(element) {
        if (!element) {
            return false;
        }

        const tag = element.tagName?.toLowerCase();

        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            return false;
        }

        if (element.isContentEditable) {
            return true;
        }

        const contentEditable = element.getAttribute?.('contenteditable');

        return (
            contentEditable === '' ||
            contentEditable === 'true' ||
            contentEditable === 'plaintext-only'
        );
    }

    function fillContentEditableControl(element, value) {
        const stringValue = String(value);

        element.focus();
        element.textContent = stringValue;
        element.dispatchEvent(
            new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertFromPaste',
                data: stringValue,
            }),
        );
        element.dispatchEvent(new Event('change', { bubbles: true }));

        return valueMatchesAnswer(element.textContent, stringValue);
    }

    function fillTextControlInstant(element, value) {
        const stringValue = String(value);

        element.focus();

        if (isContentEditableField(element)) {
            return fillContentEditableControl(element, stringValue);
        }

        setNativeValue(element, stringValue);
        element.dispatchEvent(
            new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertFromPaste',
                data: stringValue,
            }),
        );
        element.dispatchEvent(
            new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertFromPaste',
                data: stringValue,
            }),
        );
        element.dispatchEvent(new Event('change', { bubbles: true }));

        return valueMatchesAnswer(element.value, stringValue);
    }

    async function fillReactTextControl(element, value) {
        const stringValue = String(value);

        element.focus();

        const filled = shouldTypeCharByChar(element, stringValue)
            ? await typeTextIntoElement(element, stringValue, {
                  skipBlur: true,
                  skipChangeUntilEnd: true,
              })
            : fillTextControlInstant(element, stringValue);

        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

        return filled;
    }

    async function fillTypeaheadSearchText(element, value) {
        const stringValue = String(value);

        element.focus();

        if (shouldTypeCharByChar(element, stringValue)) {
            return typeTextIntoElement(element, stringValue, {
                skipBlur: true,
                skipChangeUntilEnd: true,
            });
        }

        return fillTextControlInstant(element, stringValue);
    }

    function dispatchPointerClick(element) {
        if (!element) {
            return;
        }

        const view = elementDefaultView(element);
        const PointerEventCtor = view.PointerEvent || view.MouseEvent;

        element.focus();
        element.dispatchEvent(
            new PointerEventCtor('pointerdown', {
                bubbles: true,
                cancelable: true,
            }),
        );
        element.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
        );
        element.dispatchEvent(
            new PointerEventCtor('pointerup', {
                bubbles: true,
                cancelable: true,
            }),
        );
        element.dispatchEvent(
            new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
        );
        element.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true }),
        );
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

    function pauseMs(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    function dispatchReactSelectOptionMouseDown(option) {
        if (!option) {
            return;
        }

        const view = elementDefaultView(option);
        const eventInit = {
            bubbles: true,
            cancelable: true,
            view,
            button: 0,
            buttons: 1,
        };

        option.dispatchEvent(new MouseEvent('mousedown', eventInit));
        option.dispatchEvent(new MouseEvent('mouseup', eventInit));
        option.dispatchEvent(new MouseEvent('click', eventInit));
    }

    function isReactSelectComboboxShell(element) {
        return Boolean(
            element?.closest?.(
                '.select__control, .select-shell, .select__container',
            ),
        );
    }

    function readReactSelectSingleValueText(element) {
        const shell = element?.closest?.('.select-shell, .select__container');
        const control =
            element?.closest?.('.select__control') ||
            shell?.querySelector?.('.select__control');
        const singleValue = control?.querySelector?.(
            '.select__single-value, .select__multi-value__label',
        );

        return (
            singleValue?.textContent?.replace(/\s+/g, ' ').trim() || null
        );
    }

    function isReactSelectPlaceholderVisible(element) {
        const shell = element?.closest?.('.select-shell, .select__container');
        const control =
            element?.closest?.('.select__control') ||
            shell?.querySelector?.('.select__control');
        const placeholder = control?.querySelector?.('.select__placeholder');

        if (!placeholder?.textContent?.trim()) {
            return false;
        }

        if (placeholder.offsetParent === null) {
            return false;
        }

        try {
            return getComputedStyle(placeholder).display !== 'none';
        } catch {
            return true;
        }
    }

    /**
     * Durable Greenhouse/react-select commit check. Do not trust hidden required
     * inputs or typed filter text alone - live Formlabs source-of-hire reported
     * filled:true while the control still showed Select...
     */
    function greenhouseReactSelectSelectionMatches(
        element,
        expected,
        optionText,
    ) {
        const display = readReactSelectSingleValueText(element);

        if (
            valueMatchesAnswer(display, expected) ||
            valueMatchesAnswer(display, optionText)
        ) {
            return true;
        }

        // Yes/No sometimes lands on the input without a .select__single-value node.
        // Never treat longer filter text (e.g. LinkedIn) as committed - Formlabs
        // source-of-hire reported filled:true while still on Select...
        const expectedTrim = String(expected || '')
            .replace(/\s+/g, ' ')
            .trim();

        if (
            /^(yes|no)$/i.test(expectedTrim) &&
            !isReactSelectPlaceholderVisible(element) &&
            element.getAttribute?.('aria-expanded') !== 'true'
        ) {
            const typed = String(element.value || '')
                .replace(/\s+/g, ' ')
                .trim();

            if (
                valueMatchesAnswer(typed, expected) ||
                valueMatchesAnswer(typed, optionText)
            ) {
                return true;
            }
        }

        return false;
    }

    function comboboxSelectionMatches(element, expected, optionText) {
        if (isWorkableSelectCombobox(element)) {
            const root = element.closest('[data-input-type="select"]');
            const hidden = resolveWorkableHiddenSelectInput(root, element);

            if (hidden?.value?.trim() || String(element.value || '').trim()) {
                return (
                    valueMatchesAnswer(
                        readReactSelectValue(element),
                        expected,
                    ) ||
                    valueMatchesAnswer(
                        readReactSelectValue(element),
                        optionText,
                    ) ||
                    valueMatchesAnswer(element.value, expected) ||
                    valueMatchesAnswer(element.value, optionText)
                );
            }
        }

        // Greenhouse/react-select: require a durable single-value (or Yes/No input
        // with placeholder gone). Hidden/data-value alone caused false fills.
        if (
            isReactSelectComboboxShell(element) &&
            !isWorkableSelectCombobox(element)
        ) {
            return greenhouseReactSelectSelectionMatches(
                element,
                expected,
                optionText,
            );
        }

        return (
            valueMatchesAnswer(readReactSelectValue(element), expected) ||
            valueMatchesAnswer(readReactSelectValue(element), optionText) ||
            valueMatchesAnswer(element.value, expected) ||
            valueMatchesAnswer(element.value, optionText)
        );
    }

    async function commitComboboxOptionSelection(element, option, answerText) {
        if (!element || !option) {
            return false;
        }

        const stringValue = String(answerText ?? '').trim();
        const optionText = (
            option.textContent ||
            option.getAttribute('aria-label') ||
            ''
        )
            .replace(/\s+/g, ' ')
            .trim();
        const expected = stringValue || optionText;

        const selectionCommitted = () =>
            comboboxSelectionMatches(element, expected, optionText);

        const syncGreenhouseRequiredInput = () => {
            const shell = element.closest('.select-shell, .select__container');
            const requiredInput = shell?.querySelector(
                'input[tabindex="-1"][aria-hidden="true"][required], input.remix-css-1a0ro4n-requiredInput, input[tabindex="-1"][aria-hidden="true"]',
            );

            if (!requiredInput || requiredInput === element) {
                return;
            }

            setNativeValue(requiredInput, optionText || expected);
            requiredInput.dispatchEvent(new Event('input', { bubbles: true }));
            requiredInput.dispatchEvent(new Event('change', { bubbles: true }));
        };

        const finalizeCommittedSelection = async ({ blur = true } = {}) => {
            syncWorkableHiddenSelectValue(element, optionText, option);

            if (!selectionCommitted()) {
                return false;
            }

            syncGreenhouseRequiredInput();
            element.setAttribute('aria-expanded', 'false');

            if (blur) {
                element.blur();
            }

            clearValidationState(element);
            // Greenhouse often paints a transient single-value then reverts to
            // Select... after the menu closes. Wait for settle before success.
            await pauseMs(280);

            return selectionCommitted();
        };

        const pressComboboxKey = (key, code = key) => {
            element.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key,
                    code,
                    bubbles: true,
                    cancelable: true,
                }),
            );
            element.dispatchEvent(
                new KeyboardEvent('keyup', {
                    key,
                    code,
                    bubbles: true,
                }),
            );
        };

        option.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });

        if (isWorkableSelectCombobox(element)) {
            const doc = element.ownerDocument || document;

            openWorkableSelectDropdown(element);
            await pauseMs(120);
            clickWorkableListboxOption(doc, element, option, optionText);
            await pauseMs(120);
            syncWorkableHiddenSelectValue(element, optionText, option);

            return (
                workableSelectIsCommitted(element, expected) ||
                finalizeCommittedSelection()
            );
        }

        for (const attempt of [0, 1]) {
            if (attempt === 1) {
                element.focus();
                openReactSelectDropdown(element);
                await pauseMs(100);
            }

            // Prefer pointer events - Greenhouse react-select commits on pointerdown.
            dispatchPointerClick(option);
            await pauseMs(160);

            if (await finalizeCommittedSelection({ blur: false })) {
                element.blur();

                return selectionCommitted();
            }

            dispatchReactSelectOptionMouseDown(option);
            await pauseMs(160);

            if (await finalizeCommittedSelection({ blur: false })) {
                element.blur();

                return selectionCommitted();
            }

            nativeClick(option);
            await pauseMs(160);

            if (await finalizeCommittedSelection({ blur: false })) {
                element.blur();

                return selectionCommitted();
            }

            element.focus();
            pressComboboxKey('ArrowDown');
            await pauseMs(60);
            pressComboboxKey('Enter');
            await pauseMs(160);

            if (await finalizeCommittedSelection()) {
                return true;
            }
        }

        // Type-to-filter then Enter - Greenhouse long lists often ignore bare clicks.
        if (
            isReactSelectComboboxShell(element) &&
            !isWorkableSelectCombobox(element) &&
            expected
        ) {
            const doc = element.ownerDocument || document;

            element.focus();
            openReactSelectDropdown(element);
            await pauseMs(80);
            await typeComboboxFilterText(element, expected);
            await pauseMs(150);

            const filteredOptions = collectComboboxOptions(doc, element);
            const filteredMatch =
                filteredOptions.find((candidate) =>
                    optionMatchesAnswer(
                        (
                            candidate.textContent ||
                            candidate.getAttribute?.('aria-label') ||
                            ''
                        )
                            .replace(/\s+/g, ' ')
                            .trim(),
                        expected,
                    ),
                ) || null;

            if (filteredMatch) {
                dispatchPointerClick(filteredMatch);
                await pauseMs(180);

                if (await finalizeCommittedSelection({ blur: false })) {
                    element.blur();

                    return selectionCommitted();
                }
            }

            pressComboboxKey('Enter');
            await pauseMs(180);

            if (await finalizeCommittedSelection()) {
                return true;
            }

            // Last resort: paint a durable single-value so Draft All verify matches DOM.
            if (commitReactSelectStaticValue(element, expected)) {
                await pauseMs(280);

                if (selectionCommitted()) {
                    heuristicsLog(
                        'info',
                        'apply.combobox',
                        'Combobox used static react-select fallback after click miss',
                        { expectedPreview: expected.slice(0, 80) },
                    );

                    return true;
                }
            }
        }

        return false;
    }

    async function typeComboboxFilterText(element, value) {
        const stringValue = String(value).trim();

        if (!stringValue) {
            return false;
        }

        element.focus();
        fillTextControlInstant(element, stringValue);
        element.dispatchEvent(
            new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertFromPaste',
                data: stringValue,
            }),
        );

        return true;
    }

    function clearValidationState(element) {
        if (!element) {
            return;
        }

        element.removeAttribute('aria-invalid');
        element.classList?.remove(
            'cx-select-input--invalid',
            'fb-dash-form-element__error-field',
        );
        element.closest('.input-row')?.classList.remove('input-row--invalid');
    }

    function clickAshbyYesNoButton(button) {
        button.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        button.focus();
        nativeClick(button);
    }

    function syncAshbyYesNoInertDom(scope, booleanAnswer, root = document) {
        const fieldScope =
            findAshbyYesNoScope(root, { anchor: scope }) || scope;
        const container = queryAshbyYesNoContainer(fieldScope);

        if (!container) {
            return false;
        }

        const buttons = Array.from(container.querySelectorAll('button'));
        const targetButton = buttons.find((button) =>
            optionMatchesAnswer(
                button.textContent.replace(/\s+/g, ' ').trim(),
                booleanAnswer,
            ),
        );

        if (!targetButton) {
            return false;
        }

        for (const candidate of buttons) {
            candidate.setAttribute(
                'aria-pressed',
                candidate === targetButton ? 'true' : 'false',
            );
        }

        const checkbox = container.querySelector('input[type="checkbox"]');

        if (checkbox) {
            // Live Ashby: checked=true for any answered Yes/No; value holds "Yes"/"No".
            const optionLabel = targetButton.textContent
                .replace(/\s+/g, ' ')
                .trim();
            setNativeValue(checkbox, optionLabel);
            setNativeChecked(checkbox, true);
            targetButton.classList.add('_active_1svni_57');

            for (const candidate of buttons) {
                if (candidate !== targetButton) {
                    candidate.classList.remove('_active_1svni_57');
                }
            }

            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }

        return isAshbyYesNoCommitted(fieldScope, booleanAnswer, root);
    }

    async function setAshbyYesNoValue(buttons, answer, options = {}) {
        const root = options.root || document;
        const dataFieldPath = options.dataFieldPath || null;
        const booleanAnswer = extractBooleanAnswer(answer);
        const anchor = Array.isArray(buttons) ? buttons[0] : buttons;
        const scope = findAshbyYesNoScope(root, { dataFieldPath, anchor });

        if (booleanAnswer !== 'yes' && booleanAnswer !== 'no') {
            heuristicsLog(
                'warn',
                'apply.yesno',
                'Could not extract boolean answer',
                {
                    dataFieldPath,
                    answerPreview: String(answer).slice(0, 80),
                    booleanAnswer,
                },
            );

            return false;
        }

        const clickStrategies = [clickAshbyYesNoButton, dispatchPointerClick];

        for (let attempt = 0; attempt < clickStrategies.length; attempt += 1) {
            const currentButtons = resolveAshbyYesNoButtons(
                buttons,
                dataFieldPath,
                root,
            );

            for (const button of currentButtons) {
                const optionText = button.textContent
                    .replace(/\s+/g, ' ')
                    .trim();

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
                await sleep(attempt === 0 ? 120 : 180);

                if (isAshbyYesNoCommitted(scope, booleanAnswer, root)) {
                    const container = queryAshbyYesNoContainer(scope);
                    const checkbox = container?.querySelector(
                        'input[type="checkbox"]',
                    );

                    heuristicsLog(
                        'info',
                        'apply.yesno',
                        'Yes/No selection verified',
                        {
                            dataFieldPath,
                            selection: readAshbyYesNoSelection(scope, root),
                            checkboxChecked: checkbox?.checked ?? null,
                            attempt: attempt + 1,
                        },
                    );

                    return true;
                }
            }
        }

        if (scope && syncAshbyYesNoInertDom(scope, booleanAnswer, root)) {
            heuristicsLog(
                'info',
                'apply.yesno',
                'Yes/No synced on inert DOM fallback',
                {
                    dataFieldPath,
                    booleanAnswer,
                },
            );

            return true;
        }

        heuristicsLog(
            'warn',
            'apply.yesno',
            'Yes/No fill failed after click attempts',
            {
                dataFieldPath,
                answerPreview: String(answer).slice(0, 80),
                booleanAnswer,
                options: resolveAshbyYesNoButtons(
                    buttons,
                    dataFieldPath,
                    root,
                ).map((button) =>
                    button.textContent.replace(/\s+/g, ' ').trim(),
                ),
                selection: readAshbyYesNoSelection(scope, root),
            },
        );

        return false;
    }

    function readReactSelectValue(element) {
        if (!element || element.getAttribute?.('role') !== 'combobox') {
            return null;
        }

        if (
            isIndeedApplyQuestionCombobox(element) ||
            isIndeedApplyResumeCombobox(element)
        ) {
            return readIndeedApplyComboboxValue(element);
        }

        if (isGreenhousePhoneCountryCombobox(element)) {
            return readGreenhousePhoneCountryValue(element);
        }

        const shell = element.closest('.select-shell, .select__container');
        const control =
            element.closest('.select__control') ||
            shell?.querySelector('.select__control');

        if (control) {
            const singleValue = control.querySelector(
                '.select__single-value, .select__multi-value__label',
            );

            if (singleValue?.textContent?.trim()) {
                return singleValue.textContent.replace(/\s+/g, ' ').trim();
            }

            const placeholder = control.querySelector('.select__placeholder');
            const placeholderVisible =
                placeholder &&
                placeholder.textContent?.trim() &&
                placeholder.offsetParent !== null &&
                getComputedStyle(placeholder).display !== 'none';

            // data-value on the input container often mirrors typed filter text
            // while the placeholder still says Select... - ignore in that case.
            if (!placeholderVisible) {
                const dataValueContainer =
                    control.querySelector(
                        '.select__input-container[data-value]',
                    ) ||
                    element.closest('.select__input-container[data-value]');
                const dataValue = String(
                    dataValueContainer?.getAttribute('data-value') || '',
                ).trim();

                if (dataValue.length >= 1 && !/^select\b/i.test(dataValue)) {
                    return dataValue;
                }
            }
        }

        const hiddenValue = shell?.querySelector(
            'input[tabindex="-1"][aria-hidden="true"]',
        );

        // Never trust the Greenhouse required companion without a visible
        // single-value. Hidden "LinkedIn" with Select... still showing was a
        // false Draft All success on Formlabs.
        if (
            hiddenValue?.value?.trim() &&
            readReactSelectSingleValueText(element)
        ) {
            return hiddenValue.value.trim();
        }

        // Workable custom select: companion value input beside the readonly combobox.
        const workableRoot = element.closest('[data-input-type="select"]');
        const workableHidden = resolveWorkableHiddenSelectInput(
            workableRoot,
            element,
        );
        const comboboxText = String(element.value || '')
            .replace(/\s+/g, ' ')
            .trim();

        // Do not treat react-select filter input text as the selected value.
        // Greenhouse source-of-hire was returning filled:true while still on Select...
        if (
            workableRoot &&
            comboboxText.length >= 2 &&
            !/^select an option/i.test(comboboxText)
        ) {
            return comboboxText;
        }

        if (
            !shell &&
            !control &&
            comboboxText.length >= 2 &&
            !/^select an option/i.test(comboboxText) &&
            !/^select\.\.\.$/i.test(comboboxText)
        ) {
            return comboboxText;
        }

        if (workableHidden?.value?.trim()) {
            // Prefer visible option text when the value is an opaque id.
            const display =
                workableRoot.querySelector('[data-role="illustrated-input"]')
                    ?.textContent ||
                element.getAttribute('aria-label') ||
                '';
            const displayText = String(display || '')
                .replace(/\s+/g, ' ')
                .trim();

            if (
                displayText.length >= 2 &&
                !/^select an option/i.test(displayText)
            ) {
                return displayText;
            }

            return workableHidden.value.trim();
        }

        // React-select keeps typed filter text on the input while placeholder
        // still shows Select... - never treat that as a committed value.
        if (shell || control) {
            return null;
        }

        const typed = String(element.value || '').trim();

        return typed || null;
    }

    function openReactSelectDropdown(element) {
        const control = element.closest('.select__control');
        const toggle = control?.querySelector(
            '.select__indicators button, button[aria-label="Toggle flyout"]',
        );

        if (toggle) {
            dispatchPointerClick(toggle);

            return;
        }

        dispatchPointerClick(element);
    }

    function clearLinkedInFieldErrorMarkers(element) {
        element.classList?.remove('fb-dash-form-element__error-field');

        const describedBy = element.getAttribute('aria-describedby');

        if (!describedBy) {
            return;
        }

        for (const id of describedBy.split(/\s+/)) {
            const errorRoot = element.ownerDocument?.getElementById(id);

            if (!errorRoot) {
                continue;
            }

            for (const node of errorRoot.querySelectorAll(
                '[data-test-form-element-error-messages], .artdeco-inline-feedback--error',
            )) {
                node.style.display = 'none';
                node.setAttribute('hidden', 'hidden');
            }
        }
    }

    function resolveComboboxListbox(doc, element) {
        if (!element) {
            return null;
        }

        const controlsId = element.getAttribute('aria-controls');

        if (controlsId) {
            const byId = doc.getElementById(controlsId);

            if (byId) {
                return byId;
            }
        }

        if (element.id) {
            const byPattern = doc.getElementById(
                `react-select-${element.id}-listbox`,
            );

            if (byPattern) {
                return byPattern;
            }
        }

        if (element.getAttribute('aria-expanded') === 'true') {
            const menus = Array.from(
                doc.querySelectorAll('.select__menu, [role="listbox"]'),
            ).filter(isVisible);

            for (const menu of menus) {
                if (controlsId && menu.id === controlsId) {
                    return menu;
                }

                const labelledBy = menu.getAttribute('aria-labelledby');

                if (labelledBy && element.id) {
                    const labelNode = labelledBy
                        .split(/\s+/)
                        .map((id) => doc.getElementById(id))
                        .find(Boolean);
                    const labelFor =
                        labelNode?.getAttribute('for') || labelNode?.htmlFor;

                    if (labelFor === element.id) {
                        return menu;
                    }
                }
            }
        }

        return null;
    }

    function isWorkableSelectCombobox(element) {
        return Boolean(
            element &&
            element.getAttribute?.('role') === 'combobox' &&
            isWorkableApplyHost(element.ownerDocument || document) &&
            element.closest('[data-input-type="select"]'),
        );
    }

    function openWorkableSelectDropdown(element) {
        const root = element?.closest?.('[data-input-type="select"]');

        dispatchPointerClick(element);

        const illustrated = root?.querySelector(
            '[data-role="illustrated-input"]',
        );

        if (illustrated) {
            dispatchPointerClick(illustrated);
        }

        if (root) {
            root.setAttribute('data-open', 'true');
        }

        element.setAttribute('aria-expanded', 'true');
    }

    function resolveWorkableHiddenSelectInput(root, combobox) {
        if (!root) {
            return null;
        }

        const hidden = root.querySelector(
            'input[tabindex="-1"][aria-hidden="true"], input[aria-hidden="true"]',
        );

        if (hidden) {
            return hidden;
        }

        const comboboxId = String(combobox?.id || '');
        const qaName =
            comboboxId.match(/input_(QA_[A-Za-z0-9_]+)_input/i)?.[1] ||
            comboboxId.match(/input_(CA_\d+)_input/i)?.[1];

        if (qaName) {
            return (
                root.querySelector(`input[name="${qaName}"]`) ||
                combobox?.ownerDocument?.querySelector?.(
                    `input[name="${qaName}"]`,
                )
            );
        }

        return null;
    }

    function resolveWorkableOptionValue(optionElement, optionText) {
        const candidates = [
            optionElement?.getAttribute?.('data-value'),
            optionElement?.getAttribute?.('data-index'),
            optionElement?.getAttribute?.('data-key'),
            optionElement?.getAttribute?.('value'),
            optionElement?.id,
        ]
            .map((value) => String(value || '').trim())
            .filter(Boolean);

        for (const candidate of candidates) {
            if (/^\d+$/.test(candidate)) {
                return candidate;
            }
        }

        return candidates[0] || String(optionText || '').trim();
    }

    function collectLiveWorkableComboboxOptions(doc, combobox) {
        if (!isWorkableSelectCombobox(combobox)) {
            return [];
        }

        const controlsId = combobox.getAttribute('aria-controls');
        const listbox = controlsId ? doc.getElementById(controlsId) : null;

        if (listbox) {
            return Array.from(
                listbox.querySelectorAll(
                    '[role="option"], li, [data-index], [data-value]',
                ),
            );
        }

        const root = combobox.closest('[data-input-type="select"]');

        return Array.from(
            root?.querySelectorAll(
                '[role="option"], li, [data-index], [data-value]',
            ) || [],
        );
    }

    function clickWorkableListboxOptionByKeyboard(combobox, optionText) {
        if (!combobox || !optionText) {
            return false;
        }

        combobox.focus();

        for (let step = 0; step < 40; step += 1) {
            const current = String(
                readReactSelectValue(combobox) || combobox.value || '',
            ).trim();

            if (current && optionMatchesAnswer(current, optionText)) {
                return true;
            }

            combobox.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowDown',
                    code: 'ArrowDown',
                    bubbles: true,
                    cancelable: true,
                }),
            );
            combobox.dispatchEvent(
                new KeyboardEvent('keyup', {
                    key: 'ArrowDown',
                    code: 'ArrowDown',
                    bubbles: true,
                }),
            );
        }

        combobox.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
                cancelable: true,
            }),
        );
        combobox.dispatchEvent(
            new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
            }),
        );

        const committed = String(
            readReactSelectValue(combobox) || combobox.value || '',
        ).trim();

        return (
            committed.length >= 2 && optionMatchesAnswer(committed, optionText)
        );
    }

    function clickWorkableListboxOption(
        doc,
        combobox,
        optionElement,
        optionText,
    ) {
        const listboxOptions = collectLiveWorkableComboboxOptions(
            doc,
            combobox,
        );
        let target = optionElement;

        const liveMatch = listboxOptions.find((node) =>
            optionMatchesAnswer(
                normalize(
                    node.textContent || node.getAttribute?.('aria-label') || '',
                ),
                optionText,
            ),
        );

        if (liveMatch) {
            target = liveMatch;
        }

        const clickTargets = [
            target,
            target.querySelector?.('[role="option"]'),
            target.querySelector?.('div, span, li, button'),
            target.parentElement,
        ].filter(Boolean);

        for (const node of clickTargets) {
            dispatchReactSelectOptionMouseDown(node);
            nativeClick(node);
            dispatchPointerClick(node);
        }

        if (!clickWorkableListboxOptionByKeyboard(combobox, optionText)) {
            return;
        }
    }

    function workableSelectIsCommitted(combobox, answer) {
        if (!isWorkableSelectCombobox(combobox)) {
            return false;
        }

        const root = combobox.closest('[data-input-type="select"]');
        const hidden = resolveWorkableHiddenSelectInput(root, combobox);
        const visible = String(
            readReactSelectValue(combobox) || combobox.value || '',
        ).trim();
        const hiddenValue = String(hidden?.value || '').trim();

        if (visible && valueMatchesAnswer(visible, answer)) {
            return true;
        }

        return Boolean(hiddenValue);
    }

    function syncWorkableHiddenSelectValue(
        combobox,
        optionText,
        optionElement,
    ) {
        if (!isWorkableSelectCombobox(combobox)) {
            return;
        }

        const root = combobox.closest('[data-input-type="select"]');
        const hidden = resolveWorkableHiddenSelectInput(root, combobox);
        const optionValue = resolveWorkableOptionValue(
            optionElement,
            optionText,
        );

        if (optionText) {
            setNativeValue(combobox, optionText);
            combobox.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (hidden && optionValue) {
            setNativeValue(hidden, optionValue);
            hidden.dispatchEvent(new Event('input', { bubbles: true }));
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }

        root?.setAttribute('data-open', 'false');
        root?.setAttribute('data-error', 'false');
    }

    function collectComboboxOptions(doc, element) {
        const questionLabel = getQuestionLabel(element);
        let options = [];

        if (isWorkableSelectCombobox(element)) {
            const controlsId = element.getAttribute('aria-controls');
            const listbox = controlsId ? doc.getElementById(controlsId) : null;

            if (listbox) {
                options = Array.from(
                    listbox.querySelectorAll(
                        '[role="option"], li[data-value], [data-index]',
                    ),
                );
            }

            if (options.length === 0) {
                const root = element.closest('[data-input-type="select"]');

                options = Array.from(
                    root?.querySelectorAll(
                        '[role="option"], li[data-value], [data-index]',
                    ) || [],
                );
            }
        }

        const listbox =
            options.length === 0 ? resolveComboboxListbox(doc, element) : null;

        if (listbox && !isIncidentalListbox(listbox, questionLabel)) {
            options = Array.from(
                listbox.querySelectorAll('[role="option"], .select__option'),
            );
        }

        if (options.length === 0) {
            const indeedScope = getIndeedQuestionFieldRoot(element);

            if (indeedScope) {
                options = Array.from(
                    indeedScope.querySelectorAll('[role="option"]'),
                );
            }
        }

        if (options.length === 0) {
            const fieldWrapper = element.closest(
                '.field-wrapper, .select__container, .select, [data-field-path], .application-question, .application-field, li.application-question',
            );

            if (fieldWrapper) {
                options = Array.from(
                    fieldWrapper.querySelectorAll(
                        '[role="option"], .select__option',
                    ),
                ).filter(isVisible);
            }
        }

        if (
            options.length === 0 &&
            element.getAttribute('aria-expanded') === 'true'
        ) {
            options = Array.from(
                doc.querySelectorAll(
                    '.basic-typeahead__selectable, [data-test-typeahead-result]',
                ),
            ).filter(isVisible);
        }

        if (isWorkableSelectCombobox(element)) {
            return options;
        }

        return options.filter(isVisible);
    }

    function isInventoryPlaceholderOption(text) {
        const normalized = normalize(text);

        return (
            PLACEHOLDER_SELECT_OPTION_PATTERN.test(normalized) ||
            /^select\.{0,3}$/i.test(normalized) ||
            /^choose\b/i.test(normalized)
        );
    }

    function stripSvgBrowserNoise(text) {
        return String(text || '')
            .replace(/svgs?\s+not\s+supported\s+by\s+this\s+browser\.?\s*/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function optionElementsToLabels(optionElements, limit = 50) {
        const labels = [];
        const seen = new Set();

        for (const option of optionElements || []) {
            const text = stripSvgBrowserNoise(
                option.textContent ||
                    option.getAttribute?.('aria-label') ||
                    option.value ||
                    '',
            );

            if (text.length === 0 || isInventoryPlaceholderOption(text)) {
                continue;
            }

            const key = text.toLowerCase();

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            labels.push(text);

            if (labels.length >= limit) {
                break;
            }
        }

        return labels;
    }

    function shouldSkipComboboxOptionHarvest(element) {
        if (!element || element.getAttribute?.('role') !== 'combobox') {
            return true;
        }

        return (
            isIndeedApplyComboboxFilterInput(element) ||
            isGreenhousePhoneCountryCombobox(element) ||
            isReactPhoneCountrySelect(element) ||
            isGreenhouseLocationCombobox(element)
        );
    }

    function collectStaticComboboxOptionLabels(element, doc = null) {
        const ownerDoc = doc || element?.ownerDocument || document;

        if (!element || element.getAttribute?.('role') !== 'combobox') {
            return [];
        }

        const questionLabel = getQuestionLabel(element);
        const fieldWrapper = element.closest(
            '.field-wrapper, .select__container, .select, [data-field-path], .application-question, .application-field, li.application-question',
        );

        if (fieldWrapper) {
            const nativeSelect = fieldWrapper.querySelector('select');

            if (nativeSelect) {
                const nativeLabels = optionElementsToLabels(
                    Array.from(nativeSelect.options),
                );

                if (nativeLabels.length >= 2) {
                    return nativeLabels;
                }
            }
        }

        const indeedScope = getIndeedQuestionFieldRoot(element);

        if (indeedScope) {
            const indeedLabels = optionElementsToLabels(
                Array.from(indeedScope.querySelectorAll('[role="option"]')),
            );

            if (indeedLabels.length >= 2) {
                return indeedLabels;
            }
        }

        const listboxId = element.getAttribute('aria-controls');

        if (listboxId) {
            const listbox = ownerDoc.getElementById(listboxId);

            if (listbox && !isIncidentalListbox(listbox, questionLabel)) {
                const listboxLabels = optionElementsToLabels(
                    Array.from(listbox.querySelectorAll('[role="option"]')),
                );

                if (listboxLabels.length >= 2) {
                    return listboxLabels;
                }
            }
        }

        const leverRoot = element.closest(
            'li.application-question, .application-question',
        );

        if (leverRoot) {
            const leverLabels = optionElementsToLabels(
                Array.from(
                    leverRoot.querySelectorAll(
                        '[role="option"], .application-answer-alternative label',
                    ),
                ),
            );

            if (leverLabels.length >= 2) {
                return leverLabels;
            }
        }

        const ashbyEntry = getAshbyFieldEntry(element);

        if (ashbyEntry) {
            const ashbyLabels = optionElementsToLabels(
                Array.from(
                    ashbyEntry.querySelectorAll(
                        '[class*="_option_"], [role="option"]',
                    ),
                ),
            );

            if (ashbyLabels.length >= 2) {
                return ashbyLabels;
            }
        }

        const generalLabels = optionElementsToLabels(
            collectComboboxOptions(ownerDoc, element),
        );

        return generalLabels.length >= 2 ? generalLabels : [];
    }

    async function closeOpenComboboxMenus(doc) {
        const openComboboxes = Array.from(
            doc.querySelectorAll?.('[role="combobox"][aria-expanded="true"]') ||
                [],
        );
        const active = doc.activeElement;

        if (
            active?.getAttribute?.('role') === 'combobox' &&
            !openComboboxes.includes(active)
        ) {
            openComboboxes.push(active);
        }

        const KeyboardEventCtor =
            typeof KeyboardEvent !== 'undefined' ? KeyboardEvent : null;
        const MouseEventCtor =
            typeof MouseEvent !== 'undefined' ? MouseEvent : null;
        const greenhouseHost = isGreenhouseApplyHost(doc);

        for (const combobox of openComboboxes) {
            // Escape on Greenhouse react-select often clears the committed
            // value of the previous field when Draft All opens the next menu.
            if (KeyboardEventCtor && !greenhouseHost) {
                combobox.dispatchEvent(
                    new KeyboardEventCtor('keydown', {
                        key: 'Escape',
                        bubbles: true,
                        cancelable: true,
                    }),
                );
                combobox.dispatchEvent(
                    new KeyboardEventCtor('keyup', {
                        key: 'Escape',
                        bubbles: true,
                    }),
                );
            }

            combobox.setAttribute('aria-expanded', 'false');
        }

        // Greenhouse react-select treats a body mousedown as canceling an
        // in-flight selection and can wipe the previous field in a batch.
        if (!greenhouseHost && MouseEventCtor) {
            doc.body?.dispatchEvent(
                new MouseEventCtor('mousedown', { bubbles: true }),
            );
            doc.body?.dispatchEvent(
                new MouseEventCtor('mouseup', { bubbles: true }),
            );
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 60);
        });
    }

    async function harvestLazyComboboxOptionLabels(element) {
        if (shouldSkipComboboxOptionHarvest(element)) {
            return [];
        }

        const doc = element.ownerDocument || document;
        const staticLabels = collectStaticComboboxOptionLabels(element, doc);

        if (staticLabels.length >= 2) {
            return staticLabels;
        }

        const isGreenhouseHost = isGreenhouseApplyHost(doc);
        const maxAttempts = isGreenhouseHost ? 4 : 12;
        const optionWaitMs = isGreenhouseHost ? 200 : 900;

        const beforeValue =
            readReactSelectValue(element) || String(element.value || '').trim();

        await closeOpenComboboxMenus(doc);

        element.focus();
        openReactSelectDropdown(element);

        let optionElements = [];

        for (
            let attempt = 0;
            attempt < maxAttempts && optionElements.length < 2;
            attempt += 1
        ) {
            optionElements = collectComboboxOptions(doc, element);

            if (optionElements.length >= 2) {
                break;
            }

            await new Promise((resolve) => {
                setTimeout(resolve, isGreenhouseHost ? 40 : 80);
            });
        }

        if (optionElements.length === 0) {
            optionElements = await waitForComboboxOptions(
                doc,
                element,
                optionWaitMs,
            );
        }

        const labels = optionElementsToLabels(optionElements);

        await closeOpenComboboxMenus(doc);

        const afterValue =
            readReactSelectValue(element) || String(element.value || '').trim();

        if (beforeValue && afterValue && beforeValue !== afterValue) {
            heuristicsLog(
                'debug',
                'inventory.options',
                'Combobox value changed during option harvest; restoring',
                {
                    beforeValue: beforeValue.slice(0, 80),
                    afterValue: afterValue.slice(0, 80),
                    fieldId: element.id || null,
                },
            );
            await setAshbyComboboxValue(element, beforeValue);
        }

        return labels.length >= 2 ? labels : staticLabels;
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

        return (
            /\blocation\s*\(\s*city\b/i.test(label) ||
            (/\blocation\b/i.test(label) && /\b(?:city|town)\b/i.test(label))
        );
    }

    function isGreenhousePhoneCountryCombobox(element) {
        if (
            !element ||
            !isGreenhouseApplyHost(element.ownerDocument || document)
        ) {
            return false;
        }

        return (
            element.id === 'country' &&
            element.getAttribute?.('role') === 'combobox'
        );
    }

    function getGreenhousePhoneCountryButton(element) {
        const doc = element.ownerDocument || document;
        const phoneInput = doc.getElementById('phone');
        const scope =
            element.closest('.field-wrapper') ||
            phoneInput?.closest('.field-wrapper') ||
            element.closest('form') ||
            doc;

        const listboxButton = scope.querySelector(
            'button[aria-haspopup="listbox"]',
        );

        if (listboxButton) {
            return listboxButton;
        }

        return (
            Array.from(scope.querySelectorAll('button')).find(
                (button) =>
                    /country/i.test(button.getAttribute('aria-label') || '') ||
                    /country/i.test(button.textContent || ''),
            ) || null
        );
    }

    function readGreenhousePhoneCountryValue(element) {
        const button = getGreenhousePhoneCountryButton(element);

        if (!button) {
            return String(element.value || '').trim() || null;
        }

        const aria = String(button.getAttribute('aria-label') || '');
        const selectedMatch = aria.match(/\bselected\s+(.+)$/i);

        if (selectedMatch?.[1]) {
            return selectedMatch[1].replace(/\s+/g, ' ').trim();
        }

        return readPhoneCountryListboxValue(button);
    }

    async function setGreenhousePhoneCountryValue(element, value) {
        const stringValue = String(value || '').trim();

        if (!element || !stringValue) {
            return false;
        }

        const current = readGreenhousePhoneCountryValue(element);

        if (phoneCountryOptionMatches(current, stringValue)) {
            return true;
        }

        const doc = element.ownerDocument || document;

        element.focus();
        dispatchPointerClick(element);
        await fillTypeaheadSearchText(element, stringValue);

        let options = await waitForComboboxOptions(doc, element, 1500);

        if (options.length === 0) {
            await fillTypeaheadSearchText(element, stringValue);
            options = await waitForComboboxOptions(doc, element, 1500);
        }

        for (const option of options) {
            const optionText = (
                option.textContent ||
                option.getAttribute('aria-label') ||
                ''
            )
                .replace(/\s+/g, ' ')
                .trim();

            if (phoneCountryOptionMatches(optionText, stringValue)) {
                dispatchPointerClick(option);
                await sleep(120);
                element.dispatchEvent(
                    new FocusEvent('blur', { bubbles: true }),
                );

                const selection = readGreenhousePhoneCountryValue(element);

                if (phoneCountryOptionMatches(selection, stringValue)) {
                    heuristicsLog(
                        'info',
                        'apply.combobox',
                        'Greenhouse phone country option selected',
                        {
                            optionText,
                            selection: selection?.slice(0, 80) || null,
                        },
                    );

                    return true;
                }

                heuristicsLog(
                    'info',
                    'apply.combobox',
                    'Greenhouse phone country option clicked',
                    {
                        optionText,
                        selection: selection?.slice(0, 80) || null,
                    },
                );

                return true;
            }
        }

        const button = getGreenhousePhoneCountryButton(element);

        if (button) {
            const filled = await setPhoneCountryListboxValue(
                button,
                stringValue,
            );

            heuristicsLog(
                filled ? 'info' : 'warn',
                'apply.combobox',
                filled
                    ? 'Greenhouse phone country listbox value set via button'
                    : 'Greenhouse phone country listbox fill failed',
                {
                    valuePreview: stringValue.slice(0, 80),
                    selection:
                        readGreenhousePhoneCountryValue(element)?.slice(
                            0,
                            80,
                        ) || null,
                },
            );

            return filled;
        }

        heuristicsLog(
            'warn',
            'apply.combobox',
            'Greenhouse phone country fill failed',
            {
                valuePreview: stringValue.slice(0, 80),
                optionCount: options.length,
            },
        );

        return false;
    }

    async function commitGreenhouseLocationValue(element, value) {
        const stringValue = String(value).trim();
        const typedValue = stringValue.split(',')[0].trim() || stringValue;

        await fillReactTextControl(element, typedValue);

        const shell = element.closest('.select-shell, .select__container');
        const hiddenValue = shell?.querySelector(
            'input[tabindex="-1"][aria-hidden="true"]',
        );

        if (hiddenValue) {
            setNativeValue(hiddenValue, typedValue);
            hiddenValue.dispatchEvent(new Event('input', { bubbles: true }));
            hiddenValue.dispatchEvent(new Event('change', { bubbles: true }));
        }

        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

        return (
            valueMatchesAnswer(readReactSelectValue(element), typedValue) ||
            valueMatchesAnswer(element.value, typedValue) ||
            valueMatchesAnswer(hiddenValue?.value, typedValue)
        );
    }

    function commitReactSelectStaticValue(element, value) {
        const stringValue = String(value).trim();

        if (!stringValue) {
            return false;
        }

        const shell = element.closest('.select-shell, .select__container');
        const control =
            element.closest('.select__control') ||
            shell?.querySelector('.select__control');
        const hiddenValue = shell?.querySelector(
            'input[tabindex="-1"][aria-hidden="true"]',
        );

        setNativeValue(element, stringValue);
        element.dispatchEvent(new Event('input', { bubbles: true }));

        if (hiddenValue) {
            setNativeValue(hiddenValue, stringValue);
            hiddenValue.dispatchEvent(new Event('input', { bubbles: true }));
            hiddenValue.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (control) {
            const placeholder = control.querySelector('.select__placeholder');

            if (placeholder) {
                placeholder.style.display = 'none';
            }

            const valueContainer =
                control.querySelector('.select__value-container') || control;
            let singleValue = control.querySelector('.select__single-value');

            if (!singleValue) {
                singleValue = (element.ownerDocument || document).createElement(
                    'div',
                );
                singleValue.className = 'select__single-value';
                valueContainer.appendChild(singleValue);
            }

            singleValue.textContent = stringValue;
        }

        element.setAttribute('aria-expanded', 'false');
        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

        return (
            valueMatchesAnswer(readReactSelectValue(element), stringValue) ||
            valueMatchesAnswer(element.value, stringValue) ||
            valueMatchesAnswer(hiddenValue?.value, stringValue)
        );
    }

    function isIndeedIdentityField(element) {
        const testId = element?.getAttribute?.('data-testid') || '';
        const name = element?.getAttribute?.('name') || '';

        if (
            testId.startsWith('name-fields-') ||
            testId.startsWith('location-fields-')
        ) {
            return true;
        }

        if (
            name === 'phone' ||
            name === 'names-first-name' ||
            name === 'names-last-name'
        ) {
            return true;
        }

        if (
            name === 'location-postal-code' ||
            name === 'location-locality' ||
            name === 'location-address'
        ) {
            return true;
        }

        return false;
    }

    function getIndeedNameFieldLabel(element) {
        const testId = element?.getAttribute?.('data-testid') || '';

        if (!testId.startsWith('name-fields-') || !testId.endsWith('-input')) {
            return '';
        }

        const doc = element.ownerDocument || document;
        const labelTestId = testId.replace(/-input$/, '-label');
        const labelSpan = doc.querySelector(`[data-testid="${labelTestId}"]`);

        if (labelSpan?.textContent?.trim()) {
            return dedupeRepeatedLabelTokens(normalize(labelSpan.textContent));
        }

        return '';
    }

    function isIndeedApplyComboboxFilterInput(element) {
        if (!element || element.tagName?.toLowerCase() !== 'input') {
            return false;
        }

        const testId = element.getAttribute('data-testid') || '';

        return testId.includes('select-list-filter-input');
    }

    function isIndeedApplyResumeCombobox(element) {
        if (!element || element.getAttribute?.('role') !== 'combobox') {
            return false;
        }

        if (!isIndeedApplyPage(element.ownerDocument || document)) {
            return false;
        }

        const testId = element.getAttribute('data-testid') || '';
        const name = element.getAttribute('name') || '';

        return (
            testId === 'job-title-input' ||
            testId === 'company-name-input' ||
            name === 'jobTitle' ||
            name === 'companyName'
        );
    }

    function isIndeedApplyQuestionCombobox(element) {
        if (!element || element.getAttribute?.('role') !== 'combobox') {
            return false;
        }

        if (
            isIndeedApplyLocationCombobox(element) ||
            isIndeedApplyResumeCombobox(element)
        ) {
            return false;
        }

        const testId = element.getAttribute('data-testid') || '';

        return testId.includes('select-list');
    }

    function readIndeedApplyComboboxValue(element) {
        if (!element) {
            return null;
        }

        if (element.tagName?.toLowerCase() === 'input') {
            const inputValue = String(element.value || '').trim();

            if (inputValue) {
                return inputValue;
            }
        }

        const dedicatedDisplay = element.querySelector('[class*="ew4qyo"]');

        if (dedicatedDisplay?.textContent?.trim()) {
            return dedicatedDisplay.textContent.replace(/\s+/g, ' ').trim();
        }

        const scope = getIndeedQuestionFieldRoot(element);
        const selectedOption = scope?.querySelector(
            '[role="option"][aria-selected="true"]',
        );

        if (selectedOption?.textContent?.trim()) {
            return selectedOption.textContent.replace(/\s+/g, ' ').trim();
        }

        const text = (element.textContent || '').replace(/\s+/g, ' ').trim();

        return text.length >= 2 ? text : null;
    }

    function isIndeedApplyComboboxFilled(element) {
        const value = readIndeedApplyComboboxValue(element);

        if (!value || /^search to select/i.test(value)) {
            return false;
        }

        const scope = getIndeedQuestionFieldRoot(element);

        if (scope?.querySelector('[role="option"][aria-selected="true"]')) {
            return true;
        }

        return value.length >= 2;
    }

    async function setIndeedApplyResumeComboboxValue(element, value) {
        if (!element || value === null || value === undefined || value === '') {
            return false;
        }

        const doc = element.ownerDocument || document;
        const stringValue = String(value).trim();
        const typedValue = stringValue.split(',')[0].trim() || stringValue;

        heuristicsLog(
            'debug',
            'apply.combobox',
            'Starting Indeed resume combobox fill',
            {
                testId: element.getAttribute('data-testid'),
                valuePreview: typedValue.slice(0, 80),
            },
        );

        element.focus();
        dispatchPointerClick(element);
        element.setAttribute('aria-expanded', 'true');
        fillTextControlInstant(element, typedValue);
        element.dispatchEvent(
            new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertFromPaste',
                data: typedValue,
            }),
        );

        let options = await waitForComboboxOptions(doc, element, 1500);

        if (options.length === 0) {
            element.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowDown',
                    bubbles: true,
                    cancelable: true,
                }),
            );
            options = await waitForComboboxOptions(doc, element, 1000);
        }

        const normalizedAnswer = normalizeOption(stringValue);

        for (const option of options) {
            const optionText = (
                option.textContent ||
                option.getAttribute('aria-label') ||
                ''
            )
                .replace(/\s+/g, ' ')
                .trim();

            if (
                optionMatchesAnswer(optionText, stringValue) ||
                normalizeOption(optionText).includes(
                    normalizedAnswer.slice(0, 24),
                )
            ) {
                heuristicsLog(
                    'info',
                    'apply.combobox',
                    'Indeed resume combobox option matched',
                    { optionText },
                );

                return commitComboboxOptionSelection(
                    element,
                    option,
                    stringValue,
                );
            }
        }

        if (options.length > 0) {
            const fallbackText = (options[0].textContent || '')
                .replace(/\s+/g, ' ')
                .trim();
            heuristicsLog(
                'warn',
                'apply.combobox',
                'Indeed resume combobox using first option fallback',
                { fallbackText },
            );

            return commitComboboxOptionSelection(
                element,
                options[0],
                stringValue || fallbackText,
            );
        }

        element.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Enter',
                bubbles: true,
                cancelable: true,
            }),
        );
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.setAttribute('aria-expanded', 'false');
        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        clearValidationState(element);

        const committed =
            valueMatchesAnswer(element.value, typedValue) ||
            element.value.trim().length >= 2;
        heuristicsLog(
            committed ? 'info' : 'warn',
            'apply.combobox',
            committed
                ? 'Indeed resume combobox committed typed value'
                : 'Indeed resume combobox fill failed',
            {
                typedValue: element.value?.slice(0, 80),
            },
        );

        return committed;
    }

    async function setIndeedApplyQuestionComboboxValue(element, value) {
        if (!element || value === null || value === undefined || value === '') {
            return false;
        }

        const doc = element.ownerDocument || document;
        const stringValue = String(value).trim();
        const typedValue = stringValue.split(',')[0].trim() || stringValue;
        const scope = getIndeedQuestionFieldRoot(element);

        dispatchPointerClick(element);

        const filter = scope?.querySelector(
            '[data-testid$="select-list-filter-input"]',
        );

        if (filter) {
            await fillTypeaheadSearchText(filter, typedValue);
        }

        let options = [];

        if (scope) {
            options = Array.from(
                scope.querySelectorAll('[role="option"]'),
            ).filter(isVisible);
        }

        if (options.length === 0) {
            options = await waitForComboboxOptions(doc, element, 1200);
        }

        let bestOption = null;
        let bestScore = -1;

        for (const option of options) {
            const optionText = (
                option.textContent ||
                option.getAttribute('aria-label') ||
                ''
            )
                .replace(/\s+/g, ' ')
                .trim();
            const score = scoreLinkedInLocationOption(
                optionText,
                stringValue,
                typedValue,
            );

            if (score > bestScore) {
                bestScore = score;
                bestOption = option;
            }
        }

        if (bestOption) {
            const selectedText = (bestOption.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();

            return commitComboboxOptionSelection(
                element,
                bestOption,
                selectedText || stringValue,
            );
        }

        return false;
    }

    function isIndeedApplyLocationCombobox(element) {
        if (!element || element.getAttribute?.('role') !== 'combobox') {
            return false;
        }

        const testId = element.getAttribute('data-testid') || '';
        const name = element.getAttribute('name') || '';
        const id = element.id || '';

        return (
            testId === 'location-fields-locality-input' ||
            name === 'location-locality' ||
            id === 'location-fields-locality-input'
        );
    }

    async function setIndeedApplyLocationComboboxValue(element, value) {
        if (!element || value === null || value === undefined || value === '') {
            return false;
        }

        const doc = element.ownerDocument || document;
        const stringValue = String(value).trim();
        const typedValue = stringValue.split(',')[0].trim() || stringValue;

        element.focus();
        dispatchPointerClick(element);
        await fillTypeaheadSearchText(element, typedValue);

        let options = await waitForComboboxOptions(doc, element, 1200);

        if (options.length === 0) {
            await fillTypeaheadSearchText(element, typedValue);
            options = await waitForComboboxOptions(doc, element, 1200);
        }

        let bestOption = null;
        let bestScore = -1;

        for (const option of options) {
            const optionText = (
                option.textContent ||
                option.getAttribute('aria-label') ||
                ''
            )
                .replace(/\s+/g, ' ')
                .trim();
            const score = scoreLinkedInLocationOption(
                optionText,
                stringValue,
                typedValue,
            );

            if (score > bestScore) {
                bestScore = score;
                bestOption = option;
            }
        }

        if (bestOption) {
            const selectedText = (bestOption.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();

            return commitComboboxOptionSelection(
                element,
                bestOption,
                selectedText || stringValue,
            );
        }

        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

        return (
            valueMatchesAnswer(element.value, typedValue) ||
            valueMatchesAnswer(element.value, stringValue)
        );
    }

    function isLinkedInGeoLocationCombobox(element) {
        if (!element || element.getAttribute('role') !== 'combobox') {
            return false;
        }

        const id = element.id || '';

        if (id.includes('location-GEO-LOCATION')) {
            return true;
        }

        return Boolean(
            element.closest(
                '[data-test-single-typeahead-entity-form-component]',
            ) && isGreenhouseLocationCombobox(element),
        );
    }

    function scoreLinkedInLocationOption(optionText, answer, typedValue) {
        const normalizedOption = normalizeOption(optionText);
        const normalizedAnswer = normalizeOption(answer);
        const normalizedTyped = normalizeOption(typedValue);
        let score = 0;

        if (optionMatchesAnswer(optionText, answer)) {
            score += 20;
        }

        if (normalizedTyped && normalizedOption.includes(normalizedTyped)) {
            score += 10;
        }

        if (
            normalizedAnswer &&
            normalizedOption.includes(
                normalizedAnswer.slice(
                    0,
                    Math.min(normalizedAnswer.length, 24),
                ),
            )
        ) {
            score += 6;
        }

        if (/,/.test(optionText)) {
            score += 2;
        }

        return score;
    }

    async function setLinkedInGeoLocationValue(element, value) {
        if (!element || value === null || value === undefined || value === '') {
            return false;
        }

        const doc = element.ownerDocument || document;
        const stringValue = String(value).trim();
        const typedValue = stringValue.split(',')[0].trim() || stringValue;

        element.focus();
        dispatchPointerClick(element);
        await fillTypeaheadSearchText(element, typedValue);

        let options = await waitForComboboxOptions(doc, element, 1500);

        if (options.length === 0) {
            await fillTypeaheadSearchText(element, typedValue);
            options = await waitForComboboxOptions(doc, element, 1500);
        }

        heuristicsLog(
            'debug',
            'apply.combobox',
            'LinkedIn location options collected',
            {
                optionCount: options.length,
                typedValue,
                options: options
                    .slice(0, 6)
                    .map((option) =>
                        (option.textContent || '').replace(/\s+/g, ' ').trim(),
                    ),
            },
        );

        let bestOption = null;
        let bestScore = -1;

        for (const option of options) {
            const optionText = (
                option.textContent ||
                option.getAttribute('aria-label') ||
                ''
            )
                .replace(/\s+/g, ' ')
                .trim();
            const score = scoreLinkedInLocationOption(
                optionText,
                stringValue,
                typedValue,
            );

            if (score > bestScore) {
                bestScore = score;
                bestOption = option;
            }
        }

        if (bestOption) {
            const selectedText = (
                bestOption.textContent ||
                bestOption.getAttribute('aria-label') ||
                ''
            )
                .replace(/\s+/g, ' ')
                .trim();
            heuristicsLog(
                'info',
                'apply.combobox',
                'LinkedIn location option selected',
                { selectedText },
            );
            dispatchPointerClick(bestOption);
            element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
            clearLinkedInFieldErrorMarkers(element);

            return (
                valueMatchesAnswer(
                    readReactSelectValue(element),
                    selectedText,
                ) ||
                valueMatchesAnswer(element.value, selectedText) ||
                valueMatchesAnswer(element.value, typedValue)
            );
        }

        heuristicsLog(
            'warn',
            'apply.combobox',
            'LinkedIn location fill failed - no matching option',
            {
                typedValue,
                optionCount: options.length,
            },
        );

        return false;
    }

    async function setAshbyComboboxValue(element, value) {
        if (!element || value === null || value === undefined || value === '') {
            heuristicsLog(
                'warn',
                'apply.combobox',
                'Combobox fill skipped - empty value or element',
                {},
            );

            return false;
        }

        if (String(value) === '__CLEAR__') {
            return clearComboboxFieldValue(element);
        }

        heuristicsLog('debug', 'apply.combobox', 'Starting combobox fill', {
            valuePreview: String(value).slice(0, 80),
            ariaControls: element.getAttribute('aria-controls'),
        });

        const doc = element.ownerDocument || document;
        const stringValue = String(value);

        await closeOpenComboboxMenus(doc);

        element.focus();

        if (isWorkableSelectCombobox(element)) {
            openWorkableSelectDropdown(element);
        } else {
            openReactSelectDropdown(element);
        }

        await pauseMs(isWorkableSelectCombobox(element) ? 180 : 60);

        const isYesNoAnswer = /^(yes|no)\b/i.test(stringValue.trim());
        const canType = !element.readOnly && !element.disabled;
        const normalizedAnswer = normalizeOption(stringValue);

        const collectOpenComboboxOptions = () =>
            isWorkableSelectCombobox(element)
                ? collectLiveWorkableComboboxOptions(doc, element)
                : collectComboboxOptions(doc, element);

        const scoreOpenComboboxOptions = (optionElements) => {
            let bestOption = null;
            let bestOptionText = '';
            let bestScore = 0;

            for (const option of optionElements) {
                const optionText = (
                    option.textContent ||
                    option.getAttribute('aria-label') ||
                    ''
                )
                    .replace(/\s+/g, ' ')
                    .trim();
                const prefixHit = normalizeOption(optionText).includes(
                    normalizedAnswer.slice(0, 24),
                );
                const score = Math.max(
                    scoreComboboxOptionMatch(optionText, stringValue),
                    optionMatchesAnswer(optionText, stringValue) ? 500 : 0,
                    prefixHit && normalizedAnswer.length >= 3 ? 200 : 0,
                );

                if (score > bestScore) {
                    bestScore = score;
                    bestOption = option;
                    bestOptionText = optionText;
                }
            }

            return { bestOption, bestOptionText, bestScore };
        };

        // Match from the open menu before typing. Greenhouse react-select filter
        // text can collapse a long source-of-hire list to one option and make
        // batch verify look successful while the wrong/empty value remains.
        let options = collectOpenComboboxOptions();

        if (options.length === 0) {
            options = await waitForComboboxOptions(doc, element, 250);
        }

        if (options.length === 0 && isWorkableSelectCombobox(element)) {
            openWorkableSelectDropdown(element);
            await pauseMs(180);
            options = collectLiveWorkableComboboxOptions(doc, element);
        }

        if (options.length === 0 && !isYesNoAnswer) {
            if (isWorkableSelectCombobox(element)) {
                openWorkableSelectDropdown(element);
            } else {
                openReactSelectDropdown(element);
            }

            options = await waitForComboboxOptions(doc, element, 1200);
        }

        let { bestOption, bestOptionText, bestScore } =
            scoreOpenComboboxOptions(options);

        if (
            !(bestOption && bestScore >= 100) &&
            !isYesNoAnswer &&
            canType
        ) {
            await typeComboboxFilterText(element, stringValue);
            await pauseMs(120);
            options = collectOpenComboboxOptions();

            if (options.length === 0) {
                options = await waitForComboboxOptions(doc, element, 250);
            }

            ({ bestOption, bestOptionText, bestScore } =
                scoreOpenComboboxOptions(options));
        }

        const reactSelectShell = element.closest(
            '.select-shell, .select__container',
        );

        if (
            options.length === 0 &&
            reactSelectShell &&
            !isIndeedApplyQuestionCombobox(element) &&
            !isIndeedApplyResumeCombobox(element) &&
            !isLinkedInGeoLocationCombobox(element)
        ) {
            const committed = commitReactSelectStaticValue(
                element,
                stringValue,
            );
            heuristicsLog(
                committed ? 'info' : 'warn',
                'apply.combobox',
                committed
                    ? 'Combobox static react-select value committed'
                    : 'Combobox static react-select fill failed',
                {
                    typedValue: element.value?.slice(0, 80),
                },
            );

            if (committed) {
                clearValidationState(element);
            }

            return committed;
        }

        heuristicsLog('debug', 'apply.combobox', 'Combobox options collected', {
            optionCount: options.length,
            options: options
                .slice(0, 8)
                .map((option) =>
                    (option.textContent || '').replace(/\s+/g, ' ').trim(),
                ),
        });

        if (bestOption && bestScore >= 100) {
            heuristicsLog('info', 'apply.combobox', 'Combobox option matched', {
                optionText: bestOptionText,
                score: bestScore,
            });

            // Greenhouse job-boards often flashes a selection then reverts after
            // pointer clicks. Prefer a durable static single-value paint first.
            if (
                isReactSelectComboboxShell(element) &&
                !isWorkableSelectCombobox(element) &&
                !isIndeedApplyQuestionCombobox(element) &&
                !isIndeedApplyResumeCombobox(element)
            ) {
                await closeOpenComboboxMenus(doc);
                const staticOk = commitReactSelectStaticValue(
                    element,
                    bestOptionText || stringValue,
                );
                await pauseMs(280);

                if (
                    staticOk &&
                    greenhouseReactSelectSelectionMatches(
                        element,
                        stringValue,
                        bestOptionText,
                    )
                ) {
                    clearValidationState(element);
                    heuristicsLog(
                        'info',
                        'apply.combobox',
                        'Combobox static react-select preferred commit',
                        {
                            optionText: bestOptionText,
                        },
                    );

                    return true;
                }
            }

            const committed = await commitComboboxOptionSelection(
                element,
                bestOption,
                stringValue,
            );

            if (committed || workableSelectIsCommitted(element, stringValue)) {
                return true;
            }

            return false;
        }

        if (options.length > 0) {
            const answerLooksYesNo = /^(yes|no)$/i.test(
                String(stringValue || '').trim(),
            );
            const optionsLookYesNo = options.some((option) =>
                /^(yes|no)$/i.test(
                    stripSvgBrowserNoise(
                        option.textContent ||
                            option.getAttribute?.('aria-label') ||
                            '',
                    ),
                ),
            );

            // Bare Yes/No must not invent the first nationality / source option.
            if (answerLooksYesNo && !optionsLookYesNo) {
                heuristicsLog(
                    'warn',
                    'apply.combobox',
                    'Combobox skipped first-option fallback for unmatched Yes/No',
                    { answerPreview: String(stringValue || '').slice(0, 32) },
                );

                return false;
            }

            const fallbackText = stripSvgBrowserNoise(
                options[0].textContent ||
                    options[0].getAttribute?.('aria-label') ||
                    '',
            );
            heuristicsLog(
                'warn',
                'apply.combobox',
                'Combobox using first option fallback',
                { fallbackText },
            );

            return commitComboboxOptionSelection(
                element,
                options[0],
                stringValue || fallbackText,
            );
        }

        if (isGreenhouseLocationCombobox(element)) {
            const committed = await commitGreenhouseLocationValue(
                element,
                stringValue,
            );
            heuristicsLog(
                committed ? 'info' : 'warn',
                'apply.combobox',
                committed
                    ? 'Greenhouse location typed value committed'
                    : 'Greenhouse location fill failed',
                {
                    typedValue: element.value?.slice(0, 80),
                },
            );

            return committed;
        }

        heuristicsLog(
            'warn',
            'apply.combobox',
            'Combobox fill failed - option click did not persist',
            {
                typedValue: element.value?.slice(0, 80),
                optionCount: options.length,
            },
        );

        return false;
    }

    function getOptionLabel(input) {
        const workableOption = getWorkableCheckboxOptionLabel(input);

        if (workableOption) {
            return workableOption;
        }

        let raw = '';

        if (input.labels?.length) {
            raw = input.labels[0].textContent;
        } else {
            const doc = input.ownerDocument || document;
            const id = input.getAttribute('id');

            if (id) {
                const label = doc.querySelector(
                    `label[for="${escapeSelectorValue(id)}"]`,
                );

                if (label) {
                    raw = label.textContent;
                }
            }
        }

        if (!raw) {
            raw = String(input.value || '');
        }

        return stripWorkableSvgFallbackNoise(raw);
    }

    function getSmsConsentQuestionLabel(element) {
        const name = String(
            element.getAttribute?.('name') || element.name || '',
        );

        if (
            /communicationConsent|sms.?consent|text.?message.?consent/i.test(
                name,
            )
        ) {
            return 'I consent to receiving text messages';
        }

        if (element.type !== 'radio' && element.type !== 'checkbox') {
            return '';
        }

        const groupName = element.name;

        if (!groupName) {
            return '';
        }

        const doc = element.ownerDocument || document;
        const peers = Array.from(
            doc.querySelectorAll(
                `input[type="${element.type}"][name="${escapeSelectorValue(groupName)}"]`,
            ),
        );
        const optionText = peers
            .map((peer) => getOptionLabel(peer))
            .filter(Boolean)
            .join(' ');

        if (
            /consent to receiving text|do not consent to receiving text|text messages/i.test(
                optionText,
            )
        ) {
            return 'I consent to receiving text messages';
        }

        return '';
    }

    function getQuestionLabel(element) {
        const smsConsentLabel = getSmsConsentQuestionLabel(element);

        if (smsConsentLabel.length >= 3) {
            return smsConsentLabel;
        }

        const phoneInputLabel = getPhoneInputFieldLabel(element);

        if (phoneInputLabel) {
            return phoneInputLabel;
        }

        const indeedLocationLabel = getIndeedLocationFieldLabel(element);

        if (indeedLocationLabel.length >= 2) {
            return indeedLocationLabel;
        }

        const indeedNameLabel = getIndeedNameFieldLabel(element);

        if (indeedNameLabel.length >= 2) {
            return indeedNameLabel;
        }

        const indeedQualificationLabel =
            getIndeedQualificationQuestionLabel(element);

        if (indeedQualificationLabel.length >= 3) {
            return indeedQualificationLabel;
        }

        const micro1Label = getMicro1QuestionLabel(element);

        if (micro1Label.length >= 3) {
            return micro1Label;
        }

        // Ashby honeypots use an empty/nbsp title with placeholder "Type here...".
        // Prefer excluding them over inventing a label from the placeholder.
        if (getAshbyFieldEntry(element)) {
            const ashbyTitle = getAshbyQuestionTitle(element);

            if (ashbyTitle.length >= 3) {
                return ashbyTitle;
            }

            return '';
        }

        const leverLabel = getLeverQuestionLabel(element);

        if (leverLabel.length >= 2) {
            return leverLabel;
        }

        const recruiteeLabel = getRecruiteeQuestionLabel(element);

        if (recruiteeLabel.length >= 2) {
            return recruiteeLabel;
        }

        const greenhouseLabel = getGreenhouseQuestionLabel(element);

        if (greenhouseLabel.length >= 2) {
            return greenhouseLabel;
        }

        const reedLabel = getReedQuestionLabel(element);

        if (reedLabel.length >= 2) {
            return reedLabel;
        }

        const personioLabel = getPersonioQuestionLabel(element);

        if (personioLabel.length >= 2) {
            return personioLabel;
        }

        const workableLabel = getWorkableQuestionLabel(element);

        if (workableLabel.length >= 2) {
            return workableLabel;
        }

        const oracleLabel = getOracleApplyFlowQuestionLabel(element);

        if (oracleLabel.length >= 3) {
            return oracleLabel;
        }

        const linkedInEasyApplyLabel = getLinkedInEasyApplyFieldLabel(element);

        if (linkedInEasyApplyLabel.length >= 2) {
            return linkedInEasyApplyLabel;
        }

        const complexSubLabel = getComplexSubfieldLabel(element);

        if (complexSubLabel.length >= 2) {
            return complexSubLabel;
        }

        const container = getQuestionContainer(element);

        if (container) {
            const testLabel = container.querySelector(
                '[data-testid$="-label"] span[data-testid="safe-markup"], [data-testid$="-label"]',
            );

            if (testLabel) {
                return dedupeRepeatedLabelTokens(
                    normalize(testLabel.textContent),
                );
            }

            const legend = container.classList?.contains('phone-input')
                ? null
                : container.querySelector('legend');

            if (legend) {
                const legendText = normalize(legend.textContent);

                // Recruitee wraps consent checkboxes in a "Legal Agreements" fieldset;
                // the real question is on aria-labelledby / adjacent copy, not the legend.
                if (
                    legendText.length >= 2 &&
                    !isRecruiteeSectionHeadingLabel(legendText)
                ) {
                    return legendText;
                }
            }

            const groupLabel = container.querySelector(
                'label[aria-required], label[id*="question-label"]',
            );

            if (
                groupLabel &&
                !groupLabel.querySelector('input, textarea, select')
            ) {
                return normalize(groupLabel.textContent);
            }
        }

        return getFieldLabel(element);
    }

    function isVisibleChoiceInput(input) {
        return (
            input.type !== 'hidden' &&
            (isAshbyStyledChoiceInput(input) ||
                isOracleApplyFlowStyledChoiceInput(input) ||
                isVisible(input))
        );
    }

    function collectVisibleChoiceInputs(scope, inputType) {
        if (!scope) {
            return [];
        }

        return [...scope.querySelectorAll(`input[type="${inputType}"]`)].filter(
            isVisibleChoiceInput,
        );
    }

    function getChoiceGroupScope(element) {
        if (
            !element ||
            (element.type !== 'radio' && element.type !== 'checkbox')
        ) {
            return null;
        }

        const inputType = element.type;
        const ashbyEntry = getAshbyFieldEntry(element);

        if (
            ashbyEntry &&
            ashbyEntry.querySelector(`input[type="${inputType}"]`)
        ) {
            return ashbyEntry;
        }

        const workableGroup = getWorkableChoiceGroup(element);

        if (workableGroup) {
            return workableGroup;
        }

        const ariaScope = element.closest(
            'fieldset, [role="radiogroup"], [role="group"]',
        );

        if (
            ariaScope &&
            collectVisibleChoiceInputs(ariaScope, inputType).length >= 2
        ) {
            return ariaScope;
        }

        const leverQuestion = getLeverApplicationQuestion(element);

        if (leverQuestion) {
            const directField = leverQuestion.querySelector(
                ':scope > .application-field, :scope > .application-field-full',
            );

            if (
                directField &&
                collectVisibleChoiceInputs(directField, inputType).length >= 2
            ) {
                return directField;
            }

            for (const field of leverQuestion.querySelectorAll(
                '.application-field, .application-field-full',
            )) {
                if (collectVisibleChoiceInputs(field, inputType).length >= 2) {
                    return field;
                }
            }

            if (
                collectVisibleChoiceInputs(leverQuestion, inputType).length >= 2
            ) {
                return leverQuestion;
            }
        }

        const fieldWrapper = element.closest(
            '.gfield, .field-wrapper, .application-field, .application-field-full, .ia-Questions-item, [data-testid^="input-q_"], [data-field-path], .ashby-application-form-field-entry',
        );

        if (
            fieldWrapper &&
            collectVisibleChoiceInputs(fieldWrapper, inputType).length >= 2
        ) {
            return fieldWrapper;
        }

        const container = getQuestionContainer(element);

        if (
            container &&
            collectVisibleChoiceInputs(container, inputType).length >= 2
        ) {
            return container;
        }

        return null;
    }

    const GENERIC_CHOICE_GROUP_MARKERS = new Set(['multiple-choice']);

    function resolveChoiceGroupMarker(marker, element) {
        if (!marker || GENERIC_CHOICE_GROUP_MARKERS.has(marker)) {
            return element?.name || marker || null;
        }

        return marker;
    }

    function getChoiceGroupIdentity(element) {
        const scope = getChoiceGroupScope(element);

        if (!scope) {
            return null;
        }

        if (scope.id) {
            return scope.id;
        }

        const scopedMarker =
            scope.getAttribute('data-qa') ||
            scope.getAttribute('data-testid') ||
            scope.getAttribute('data-field-path');

        if (scopedMarker) {
            return resolveChoiceGroupMarker(scopedMarker, element);
        }

        const nested = scope.querySelector(
            '[data-qa], ul[id], ol[id], div[id]',
        );
        const nestedMarker =
            nested?.getAttribute('data-qa') || nested?.id || null;

        return resolveChoiceGroupMarker(nestedMarker, element);
    }

    function getGroupName(element) {
        const ashbyFieldPath =
            getAshbyFieldEntry(element)?.getAttribute('data-field-path');

        if (ashbyFieldPath) {
            return ashbyFieldPath;
        }

        const workableGroup = getWorkableChoiceGroup(element);

        if (workableGroup) {
            return (
                workableGroup.id ||
                workableGroup.getAttribute('data-ui') ||
                getRadiogroupLabel(workableGroup) ||
                ''
            );
        }

        const scopeIdentity = getChoiceGroupIdentity(element);

        if (scopeIdentity) {
            return scopeIdentity;
        }

        if (element.name) {
            return element.name;
        }

        const container = getQuestionContainer(element);

        return (
            container?.getAttribute('data-testid') ||
            container?.getAttribute('name') ||
            getQuestionLabel(element)
        );
    }

    function getGroupInputs(element) {
        const doc = element.ownerDocument || document;
        const ashbyEntry = getAshbyFieldEntry(element);

        if (
            ashbyEntry &&
            (element.type === 'radio' || element.type === 'checkbox')
        ) {
            return Array.from(
                ashbyEntry.querySelectorAll(`input[type="${element.type}"]`),
            ).filter((input) => !isAshbyHiddenYesNoInput(input));
        }

        const workableGroup = getWorkableChoiceGroup(element);

        if (workableGroup) {
            return Array.from(
                workableGroup.querySelectorAll(`input[type="${element.type}"]`),
            ).filter((input) => input.type !== 'hidden' && isVisible(input));
        }

        const scope = getChoiceGroupScope(element);
        const inputType = element.type;

        if (scope) {
            let inputs = collectVisibleChoiceInputs(scope, inputType);

            if (inputs.length > 0 && element.name) {
                const named = inputs.filter(
                    (input) => input.name === element.name,
                );

                if (named.length >= 2) {
                    const unnamedSiblings = inputs.filter(
                        (input) => !input.name,
                    );
                    inputs =
                        unnamedSiblings.length > 0
                            ? [...named, ...unnamedSiblings]
                            : named;
                } else if (named.length === 1) {
                    const unnamedSiblings = inputs.filter(
                        (input) => !input.name,
                    );

                    inputs =
                        unnamedSiblings.length > 0
                            ? [...named, ...unnamedSiblings]
                            : named;
                }
            }

            if (inputs.length > 0) {
                return inputs;
            }
        }

        const container = getQuestionContainer(element);

        if (element.name) {
            const selector = `input[type="${inputType}"][name="${escapeSelectorValue(element.name)}"]`;

            return Array.from(
                (container || doc).querySelectorAll(selector),
            ).filter(isVisibleChoiceInput);
        }

        return [element].filter(isVisible);
    }

    function isGroupAnswered(element) {
        if (element.type === 'radio' || element.type === 'checkbox') {
            return getGroupInputs(element).some((input) => input.checked);
        }

        return Boolean(element.value?.trim());
    }

    /**
     * Score how well a combobox option matches an answer. Used when substring
     * includes() fails because geo options insert admin regions mid-phrase
     * ("High Wycombe, England" vs "High Wycombe, Buckinghamshire, England, UK").
     */
    function scoreComboboxOptionMatch(optionText, answer) {
        const option = normalizeOption(optionText);
        const normalizedAnswer = normalizeOption(extractBooleanAnswer(answer));

        if (
            !option ||
            !normalizedAnswer ||
            option === 'on' ||
            option === 'off'
        ) {
            return 0;
        }

        if (option === normalizedAnswer) {
            return 1000;
        }

        if (option.includes(normalizedAnswer)) {
            return 800;
        }

        if (normalizedAnswer.length >= 3 && normalizedAnswer.includes(option)) {
            return 400;
        }

        const answerTokens = normalizedAnswer
            .split(/\s+/)
            .filter((token) => token.length >= 2);
        const optionTokens = option.split(/\s+/).filter(Boolean);

        if (answerTokens.length < 2 || optionTokens.length === 0) {
            return 0;
        }

        const optionSet = new Set(optionTokens);
        const covered = answerTokens.filter((token) =>
            optionSet.has(token),
        ).length;

        if (covered === 0) {
            return 0;
        }

        // Require the leading city/place tokens (first two) so "England, Arkansas"
        // cannot beat "High Wycombe, Buckinghamshire, England".
        if (
            !optionSet.has(answerTokens[0]) ||
            !optionSet.has(answerTokens[1])
        ) {
            return 0;
        }

        return 100 + covered * 20 + Math.min(optionTokens.length, 10);
    }

    function optionMatchesAnswer(optionText, answer) {
        const option = normalizeOption(optionText);
        const normalizedAnswer = extractBooleanAnswer(answer);

        if (!option || !normalizedAnswer) {
            return false;
        }

        // Ignore bare HTML values on/off - they match too many answers via includes().
        // Keep True/False - Indeed SmartApply uses those as visible radio labels.
        if (option === 'on' || option === 'off') {
            return false;
        }

        if (option === normalizedAnswer) {
            return true;
        }

        // Only use includes for meaningful multi-character tokens to avoid
        // "none of the above".includes("on") style false positives.
        if (
            option.length >= 3 &&
            (option.includes(normalizedAnswer) ||
                (normalizedAnswer.length >= 3 &&
                    normalizedAnswer.includes(option)))
        ) {
            return true;
        }

        if (scoreComboboxOptionMatch(optionText, answer) >= 100) {
            return true;
        }

        const booleanOption = extractBooleanAnswer(optionText);

        if (booleanOption === 'yes' || booleanOption === 'no') {
            if (booleanOption === normalizedAnswer) {
                return true;
            }
        }

        if (normalizedAnswer === 'yes') {
            return (
                option === 'true' ||
                /^(yes|tak|oui|ja|si|sí)\b/.test(option) ||
                /^true\b/.test(option) ||
                option.includes('i am open') ||
                option.includes('i can start')
            );
        }

        if (normalizedAnswer === 'no') {
            return (
                option === 'false' ||
                /^(no|nie|non|nein)\b/.test(option) ||
                /^false\b/.test(option) ||
                option.includes('not open') ||
                option.includes('i am not')
            );
        }

        return false;
    }

    function getGroupOptions(element) {
        if (element.type === 'radio' || element.type === 'checkbox') {
            return getGroupInputs(element)
                .map((input) => getOptionLabel(input))
                .filter((label) => label.length > 0);
        }

        if (element.getAttribute?.('role') === 'combobox') {
            const labels = collectStaticComboboxOptionLabels(element);

            return labels.length > 0 ? labels : undefined;
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
        const descriptor = prototype
            ? Object.getOwnPropertyDescriptor(prototype, 'checked')
            : null;

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

        return (
            /\bprivacy policy\b/.test(normalized) ||
            /\bconsent\b/.test(normalized) ||
            /\bi agree\b/.test(normalized) ||
            /\bi certify\b/.test(normalized) ||
            /\bi have read\b/.test(normalized) ||
            /\bi understand\b/.test(normalized) ||
            /\bapplicant statement\b/.test(normalized) ||
            /^yes\b/.test(normalized)
        );
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
        add(
            input.closest(
                'spl-checkbox, .c-spl-checkbox-wrapper, .c-spl-checkbox, .choice-input-wrapper, .wpforms-field-label-inline',
            ),
        );

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

            heuristicsLog(
                'debug',
                'apply.checkbox',
                'Attempting Ashby styled choice fill',
                {
                    inputType: input.type,
                    optionText,
                    optionValue,
                    targetCount: clickTargets.length,
                    targetTags: clickTargets
                        .map((target) => target.tagName?.toLowerCase())
                        .filter(Boolean),
                },
            );

            if (isAshbyChoiceVisuallyChecked(input)) {
                heuristicsLog(
                    'info',
                    'apply.checkbox',
                    'Ashby choice already selected',
                    {
                        optionText,
                        checked: input.checked,
                    },
                );

                return true;
            }

            for (const target of clickTargets) {
                nativeClick(target);

                if (isAshbyChoiceVisuallyChecked(input)) {
                    heuristicsLog(
                        'info',
                        'apply.checkbox',
                        'Ashby choice selected via click',
                        {
                            optionText,
                            optionValue,
                            clickedTag: target.tagName?.toLowerCase() || null,
                            clickedClass: String(target.className || '').slice(
                                0,
                                80,
                            ),
                            checked: input.checked,
                        },
                    );

                    return true;
                }
            }

            if (!isAshbyChoiceVisuallyChecked(input)) {
                input.checked = true;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const checked = isAshbyChoiceVisuallyChecked(input);

            heuristicsLog(
                checked ? 'info' : 'warn',
                'apply.checkbox',
                checked
                    ? 'Ashby choice selected via fallback'
                    : 'Ashby choice fill failed',
                {
                    optionText,
                    optionValue,
                    checked: input.checked,
                },
            );

            return checked;
        }

        if (isSplCheckboxInput(input)) {
            for (const target of resolveCheckboxClickTargets(input)) {
                nativeClick(target);

                if (input.checked) {
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));

                    return true;
                }
            }

            const host = input.closest('spl-checkbox');

            if (host instanceof HTMLElement) {
                nativeClick(host);
            }
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

    async function dismissWorkableWashingtonCountyWhenNotResident(
        doc = document,
    ) {
        if (!isWorkableWashingtonResidencyDeclined(doc)) {
            return false;
        }

        const combobox =
            doc.querySelector('#input_CA_45368_input') ||
            doc.querySelector('[data-ui="CA_45368"] [role="combobox"]');

        if (!combobox) {
            return false;
        }

        return setAshbyComboboxValue(combobox, 'None of the above');
    }

    function setRadioGroupValue(element, answer) {
        answer = resolveRadioGroupAnswer(element, answer);

        if (isWorkableApplyHost(element.ownerDocument || document)) {
            const workableGroup = getWorkableChoiceGroup(element);

            if (workableGroup) {
                const roleRadios = Array.from(
                    workableGroup.querySelectorAll('[role="radio"]'),
                ).filter(isVisible);

                if (
                    roleRadios.length >= 2 &&
                    setRoleRadioGroupValue(roleRadios, answer)
                ) {
                    syncWorkableRoleRadioGroup(roleRadios);

                    return true;
                }
            }
        }

        for (const radio of getGroupInputs(element)) {
            const optionText = getOptionLabel(radio);
            const optionValue = String(radio.value || '');

            if (
                optionMatchesAnswer(optionText, answer) ||
                optionMatchesAnswer(optionValue, answer)
            ) {
                const applied = markInputChecked(radio);

                if (
                    applied &&
                    String(element.name || radio.name || '') === 'CA_45367' &&
                    /do not live in wa|not live in wa state|^no\b/i.test(
                        normalize(optionText),
                    )
                ) {
                    void dismissWorkableWashingtonCountyWhenNotResident(
                        element.ownerDocument || document,
                    );
                }

                return applied;
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
            return answer.map((part) => String(part).trim()).filter(Boolean);
        }

        if (answer && typeof answer === 'object') {
            return [];
        }

        return String(answer)
            .split(/[,;|]/)
            .map((part) => part.trim())
            .filter(Boolean);
    }

    function isMutuallyExclusiveYesNoCheckboxGroup(checkboxes) {
        if (checkboxes.length !== 2) {
            return false;
        }

        const tokens = checkboxes
            .map((input) => {
                const optionText = getOptionLabel(input);
                const optionValue = String(input.value || '');

                return (
                    extractBooleanAnswer(optionText) ||
                    extractBooleanAnswer(optionValue)
                );
            })
            .filter(Boolean);

        if (tokens.length !== 2) {
            return false;
        }

        const unique = new Set(tokens);

        return unique.size === 2 && unique.has('yes') && unique.has('no');
    }

    function clearCheckboxGroupSelections(checkboxes) {
        for (const checkbox of checkboxes) {
            if (!checkbox.checked) {
                continue;
            }

            setNativeChecked(checkbox, false);
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function setCheckboxGroupValue(element, answer) {
        if (
            isConsentWildcardAnswer(answer) &&
            element.type === 'checkbox' &&
            markInputChecked(element)
        ) {
            return true;
        }

        if (isConsentWildcardAnswer(answer)) {
            const groupInputs = getGroupInputs(element).filter(
                (input) => input.type === 'checkbox',
            );
            const consentTarget =
                groupInputs.length === 1
                    ? groupInputs[0]
                    : groupInputs.find(
                          (input) =>
                              input.required ||
                              input.getAttribute('aria-required') === 'true',
                      );

            if (consentTarget && markInputChecked(consentTarget)) {
                return true;
            }
        }

        let answers = coerceCheckboxAnswers(answer);

        // Multi-select EEO groups: if a decline option is present in the answer list, only apply decline.
        const declineAnswer = answers.find((candidate) =>
            /decline to self-?identify|i do not want to answer|prefer not to (?:say|answer|self|disclose)|i decline/i.test(
                candidate,
            ),
        );

        if (declineAnswer && answers.length > 1) {
            answers = [declineAnswer];
        }

        if (answers.length === 0) {
            heuristicsLog(
                'warn',
                'apply.checkbox',
                'Checkbox group received empty answer',
                {
                    answerPreview: String(answer).slice(0, 80),
                    groupLabel: getQuestionLabel(element),
                },
            );

            return false;
        }

        heuristicsLog('debug', 'apply.checkbox', 'Filling checkbox group', {
            groupLabel: getQuestionLabel(element),
            answers,
            optionCount: getGroupInputs(element).length,
        });

        if (answers.some(isConsentWildcardAnswer)) {
            const groupInputs = getGroupInputs(element).filter(
                (input) => input.type === 'checkbox',
            );
            const consentTarget =
                groupInputs.length === 1
                    ? groupInputs[0]
                    : groupInputs.find(
                          (input) =>
                              input.required ||
                              input.getAttribute('aria-required') === 'true',
                      );

            if (consentTarget && markInputChecked(consentTarget)) {
                return true;
            }
        }

        let matched = 0;
        let applied = 0;
        const visibleCheckboxes = getGroupInputs(element).filter(
            (input) => input.type === 'checkbox',
        );
        const yesNoExclusive =
            isMutuallyExclusiveYesNoCheckboxGroup(visibleCheckboxes);

        if (yesNoExclusive) {
            const booleanAnswers = answers
                .map((candidate) => extractBooleanAnswer(candidate))
                .filter(Boolean);

            if (booleanAnswers.length > 1) {
                answers = [booleanAnswers[booleanAnswers.length - 1]];
            } else if (booleanAnswers.length === 1) {
                answers = booleanAnswers;
            } else {
                answers = answers.slice(0, 1);
            }

            clearCheckboxGroupSelections(visibleCheckboxes);
        }

        if (
            visibleCheckboxes.length === 1 &&
            /^(yes|true)\b/i.test(String(answer).trim())
        ) {
            return markInputChecked(visibleCheckboxes[0]);
        }

        for (const checkbox of visibleCheckboxes) {
            const optionText = getOptionLabel(checkbox);
            const optionValue = String(checkbox.value || checkbox.name || '');

            if (
                !answers.some(
                    (candidate) =>
                        optionMatchesAnswer(optionText, candidate) ||
                        optionMatchesAnswer(optionValue, candidate),
                )
            ) {
                continue;
            }

            matched += 1;

            if (yesNoExclusive) {
                clearCheckboxGroupSelections(visibleCheckboxes);
            }

            if (markInputChecked(checkbox)) {
                applied += 1;
            }

            if (yesNoExclusive) {
                break;
            }
        }

        if (applied === 0) {
            const visibleCheckboxes = getGroupInputs(element).filter(
                (input) => input.type === 'checkbox',
            );

            if (
                visibleCheckboxes.length === 1 &&
                answers.some(isConsentWildcardAnswer)
            ) {
                return markInputChecked(visibleCheckboxes[0]);
            }
        }

        heuristicsLog(
            applied > 0 ? 'info' : 'warn',
            'apply.checkbox',
            applied > 0
                ? 'Checkbox group fill complete'
                : 'Checkbox group fill failed',
            {
                groupLabel: getQuestionLabel(element),
                answers,
                matched,
                applied,
            },
        );

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
                const labelledText = labelEl?.textContent
                    ? normalize(labelEl.textContent)
                    : '';

                if (
                    labelledText.length >= 2 &&
                    !isRecruiteeSectionHeadingLabel(labelledText)
                ) {
                    return labelledText;
                }
            }
        }

        const legend = group.querySelector('legend');
        const legendText = legend?.textContent
            ? normalize(legend.textContent)
            : '';

        // Recruitee (and similar) use a section legend like "Legal Agreements" while the
        // real question lives on the checkbox aria-labelledby / adjacent copy.
        if (
            legendText.length >= 2 &&
            !isRecruiteeSectionHeadingLabel(legendText)
        ) {
            return legendText;
        }

        const heading = group
            .closest('fieldset, section, div')
            ?.querySelector(
                'legend, label[aria-required], [class*="question"], h1, h2, h3, h4, p',
            );
        const headingText =
            heading?.textContent &&
            !heading.querySelector('input, textarea, select, [role="radio"]')
                ? normalize(heading.textContent)
                : '';

        if (
            headingText.length >= 2 &&
            !isRecruiteeSectionHeadingLabel(headingText)
        ) {
            return headingText;
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

            const radios = Array.from(
                group.querySelectorAll('[role="radio"]'),
            ).filter(isVisible);

            if (radios.length < 2) {
                continue;
            }

            const key =
                group.id ||
                group.getAttribute('data-testid') ||
                group.getAttribute('name') ||
                `${getRadiogroupLabel(group)}:${radios.length}`;

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            groups.push({ group, radios, label: getRadiogroupLabel(group) });
        }

        return groups;
    }

    function isRoleGroupAnswered(radios) {
        return radios.some(
            (radio) => radio.getAttribute('aria-checked') === 'true',
        );
    }

    function getRoleRadioOptions(radios) {
        return radios
            .map((radio) =>
                (radio.textContent || radio.getAttribute('aria-label') || '')
                    .replace(/\s+/g, ' ')
                    .replace(/svgs not supported by this browser\.\s*/gi, '')
                    .trim(),
            )
            .filter((label) => label.length > 0);
    }

    function setRoleRadioGroupValue(radios, answer) {
        const native = radios[0]?.querySelector?.('input[type="radio"]');

        if (native) {
            answer = resolveRadioGroupAnswer(native, answer, radios);
        }

        for (const radio of radios) {
            const optionText = (
                radio.textContent ||
                radio.getAttribute('aria-label') ||
                ''
            )
                .replace(/\s+/g, ' ')
                .trim();
            const optionValue = String(
                radio.getAttribute('data-value') ||
                    radio.getAttribute('value') ||
                    '',
            );

            if (
                optionMatchesAnswer(optionText, answer) ||
                optionMatchesAnswer(optionValue, answer)
            ) {
                nativeClick(radio);
                radio.dispatchEvent(
                    new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
                );
                radio.dispatchEvent(
                    new KeyboardEvent('keyup', { key: ' ', bubbles: true }),
                );

                if (!isRoleGroupAnswered(radios)) {
                    radios.forEach((candidate) => {
                        const selected = candidate === radio;
                        candidate.setAttribute(
                            'aria-checked',
                            selected ? 'true' : 'false',
                        );
                        candidate.setAttribute(
                            'tabindex',
                            selected ? '0' : '-1',
                        );
                    });
                }

                syncWorkableRoleRadioGroup(radios);

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

        const container = element.closest(
            '.field-row, .form-group, .field, [class*="question"]',
        );
        const explicit = container?.querySelector(
            'label, legend, [id$="-lbl"]',
        );

        if (
            explicit?.textContent?.trim() &&
            !explicit.querySelector(
                'input, textarea, select, [role="radio"], [role="checkbox"]',
            )
        ) {
            return normalize(explicit.textContent);
        }

        return '';
    }

    function isIncidentalListbox(listbox, label) {
        if (
            /list of countries|country list|phone country|dial code|country code/i.test(
                label,
            )
        ) {
            return true;
        }

        if (
            listbox.classList.contains('iti__country-list') ||
            listbox.closest('.iti, .iti__country-container')
        ) {
            return true;
        }

        return false;
    }

    /**
     * Recruitee (and similar) phone widgets use a button+listbox country picker instead of a
     * native <select> or role=combobox. Surface it as its own select field.
     */
    function isPhoneCountryListboxButton(element) {
        if (!element || element.tagName?.toLowerCase() !== 'button') {
            return false;
        }

        if (element.getAttribute('aria-haspopup') !== 'listbox') {
            return false;
        }

        const id = String(element.id || '');
        const aria = String(element.getAttribute('aria-label') || '');

        if (
            /^country-select/i.test(id) ||
            /country\s+calling\s+code|select\s+country/i.test(aria)
        ) {
            return true;
        }

        return element.closest('.PhoneInput, [class*="PhoneInput"]') !== null;
    }

    function getPhoneCountryListboxButtonLabel(button) {
        const aria = String(button.getAttribute('aria-label') || '');
        const cleaned = aria
            .replace(/^select\s+/i, '')
            .replace(/:\s*.+$/, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (cleaned.length >= 3) {
            return normalize(cleaned);
        }

        if (button.closest('.PhoneInput, [class*="PhoneInput"]')) {
            return 'country calling code';
        }

        return normalize(aria) || 'country';
    }

    function getPhoneCountryListbox(
        button,
        doc = button?.ownerDocument || document,
    ) {
        if (!button) {
            return null;
        }

        const controls = button.getAttribute('aria-controls');

        if (controls) {
            const byControls = doc.getElementById(controls);

            if (byControls?.getAttribute('role') === 'listbox') {
                return byControls;
            }
        }

        const id = button.id;

        if (id) {
            const byLabel = doc.querySelector(
                `[role="listbox"][aria-labelledby="${escapeSelectorValue(id)}"]`,
            );

            if (byLabel) {
                return byLabel;
            }
        }

        return (
            button.parentElement?.querySelector('[role="listbox"]') ||
            button
                .closest('.PhoneInput, [class*="PhoneInput"]')
                ?.querySelector('[role="listbox"]') ||
            null
        );
    }

    function collapseDuplicatedCountryLabel(text) {
        const raw = String(text || '')
            .replace(/\s+/g, ' ')
            .trim();

        if (raw.length < 4) {
            return raw;
        }

        // Recruitee renders flag title + visible name, e.g. "United KingdomUnited Kingdom".
        if (raw.length % 2 === 0) {
            const half = raw.length / 2;

            if (raw.slice(0, half) === raw.slice(half)) {
                return raw.slice(0, half).trim();
            }
        }

        return raw;
    }

    function readPhoneCountryListboxValue(button) {
        // Prefer visible label text over aria-label - apply paths may sync aria for JSDOM
        // while the widget still shows a different country.
        const visible = button.querySelector('span, [class*="country"]');
        const text = collapseDuplicatedCountryLabel(
            (visible?.textContent || '').replace(/\s+/g, ' ').trim(),
        );

        if (text.length >= 2 && !/^select\b/i.test(text)) {
            return text;
        }

        const aria = String(button.getAttribute('aria-label') || '');
        const match = aria.match(/:\s*(.+)$/);

        if (match?.[1]) {
            return collapseDuplicatedCountryLabel(
                match[1].replace(/\s+/g, ' ').trim(),
            );
        }

        const fallback = collapseDuplicatedCountryLabel(
            (button.textContent || '').replace(/\s+/g, ' ').trim(),
        );

        return fallback.length >= 2 ? fallback : null;
    }

    function isReactPhoneInputCompanionCountryButton(button) {
        if (!button) {
            return false;
        }

        const widget = button.closest('.PhoneInput, [class*="PhoneInput"]');

        if (!widget) {
            return false;
        }

        return Boolean(widget.querySelector('input[type="tel"]'));
    }

    function collectPhoneCountrySelectFields(root) {
        const fields = [];
        const seen = new Set();
        const doc = root.ownerDocument || document;

        for (const button of root.querySelectorAll(
            'button[aria-haspopup="listbox"]',
        )) {
            if (!isVisible(button) || !isPhoneCountryListboxButton(button)) {
                continue;
            }

            // Recruitee PhoneInput sets dial code inside setReactPhoneNumberInputValue.
            if (isReactPhoneInputCompanionCountryButton(button)) {
                continue;
            }

            const label = getPhoneCountryListboxButtonLabel(button);
            const key = button.id || label;

            if (label.length < 3 || seen.has(key)) {
                continue;
            }

            seen.add(key);

            const listbox = getPhoneCountryListbox(button, doc);
            const optionLabels = listbox
                ? Array.from(listbox.querySelectorAll('[role="option"]'))
                      .map((option) =>
                          (
                              option.getAttribute('aria-label') ||
                              option.textContent ||
                              ''
                          )
                              .replace(/\s+/g, ' ')
                              .trim(),
                      )
                      .filter((text) => text.length > 0)
                      .slice(0, 40)
                : [];

            fields.push({
                button,
                listbox,
                label,
                optionLabels,
            });
        }

        return fields;
    }

    function phoneCountryOptionMatches(optionText, answer) {
        const text = collapseDuplicatedCountryLabel(
            String(optionText || '')
                .replace(/\s+/g, ' ')
                .trim(),
        );
        const stringValue = String(answer || '').trim();

        if (!text || !stringValue) {
            return false;
        }

        const option = normalizeOption(text);
        const normalizedAnswer = normalizeOption(stringValue);

        if (!option || !normalizedAnswer) {
            return false;
        }

        // Strict match only - optionMatchesAnswer includes() false-positives
        // ("united kingdom".includes("united") / "kingdom") break virtualized lists.
        if (option === normalizedAnswer) {
            return true;
        }

        if (
            option.startsWith(`${normalizedAnswer} `) ||
            normalizedAnswer.startsWith(`${option} `)
        ) {
            return true;
        }

        const dialDigits = stringValue.replace(/\D/g, '');

        if (dialDigits.length >= 1 && dialDigits.length <= 3) {
            const dialPattern = new RegExp(
                `(?:^|[^\\d])\\+?${dialDigits}(?:[^\\d]|$)`,
            );

            if (dialPattern.test(text)) {
                return true;
            }
        }

        return false;
    }

    function phoneCountrySearchQueries(answer) {
        const stringValue = String(answer || '').trim();
        const dialDigits = stringValue.replace(/\D/g, '');
        const queries = [];

        if (stringValue && !/^\+?\d{1,3}$/.test(stringValue)) {
            queries.push(stringValue);
        }

        if (/united kingdom/i.test(stringValue) || dialDigits === '44') {
            queries.push('United Kingdom');
        }

        return [...new Set(queries.filter(Boolean))];
    }

    async function typePhoneCountryListboxQuery(target, query) {
        const el = target?.ownerDocument?.activeElement || target;

        if (!el || !query) {
            return;
        }

        el.focus?.();

        for (const char of String(query).slice(0, 32)) {
            const upper = char.toUpperCase();
            const keyCode =
                char.length === 1 ? char.toUpperCase().charCodeAt(0) : 0;
            const eventInit = {
                key: char,
                code: /^[a-z]$/i.test(char)
                    ? `Key${upper}`
                    : /^\d$/.test(char)
                      ? `Digit${char}`
                      : char,
                keyCode,
                which: keyCode,
                bubbles: true,
                cancelable: true,
            };

            el.dispatchEvent(new KeyboardEvent('keydown', eventInit));
            el.dispatchEvent(new KeyboardEvent('keypress', eventInit));
            el.dispatchEvent(new KeyboardEvent('keyup', eventInit));
            await sleep(20);
        }

        await sleep(60);
    }

    function phoneCountryScrollContainer(listbox) {
        if (!listbox) {
            return null;
        }

        const ul = listbox.querySelector('ul');
        const candidates = [
            ul?.parentElement,
            listbox.querySelector('div'),
            listbox.firstElementChild,
            listbox,
        ].filter(Boolean);

        return (
            candidates.find(
                (node) =>
                    Number(node.scrollHeight || 0) >
                    Number(node.clientHeight || 0) + 20,
            ) ||
            candidates[0] ||
            null
        );
    }

    async function scrollPhoneCountryListToIndex(
        listbox,
        index,
        itemHeight = 58,
    ) {
        const scrollParent = phoneCountryScrollContainer(listbox);
        const ul = listbox?.querySelector('ul');
        const top = Math.max(0, index * itemHeight);

        if (!scrollParent) {
            return;
        }

        if (typeof scrollParent.scrollTo === 'function') {
            scrollParent.scrollTo(0, top);
        } else {
            scrollParent.scrollTop = top;
        }

        scrollParent.dispatchEvent(new Event('scroll', { bubbles: true }));
        ul?.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(35);
    }

    function readVisiblePhoneCountryOptionLabels(listbox) {
        return Array.from(listbox?.querySelectorAll('[role="option"]') || [])
            .map((option) => ({
                option,
                label: (
                    option.getAttribute('aria-label') ||
                    option.textContent ||
                    ''
                )
                    .replace(/\s+/g, ' ')
                    .trim(),
            }))
            .filter((entry) => entry.label.length > 0);
    }

    async function findPhoneCountryOptionByScrolling(listbox, answer) {
        if (!listbox) {
            return null;
        }

        const itemHeight = 58;
        const ul = listbox.querySelector('ul');
        const scrollParent = phoneCountryScrollContainer(listbox);
        const totalHeight =
            Number.parseInt(ul?.style?.height || '0', 10) ||
            Number(scrollParent?.scrollHeight || 0);
        const approxCount = Math.max(
            40,
            Math.ceil(totalHeight / itemHeight) || 250,
        );
        const target = normalizeOption(answer);

        let lo = 0;
        let hi = approxCount - 1;

        for (let probe = 0; probe < 18 && lo <= hi; probe += 1) {
            const mid = Math.floor((lo + hi) / 2);
            await scrollPhoneCountryListToIndex(listbox, mid, itemHeight);
            const visible = readVisiblePhoneCountryOptionLabels(listbox);
            const hit = visible.find((entry) =>
                phoneCountryOptionMatches(entry.label, answer),
            );

            if (hit) {
                return hit.option;
            }

            const sample =
                visible.find(
                    (entry) => !/^international$/i.test(entry.label),
                ) || visible[0];

            if (!sample) {
                break;
            }

            const sampleNorm = normalizeOption(sample.label);

            if (sampleNorm < target) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        const start = Math.max(0, lo - 6);

        for (
            let index = start;
            index < Math.min(approxCount, start + 40);
            index += 2
        ) {
            await scrollPhoneCountryListToIndex(listbox, index, itemHeight);
            const hit = readVisiblePhoneCountryOptionLabels(listbox).find(
                (entry) => phoneCountryOptionMatches(entry.label, answer),
            );

            if (hit) {
                return hit.option;
            }
        }

        return null;
    }

    async function setPhoneCountryListboxValue(button, answer) {
        const stringValue = String(answer || '').trim();

        if (!button || !stringValue) {
            return false;
        }

        if (
            phoneCountryOptionMatches(
                readPhoneCountryListboxValue(button),
                stringValue,
            )
        ) {
            return true;
        }

        const doc = button.ownerDocument || document;

        const findMatchingOption = () => {
            const listbox = getPhoneCountryListbox(button, doc);
            const scope = listbox || button.parentElement || doc;
            const options = Array.from(
                scope.querySelectorAll('[role="option"]'),
            );

            return (
                options.find((option) => {
                    const optionText = (
                        option.getAttribute('aria-label') ||
                        option.textContent ||
                        ''
                    )
                        .replace(/\s+/g, ' ')
                        .trim();

                    return phoneCountryOptionMatches(optionText, stringValue);
                }) || null
            );
        };

        dispatchPointerClick(button);
        button.setAttribute('aria-expanded', 'true');
        await sleep(120);

        const listbox = getPhoneCountryListbox(button, doc);
        const filterInput =
            listbox?.querySelector('input') ||
            button.parentElement?.querySelector(
                'input[type="text"], input:not([type])',
            ) ||
            null;
        const queries = phoneCountrySearchQueries(stringValue);
        let match = null;

        if (filterInput && queries.length > 0) {
            for (const query of queries) {
                await fillReactTextControl(filterInput, query);
                await sleep(100);
                match = findMatchingOption();

                if (match) {
                    break;
                }
            }
        }

        if (!match) {
            match = findMatchingOption();
        }

        if (!match && !filterInput && queries[0]) {
            await typePhoneCountryListboxQuery(listbox || button, queries[0]);
            match = findMatchingOption();
        }

        if (!match) {
            match = await findPhoneCountryOptionByScrolling(
                getPhoneCountryListbox(button, doc),
                stringValue,
            );
        }

        if (!match) {
            heuristicsLog(
                'warn',
                'apply.phone',
                'Phone country listbox option not found',
                {
                    valuePreview: stringValue.slice(0, 80),
                },
            );
            button.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Escape',
                    bubbles: true,
                    cancelable: true,
                }),
            );
            button.setAttribute('aria-expanded', 'false');

            return false;
        }

        match.scrollIntoView?.({ block: 'nearest' });
        dispatchPointerClick(match);
        match.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        match.setAttribute('aria-selected', 'true');
        await sleep(120);

        let current = readPhoneCountryListboxValue(button);

        if (!phoneCountryOptionMatches(current, stringValue)) {
            const base = String(
                button.getAttribute('aria-label') ||
                    'Select country calling code',
            ).replace(/:\s*.+$/, '');
            button.setAttribute('aria-label', `${base}: ${stringValue}`);
            current = readPhoneCountryListboxValue(button);
        }

        button.setAttribute('aria-expanded', 'false');

        const ok = phoneCountryOptionMatches(current, stringValue);

        if (!ok) {
            heuristicsLog(
                'warn',
                'apply.phone',
                'Phone country listbox value mismatch after click',
                {
                    valuePreview: stringValue.slice(0, 80),
                    currentPreview: String(current || '').slice(0, 80),
                },
            );
        }

        return ok;
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

        return (
            listbox.closest(
                '.field-row, .form-group, .input-wrapper, [data-testid^="input-q_"], .ia-Questions-item, .application-field, .v-select, .MuiAutocomplete-root, .ashby-application-form-field-entry, [data-field-path]',
            ) !== null
        );
    }

    function collectStandaloneComboboxFields(root) {
        const fields = [];
        const seen = new Set();
        const doc = root.ownerDocument || document;

        for (const combobox of root.querySelectorAll('[role="combobox"]')) {
            if (
                !isVisible(combobox) ||
                isIndeedApplyComboboxFilterInput(combobox)
            ) {
                continue;
            }

            // intl-tel-input country dial (Workable): filled via the tel input's setNumber.
            if (
                combobox.classList?.contains('iti__selected-flag') ||
                combobox.closest?.('.iti__flag-container') ||
                /telephone country code|phone country code/i.test(
                    combobox.getAttribute?.('aria-label') || '',
                )
            ) {
                continue;
            }

            // Chosen UI is a combobox wrapper around a native select we already inventory.
            if (
                combobox.classList?.contains('chosen-container') ||
                (typeof combobox.id === 'string' &&
                    combobox.id.endsWith('_chosen'))
            ) {
                continue;
            }

            const label =
                getQuestionLabel(combobox) || getAccessibleLabel(doc, combobox);
            const dedupeKey = combobox.id || label;

            if (label.length < 3 || seen.has(dedupeKey)) {
                continue;
            }

            seen.add(dedupeKey);

            const optionLabels = collectStaticComboboxOptionLabels(
                combobox,
                doc,
            );

            fields.push({
                combobox,
                label,
                optionLabels,
            });
        }

        return fields;
    }

    function collectRoleListboxFields(root) {
        const fields = [];
        const seen = new Set();
        const doc = root.ownerDocument || document;

        for (const listbox of root.querySelectorAll('[role="listbox"]')) {
            const combobox = getComboboxForListbox(root, listbox);
            const comboboxControlled = combobox !== null;

            if (comboboxControlled) {
                continue;
            }

            if (!comboboxControlled && !isVisible(listbox)) {
                continue;
            }

            const options = Array.from(
                listbox.querySelectorAll('[role="option"]'),
            ).filter((option) => comboboxControlled || isVisible(option));

            if (options.length < 2) {
                continue;
            }

            let label = getAccessibleLabel(doc, listbox);

            if (
                (label.length < 3 || /^(open|select)\s+/i.test(label)) &&
                listbox.id
            ) {
                const labelledBy = listbox.getAttribute('aria-labelledby');

                if (labelledBy) {
                    const explicitLabel = labelledBy
                        .split(/\s+/)
                        .map((id) => doc.getElementById(id))
                        .filter(Boolean)
                        .map((element) =>
                            (element.textContent || '')
                                .replace(/\s+/g, ' ')
                                .trim(),
                        )
                        .find((text) => text.length >= 3);

                    if (explicitLabel) {
                        label = explicitLabel;
                    }
                }

                if (label.length < 3 && combobox) {
                    label =
                        getAccessibleLabel(doc, combobox) ||
                        getFieldLabel(combobox);
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
                    .map((option) =>
                        (
                            option.textContent ||
                            option.getAttribute('aria-label') ||
                            ''
                        )
                            .replace(/\s+/g, ' ')
                            .trim(),
                    )
                    .filter((text) => text.length > 0),
            });
        }

        return fields;
    }

    function isRoleListboxAnswered(listbox) {
        return Array.from(listbox.querySelectorAll('[role="option"]')).some(
            (option) =>
                option.getAttribute('aria-selected') === 'true' ||
                option.classList.contains('selected'),
        );
    }

    function setRoleListboxValue(listbox, answer) {
        const doc = listbox.ownerDocument || document;

        if (listbox.hasAttribute('hidden')) {
            listbox.removeAttribute('hidden');
        }

        if (listbox.style?.display === 'none') {
            listbox.style.display = '';
        }

        for (const option of listbox.querySelectorAll('[role="option"]')) {
            const optionText = (
                option.textContent ||
                option.getAttribute('aria-label') ||
                ''
            )
                .replace(/\s+/g, ' ')
                .trim();
            const optionValue = String(
                option.getAttribute('data-value') ||
                    option.getAttribute('value') ||
                    '',
            );

            if (
                optionMatchesAnswer(optionText, answer) ||
                optionMatchesAnswer(optionValue, answer)
            ) {
                listbox
                    .querySelectorAll('[role="option"]')
                    .forEach((candidate) => {
                        candidate.setAttribute(
                            'aria-selected',
                            candidate === option ? 'true' : 'false',
                        );
                    });

                option.click();
                option.setAttribute('aria-selected', 'true');

                const combobox = listbox.id
                    ? doc.querySelector(
                          `[aria-controls="${escapeSelectorValue(listbox.id)}"]`,
                      )
                    : listbox.parentElement?.querySelector('[role="combobox"]');

                if (combobox instanceof HTMLElement) {
                    combobox.textContent = optionText;
                    combobox.setAttribute('aria-expanded', 'false');
                }

                return true;
            }
        }

        return false;
    }

    function isWorkableNativeChoiceGroup(group) {
        if (!group || !isWorkableApplyHost(group.ownerDocument || document)) {
            return false;
        }

        return (
            group.querySelector(
                'input[type="checkbox"], input[type="radio"]',
            ) !== null
        );
    }

    function collectRoleCheckboxGroups(root) {
        const groups = [];
        const seen = new Set();
        const doc = root.ownerDocument || document;

        for (const group of root.querySelectorAll(
            '[role="group"], fieldset, [role="radiogroup"]',
        )) {
            if (isWorkableNativeChoiceGroup(group)) {
                continue;
            }

            const checkboxes = Array.from(
                group.querySelectorAll('[role="checkbox"]'),
            ).filter(isVisible);

            if (checkboxes.length < 2) {
                continue;
            }

            const label =
                getAccessibleLabel(doc, group) || getRadiogroupLabel(group);
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
                    .map((checkbox) =>
                        stripWorkableSvgFallbackNoise(
                            checkbox.textContent ||
                                checkbox.getAttribute('aria-label') ||
                                '',
                        ),
                    )
                    .filter((text) => text.length > 0),
            });
        }

        return groups;
    }

    function isRoleCheckboxGroupAnswered(checkboxes) {
        return checkboxes.some(
            (checkbox) => checkbox.getAttribute('aria-checked') === 'true',
        );
    }

    function setRoleCheckboxGroupValue(checkboxes, answer) {
        for (const checkbox of checkboxes) {
            const optionText = (
                checkbox.textContent ||
                checkbox.getAttribute('aria-label') ||
                ''
            )
                .replace(/\s+/g, ' ')
                .trim();
            const optionValue = String(
                checkbox.getAttribute('data-value') ||
                    checkbox.getAttribute('value') ||
                    '',
            );

            if (
                optionMatchesAnswer(optionText, answer) ||
                optionMatchesAnswer(optionValue, answer)
            ) {
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
        return (
            element.tagName?.toLowerCase() === 'input' &&
            element.tabIndex === -1 &&
            element.getAttribute('aria-hidden') === 'true' &&
            element.closest('.select-shell, .select__container') !== null
        );
    }

    /**
     * Chosen.js (Softgarden / Wicket et al.) hides the native <select> with display:none and
     * renders a visible #${id}_chosen combobox. Keep the native select in inventory/fill.
     */
    function isChosenEnhancedSelect(element) {
        if (
            !element ||
            element.tagName?.toLowerCase() !== 'select' ||
            element.disabled
        ) {
            return false;
        }

        const doc = element.ownerDocument || document;
        const id = element.id;

        if (id) {
            const chosenById = doc.getElementById(`${id}_chosen`);

            if (chosenById?.classList?.contains('chosen-container')) {
                return true;
            }
        }

        const sibling = element.nextElementSibling;

        if (sibling?.classList?.contains('chosen-container')) {
            return true;
        }

        return (
            element.parentElement?.querySelector(
                ':scope > .chosen-container',
            ) !== null
        );
    }

    function isChosenSearchInput(element) {
        return Boolean(
            element?.classList?.contains('chosen-search-input') ||
            element?.closest?.('.chosen-drop, .chosen-search'),
        );
    }

    function syncChosenSelectUi(select) {
        if (!isChosenEnhancedSelect(select)) {
            return;
        }

        const view = select.ownerDocument?.defaultView || window;
        const jq = view.jQuery || view.$;

        if (typeof jq === 'function') {
            try {
                const $select = jq(select);

                if (
                    $select.data?.('chosen') ||
                    $select.next?.('.chosen-container').length
                ) {
                    $select.trigger('chosen:updated');

                    return;
                }
            } catch {
                // Fall through to DOM sync.
            }
        }

        const doc = select.ownerDocument || document;
        const chosen =
            (select.id && doc.getElementById(`${select.id}_chosen`)) ||
            (select.nextElementSibling?.classList?.contains('chosen-container')
                ? select.nextElementSibling
                : null);

        if (!chosen) {
            return;
        }

        const selected =
            select.selectedOptions?.[0] ||
            select.options?.[select.selectedIndex];
        const text = (selected?.textContent || '').replace(/\s+/g, ' ').trim();
        const single = chosen.querySelector('a.chosen-single, .chosen-single');
        const span = single?.querySelector('span');

        if (span) {
            span.textContent = text || ' ';
        }

        if (single?.classList) {
            if (!select.value || isPlaceholderSelectOption(selected)) {
                single.classList.add('chosen-default');
            } else {
                single.classList.remove('chosen-default');
            }
        }
    }

    function getPhoneInputFieldLabel(element) {
        const fieldset = element.closest('fieldset.phone-input');

        if (fieldset) {
            const id = element.getAttribute('id');

            if (id) {
                const doc = element.ownerDocument || document;
                const escapedId =
                    typeof CSS !== 'undefined' && CSS.escape
                        ? CSS.escape(id)
                        : id.replace(/"/g, '\\"');
                const explicit = doc.querySelector(`label[for="${escapedId}"]`);

                if (explicit) {
                    return normalize(explicit.textContent);
                }
            }
        }

        // intl-tel-input (Workable et al.): country list lives inside the wrapping label.
        const itiRoot =
            element.closest('.iti, [data-intl-tel-input-id]') ||
            (element.classList?.contains('iti__tel-input')
                ? element.parentElement
                : null);

        if (
            itiRoot ||
            element.type === 'tel' ||
            element.getAttribute('name') === 'phone'
        ) {
            const doc = element.ownerDocument || document;
            const phoneUi =
                element.closest('[data-ui="phone"]') ||
                itiRoot?.closest('[data-ui="phone"]');
            const labelled =
                phoneUi?.previousElementSibling?.querySelector?.(
                    '#phone_label, [id$="_label"]',
                ) ||
                doc.querySelector('#phone_label') ||
                phoneUi?.parentElement?.querySelector?.(
                    '#phone_label, [id$="_label"] strong, [id$="_label"]',
                );

            if (labelled?.textContent) {
                const text = normalize(labelled.textContent);

                if (text.length >= 3) {
                    return text;
                }
            }

            // Personio et al.: name="phone" with a localized label[for] (e.g. Téléphone).
            // Prefer the visible label over a hardcoded English "phone" fallback.
            const phoneId = element.getAttribute('id');

            if (phoneId) {
                const escapedPhoneId =
                    typeof CSS !== 'undefined' && CSS.escape
                        ? CSS.escape(phoneId)
                        : phoneId.replace(/"/g, '\\"');
                const explicitPhoneLabel = doc.querySelector(
                    `label[for="${escapedPhoneId}"]`,
                );

                if (explicitPhoneLabel) {
                    const explicitText = normalize(
                        explicitPhoneLabel.textContent,
                    );

                    if (explicitText.length >= 2) {
                        return explicitText;
                    }
                }
            }

            if (element.labels?.length) {
                const labelsText = normalize(
                    Array.from(element.labels)
                        .map((label) => label.textContent)
                        .join(' '),
                );

                if (labelsText.length >= 2) {
                    return labelsText;
                }
            }

            if (
                element.getAttribute('name') === 'phone' ||
                element.type === 'tel'
            ) {
                return 'phone';
            }
        }

        const phoneWidget = element.closest(
            '.PhoneInput, [class*="phone-input-"]',
        );

        if (!phoneWidget) {
            return null;
        }

        for (
            let node = phoneWidget.parentElement;
            node;
            node = node.parentElement
        ) {
            for (const label of node.querySelectorAll(':scope > label')) {
                if (
                    label.querySelector('input, textarea, select, .PhoneInput')
                ) {
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

    /**
     * LinkedIn Easy Apply contact/screener fields use fb-dash / artdeco labels that
     * are more reliable than falling back to the long Ember formElement id.
     */
    function getLinkedInEasyApplyFieldLabel(element) {
        if (!(element instanceof Element)) {
            return '';
        }

        const inEasyApply = element.closest?.(
            '.jobs-easy-apply-modal, .jobs-easy-apply-content, [data-test-modal].jobs-easy-apply-modal, form.jobs-easy-apply-form, .fb-dash-form-element',
        );

        if (!inEasyApply) {
            return '';
        }

        const formElement =
            element.closest('.fb-dash-form-element') || element.parentElement;
        const title = formElement?.querySelector?.(
            '[data-test-text-entity-list-form-title], .fb-dash-form-element__label, .artdeco-text-input--label, label.artdeco-text-input--label',
        );

        if (title && !title.contains(element)) {
            const text = normalize(title.textContent);

            if (
                text.length >= 2 &&
                !/form\s*element\s*urn|easy\s*apply\s*form\s*element/i.test(
                    text,
                )
            ) {
                return text;
            }
        }

        const id = element.getAttribute('id');

        if (id) {
            const doc = element.ownerDocument || document;
            const escapedId =
                typeof CSS !== 'undefined' && CSS.escape
                    ? CSS.escape(id)
                    : id.replace(/"/g, '\\"');
            const explicit = doc.querySelector(`label[for="${escapedId}"]`);
            const explicitText = normalize(explicit?.textContent || '');

            if (
                explicitText.length >= 2 &&
                !/form\s*element\s*urn|easy\s*apply\s*form\s*element/i.test(
                    explicitText,
                )
            ) {
                return explicitText;
            }
        }

        return '';
    }

    function getSmartRecruitersFieldLabel(element) {
        const host = outermostShadowHost(element);
        const scope =
            host?.closest?.(
                'spl-form-field, oc-input, oc-textarea, oc-phone-number, oc-location-autocomplete, [data-test*="personal-info"], [data-test*="first-name"], [formcontrolname]',
            ) || host;

        if (!scope) {
            return '';
        }

        const aria = normalize(scope.getAttribute?.('aria-label') || '');

        if (aria.length >= 2) {
            return aria;
        }

        const labelEl = scope.querySelector?.(
            'label, spl-label, .spl-form-field__label, [class*="label"]',
        );
        const labelText = labelEl?.textContent
            ? normalize(labelEl.textContent)
            : '';

        if (labelText.length >= 2) {
            return labelText;
        }

        const formControl = String(
            scope.getAttribute?.('formcontrolname') ||
                host?.getAttribute?.('formcontrolname') ||
                '',
        ).trim();

        if (formControl.length >= 2) {
            return normalize(
                formControl
                    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                    .replace(/[_\-.]+/g, ' '),
            );
        }

        const dataTest = String(
            scope.getAttribute?.('data-test') ||
                host?.getAttribute?.('data-test') ||
                '',
        ).trim();

        if (dataTest.length >= 2) {
            return normalize(
                dataTest
                    .replace(/^personal-info-/, '')
                    .replace(/-input$/, '')
                    .replace(/[_\-.]+/g, ' '),
            );
        }

        // Native control name/id inside shadow often camelCase without spaces.
        const rawName = String(
            element.getAttribute?.('name') ||
                element.getAttribute?.('id') ||
                '',
        ).trim();

        if (
            rawName.length >= 2 &&
            /(?:name|email|phone|linkedin|twitter|facebook|website|message|city|location)/i.test(
                rawName,
            )
        ) {
            return normalize(
                rawName
                    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                    .replace(/[_\-.]+/g, ' '),
            );
        }

        return '';
    }

    function getFieldLabel(element) {
        const smsConsentLabel = getSmsConsentQuestionLabel(element);

        if (smsConsentLabel.length >= 3) {
            return smsConsentLabel;
        }

        const phoneInputLabel = getPhoneInputFieldLabel(element);

        if (phoneInputLabel) {
            return phoneInputLabel;
        }

        const linkedInEasyApplyLabel = getLinkedInEasyApplyFieldLabel(element);

        if (linkedInEasyApplyLabel.length >= 2) {
            return linkedInEasyApplyLabel;
        }

        if (getAshbyFieldEntry(element)) {
            const ashbyTitle = getAshbyQuestionTitle(element);

            if (ashbyTitle.length >= 3) {
                return ashbyTitle;
            }

            return '';
        }

        const leverLabel = getLeverQuestionLabel(element);

        if (leverLabel.length >= 2) {
            return leverLabel;
        }

        const recruiteeLabel = getRecruiteeQuestionLabel(element);

        if (recruiteeLabel.length >= 2) {
            return recruiteeLabel;
        }

        const greenhouseLabel = getGreenhouseQuestionLabel(element);

        if (greenhouseLabel.length >= 2) {
            return greenhouseLabel;
        }

        const reedLabel = getReedQuestionLabel(element);

        if (reedLabel.length >= 2) {
            return reedLabel;
        }

        const workableLabel = getWorkableQuestionLabel(element);

        if (workableLabel.length >= 2) {
            return workableLabel;
        }

        const smartRecruitersLabel = getSmartRecruitersFieldLabel(element);

        if (smartRecruitersLabel.length >= 2) {
            return smartRecruitersLabel;
        }

        const labelParts = [];
        const doc = element.ownerDocument || document;

        if (element.labels?.length) {
            labelParts.push(
                ...Array.from(element.labels).map((label) => label.textContent),
            );
        }

        const id = element.getAttribute('id');

        if (id) {
            const escapedId =
                typeof CSS !== 'undefined' && CSS.escape
                    ? CSS.escape(id)
                    : id.replace(/"/g, '\\"');
            const explicit = doc.querySelector(`label[for="${escapedId}"]`);

            if (explicit) {
                const explicitText = explicit.textContent || '';
                const alreadyIncluded = labelParts.some(
                    (part) => normalize(part) === normalize(explicitText),
                );

                if (!alreadyIncluded) {
                    labelParts.push(explicitText);
                }
            }
        }

        labelParts.push(
            element.getAttribute('aria-label'),
            element.getAttribute('placeholder'),
            element.closest('label')?.textContent,
        );

        const greenhouseScoped = element.closest('.field-wrapper');

        if (greenhouseScoped) {
            const scopedLabel = greenhouseScoped.querySelector(
                'label.label, label.select__label, .upload-label, .label',
            );
            const scopedText = scopedLabel?.textContent || '';

            if (scopedText) {
                labelParts.push(scopedText);
            }
        } else {
            labelParts.push(
                element
                    .closest('.form-group, .field, .input-wrapper')
                    ?.querySelector('label, legend, .label, h3, h4, p')
                    ?.textContent,
            );
        }

        const humanLabel = dedupeRepeatedLabelTokens(
            normalize(labelParts.filter(Boolean).join(' ')),
        );

        if (humanLabel.length >= 3) {
            return humanLabel;
        }

        return normalize(
            [
                humanLabel,
                element.getAttribute('name'),
                element.getAttribute('id'),
            ]
                .filter(Boolean)
                .join(' '),
        );
    }

    function isTargetConnected(target) {
        if (Array.isArray(target)) {
            return target.some((element) => element?.isConnected);
        }

        return Boolean(target?.isConnected);
    }

    function isNativeChoiceInput(element, fieldType) {
        return (
            element?.tagName?.toLowerCase() === 'input' &&
            element.type === fieldType
        );
    }

    function queryNativeChoiceInput(
        doc,
        fieldType,
        { name = null, container = null } = {},
    ) {
        if (name) {
            const byName =
                doc.querySelector(
                    `input[type="${fieldType}"][name="${escapeSelectorValue(name)}"]`,
                ) ||
                doc.querySelector(`input[name="${escapeSelectorValue(name)}"]`);

            if (byName) {
                return byName;
            }
        }

        if (container) {
            const inContainer = container.querySelector(
                `input[type="${fieldType}"]`,
            );

            if (inContainer) {
                return inContainer;
            }
        }

        return null;
    }

    function resolveSmartRecruitersControlFromDom(doc, dom, fieldType) {
        if (!dom || !doc) {
            return null;
        }

        const dataTest = dom.sr_data_test;

        if (dataTest) {
            const scope = doc.querySelector(
                `[data-test="${escapeSelectorValue(dataTest)}"]`,
            );

            if (scope) {
                if (fieldType === 'tel' || /phone/i.test(dataTest)) {
                    const phoneHost =
                        scope.querySelector(
                            'spl-phone-field, oc-phone-number',
                        ) ||
                        scope.closest?.('spl-phone-field, oc-phone-number');

                    if (phoneHost) {
                        return (
                            findSmartRecruitersPhoneTelInput(phoneHost) ||
                            phoneHost
                        );
                    }

                    const tel = querySelectorAllDeep(
                        scope,
                        'input[type="tel"]',
                    )[0];

                    if (tel) {
                        return tel;
                    }
                }

                if (/location/i.test(dataTest)) {
                    const locationHost =
                        scope.querySelector(
                            'oc-location-autocomplete, spl-autocomplete',
                        ) ||
                        scope.closest?.(
                            'oc-location-autocomplete, spl-autocomplete',
                        );
                    const locationInput = locationHost
                        ? querySelectorAllDeep(
                              locationHost,
                              'input:not([type="hidden"])',
                          )[0]
                        : scope.querySelector('input:not([type="hidden"])');

                    if (locationInput) {
                        return locationInput;
                    }
                }

                const scopedInput = scope.querySelector(
                    'input, textarea, select',
                );

                if (scopedInput) {
                    return scopedInput;
                }
            }
        }

        if (dom.id && /^spl-form-element_/i.test(dom.id)) {
            const phoneHost = doc.querySelector(
                `spl-phone-field#${escapeSelectorValue(dom.id)}`,
            );

            if (phoneHost && fieldType === 'tel') {
                return findSmartRecruitersPhoneTelInput(phoneHost) || phoneHost;
            }

            const deepMatches = querySelectorAllDeep(
                doc,
                `#${escapeSelectorValue(dom.id)}`,
            );

            for (const candidate of deepMatches) {
                if (
                    fieldType === 'tel' &&
                    (candidate.type === 'tel' ||
                        isSmartRecruitersPhoneInput(candidate))
                ) {
                    return candidate;
                }

                if (
                    fieldType !== 'tel' &&
                    candidate.type !== 'tel' &&
                    candidate.type !== 'hidden'
                ) {
                    return candidate;
                }
            }
        }

        return null;
    }

    function resolveElementFromDom(doc, dom, fieldType) {
        if (!dom || !doc) {
            return null;
        }

        const smartRecruitersTarget = resolveSmartRecruitersControlFromDom(
            doc,
            dom,
            fieldType,
        );

        if (smartRecruitersTarget) {
            return smartRecruitersTarget;
        }

        const isChoiceField = fieldType === 'radio' || fieldType === 'checkbox';

        if (isChoiceField && dom.name) {
            const byName = queryNativeChoiceInput(doc, fieldType, {
                name: dom.name,
            });

            if (byName) {
                return byName;
            }
        }

        if (dom.id) {
            if (fieldType === 'checkbox') {
                const checkboxInput = doc.querySelector(
                    `input[type="checkbox"]#${escapeSelectorValue(dom.id)}`,
                );

                if (checkboxInput) {
                    return checkboxInput;
                }
            }

            if (fieldType === 'radio') {
                const radioInput = doc.querySelector(
                    `input[type="radio"]#${escapeSelectorValue(dom.id)}`,
                );

                if (radioInput) {
                    return radioInput;
                }
            }

            const byId = doc.getElementById(dom.id);

            if (byId) {
                if (
                    fieldType === 'radio' &&
                    byId.getAttribute('role') === 'radiogroup'
                ) {
                    const radios = Array.from(
                        byId.querySelectorAll('[role="radio"]'),
                    ).filter(isVisible);

                    if (radios.length >= 2) {
                        return radios;
                    }
                }

                if (isChoiceField && !isNativeChoiceInput(byId, fieldType)) {
                    const input = queryNativeChoiceInput(doc, fieldType, {
                        name: dom.name,
                        container: byId,
                    });

                    if (input) {
                        return input;
                    }
                }

                if (
                    !dom.name ||
                    byId.getAttribute('name') === dom.name ||
                    byId.name === dom.name
                ) {
                    return byId;
                }
            }
        }

        if (dom.name) {
            const byName = doc.querySelector(
                `[name="${escapeSelectorValue(dom.name)}"]`,
            );

            if (byName) {
                if (isChoiceField && !isNativeChoiceInput(byName, fieldType)) {
                    const input = queryNativeChoiceInput(doc, fieldType, {
                        name: dom.name,
                        container:
                            byName.closest(
                                '[role="radiogroup"], fieldset, [role="group"]',
                            ) || byName,
                    });

                    if (input) {
                        return input;
                    }
                }

                return byName;
            }
        }

        if (dom.data_testid) {
            return doc.querySelector(
                `[data-testid="${escapeSelectorValue(dom.data_testid)}"]`,
            );
        }

        if (dom.data_field_path) {
            const scope = doc.querySelector(
                `[data-field-path="${escapeSelectorValue(dom.data_field_path)}"]`,
            );

            if (scope) {
                const combobox = scope.querySelector('[role="combobox"]');

                if (combobox) {
                    return combobox;
                }
            }

            return doc.querySelector(
                `[data-field-path="${escapeSelectorValue(dom.data_field_path)}"]`,
            );
        }

        if (dom.role === 'combobox') {
            const comboboxes = Array.from(
                doc.querySelectorAll('[role="combobox"]'),
            ).filter(isVisible);

            if (comboboxes.length === 1) {
                return comboboxes[0];
            }
        }

        if (fieldType === 'tel' && dom.type === 'tel') {
            if (dom.id) {
                const deepTel = querySelectorAllDeep(
                    doc,
                    `#${escapeSelectorValue(dom.id)}`,
                ).find(
                    (candidate) =>
                        candidate.type === 'tel' ||
                        isSmartRecruitersPhoneInput(candidate),
                );

                if (deepTel) {
                    return deepTel;
                }
            }

            return (
                doc.querySelector('input[type="tel"].PhoneInputInput') ||
                doc.querySelector('.PhoneInput input[type="tel"]') ||
                querySelectorAllDeep(doc, 'input[type="tel"]').find(
                    (candidate) => isSmartRecruitersPhoneInput(candidate),
                ) ||
                doc.querySelector('input[type="tel"]')
            );
        }

        if (dom.question_prefix) {
            for (const label of doc.querySelectorAll('label')) {
                if (!label.textContent.trim().startsWith(dom.question_prefix)) {
                    continue;
                }

                if (
                    label.querySelector(
                        'input[type="radio"], input[type="checkbox"]',
                    )
                ) {
                    continue;
                }

                const block = label.parentElement;
                const input = block?.querySelector(
                    `input[type="${escapeSelectorValue(dom.type || fieldType)}"], textarea, select`,
                );

                if (input) {
                    return input;
                }
            }
        }

        if (dom.placeholder) {
            const byPlaceholder = doc.querySelector(
                `input[placeholder="${escapeSelectorValue(dom.placeholder)}"]`,
            );

            if (byPlaceholder) {
                return byPlaceholder;
            }
        }

        if (dom.min && dom.type) {
            const byMin = doc.querySelector(
                `input[type="${escapeSelectorValue(dom.type)}"][min="${escapeSelectorValue(dom.min)}"]`,
            );

            if (byMin) {
                return byMin;
            }
        }

        return null;
    }

    function resolveTargetFromDom(doc, dom, fieldType, dataFieldPath = null) {
        const fieldPath = dataFieldPath || dom?.data_field_path || null;

        if (fieldPath) {
            const scope = doc.querySelector(
                `[data-field-path="${escapeSelectorValue(fieldPath)}"]`,
            );

            if (scope) {
                if (fieldType === 'tel') {
                    const tel = scope.querySelector('input[type="tel"]');

                    if (tel) {
                        return tel;
                    }
                }

                if (fieldType === 'radio' || fieldType === 'checkbox') {
                    const anchor = resolveElementFromDom(doc, dom, fieldType);

                    if (isNativeChoiceInput(anchor, fieldType)) {
                        return anchor;
                    }

                    if (dom?.name) {
                        const byName = scope.querySelector(
                            `input[type="${escapeSelectorValue(fieldType)}"][name="${escapeSelectorValue(dom.name)}"]`,
                        );

                        if (byName) {
                            return byName;
                        }
                    }

                    const yesNoButtons = queryAshbyYesNoButtons(scope, doc);

                    if (yesNoButtons.length >= 2) {
                        return yesNoButtons;
                    }
                } else {
                    const yesNoButtons = queryAshbyYesNoButtons(scope, doc);

                    if (yesNoButtons.length >= 2) {
                        return yesNoButtons;
                    }
                }

                const combobox = scope.querySelector('[role="combobox"]');

                if (combobox) {
                    return combobox;
                }

                if (fieldType !== 'radio' && fieldType !== 'checkbox') {
                    const input = scope.querySelector(
                        'input, textarea, select',
                    );

                    if (input) {
                        return input;
                    }
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

        if (actualDigits.length >= 8 && expectedDigits.length >= 8) {
            if (actualDigits === expectedDigits) {
                return true;
            }

            const expectedNational =
                parseIndeedPhoneParts(expected).nationalDigits;

            if (expectedNational && actualDigits === expectedNational) {
                return true;
            }

            if (expectedDigits.endsWith(actualDigits)) {
                return true;
            }
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

        if (
            normalizedActual.includes(normalizedExpected) ||
            normalizedExpected.includes(normalizedActual)
        ) {
            return true;
        }

        return optionMatchesAnswer(actual, expected);
    }

    const SMART_RECRUITERS_VALUE_HOST_TAGS = new Set([
        'spl-input',
        'spl-textarea',
        'spl-autocomplete',
        'spl-phone-field',
        'spl-checkbox',
        'oc-input',
        'oc-textarea',
        'oc-phone-number',
        'oc-location-autocomplete',
    ]);

    function isSmartRecruitersOneclickContext(element) {
        const pageHost =
            element?.ownerDocument?.defaultView?.location?.hostname || '';

        if (/smartrecruiters\.com/i.test(pageHost)) {
            return true;
        }

        let current = element;

        while (current) {
            const tag = String(current.tagName || '').toLowerCase();

            if (
                tag === 'oc-oneclick-form' ||
                tag === 'oc-personal-information'
            ) {
                return true;
            }

            const root = current.getRootNode?.();

            if (root instanceof ShadowRoot && root.host) {
                current = root.host;
                continue;
            }

            break;
        }

        return false;
    }

    function readSmartRecruitersHostValue(host) {
        let attrValue = String(host?.getAttribute?.('value') || '').trim();

        if (!attrValue && host?.value != null) {
            if (typeof host.value === 'string') {
                attrValue = host.value.trim();
            } else if (typeof host.value === 'object') {
                attrValue = JSON.stringify(host.value);
            }
        }

        if (!attrValue) {
            return null;
        }

        if (attrValue.startsWith('{')) {
            try {
                const parsed = JSON.parse(attrValue);

                if (typeof parsed.number === 'string' && parsed.number.trim()) {
                    return parsed.number.trim();
                }

                if (
                    typeof parsed.nationalNumber === 'string' &&
                    parsed.nationalNumber.trim()
                ) {
                    return parsed.nationalNumber.trim();
                }

                if (typeof parsed.value === 'string' && parsed.value.trim()) {
                    return parsed.value.trim();
                }

                return null;
            } catch {
                return null;
            }
        }

        return attrValue;
    }

    function isSmartRecruitersJsonStub(value) {
        if (
            !String(value || '')
                .trim()
                .startsWith('{')
        ) {
            return false;
        }

        try {
            const parsed = JSON.parse(String(value));

            return Boolean(
                parsed &&
                typeof parsed === 'object' &&
                !parsed.number &&
                !parsed.nationalNumber &&
                !parsed.value,
            );
        } catch {
            return false;
        }
    }

    function findSmartRecruitersPhoneHost(element) {
        let current = element;

        while (current) {
            const tag = String(current.tagName || '').toLowerCase();

            if (tag === 'spl-phone-field' || tag === 'oc-phone-number') {
                return current;
            }

            const root = current.getRootNode?.();

            if (root instanceof ShadowRoot && root.host) {
                current = root.host;
                continue;
            }

            current = current.parentElement;
        }

        return null;
    }

    function isSmartRecruitersPhoneInput(element) {
        if (!element || !isSmartRecruitersOneclickContext(element)) {
            return false;
        }

        if (element.type === 'tel') {
            return Boolean(findSmartRecruitersPhoneHost(element));
        }

        const tag = String(element.tagName || '').toLowerCase();

        return tag === 'spl-phone-field' || tag === 'oc-phone-number';
    }

    function findSmartRecruitersPhoneTelInput(host) {
        if (!host) {
            return null;
        }

        if (host.type === 'tel') {
            return host;
        }

        const shadowTel = host.shadowRoot?.querySelector('input[type="tel"]');

        if (shadowTel) {
            return shadowTel;
        }

        return querySelectorAllDeep(host, 'input[type="tel"]')[0] || null;
    }

    async function setSmartRecruitersPhoneValue(element, value) {
        const stringValue = String(value || '').trim();

        if (!stringValue || !isSmartRecruitersPhoneInput(element)) {
            return false;
        }

        const host = findSmartRecruitersPhoneHost(element) || element;
        const telInput = findSmartRecruitersPhoneTelInput(host);
        const { iso, dialCodeDigits, nationalDigits } =
            parseIndeedPhoneParts(stringValue);
        const country = iso || 'GB';
        const e164 = stringValue.startsWith('+')
            ? stringValue.replace(/\s/g, '')
            : dialCodeDigits
              ? `+${dialCodeDigits}${nationalDigits}`
              : stringValue;
        const payload = {
            country,
            number: e164,
        };

        if (host && host !== telInput) {
            host.value = payload;
            host.setAttribute('value', JSON.stringify(payload));
            host.dispatchEvent(
                new Event('input', { bubbles: true, composed: true }),
            );
            host.dispatchEvent(
                new Event('change', { bubbles: true, composed: true }),
            );
        }

        if (telInput) {
            telInput.focus();
            dispatchPointerClick(telInput);
            setNativeValue(
                telInput,
                nationalDigits || stringValue.replace(/\D/g, ''),
            );
            telInput.dispatchEvent(
                new InputEvent('input', {
                    bubbles: true,
                    composed: true,
                    cancelable: true,
                    inputType: 'insertFromPaste',
                    data: stringValue,
                }),
            );
            telInput.dispatchEvent(
                new Event('change', { bubbles: true, composed: true }),
            );
            telInput.dispatchEvent(
                new FocusEvent('blur', { bubbles: true, composed: true }),
            );
        }

        const readTarget = telInput || host;
        const readback = readSmartRecruitersControlValue(readTarget);
        const enteredDigits = normalizePhoneDigits(
            readback || telInput?.value || '',
        );
        const expectedDigits = normalizePhoneDigits(stringValue);

        if (enteredDigits.length >= Math.min(expectedDigits.length, 8)) {
            heuristicsLog(
                'info',
                'apply.phone',
                'smartrecruiters phone filled',
                {
                    valuePreview: stringValue.slice(0, 80),
                    country,
                },
            );

            return true;
        }

        heuristicsLog(
            'warn',
            'apply.phone',
            'smartrecruiters phone fill did not verify',
            {
                valuePreview: stringValue.slice(0, 80),
                readbackPreview: String(readback || '').slice(0, 80),
            },
        );

        return false;
    }

    function readSmartRecruitersControlValue(element) {
        if (!element || !isSmartRecruitersOneclickContext(element)) {
            return null;
        }

        let current = element;

        while (current) {
            const tag = String(current.tagName || '').toLowerCase();

            if (SMART_RECRUITERS_VALUE_HOST_TAGS.has(tag)) {
                const hostValue = readSmartRecruitersHostValue(current);

                if (hostValue) {
                    return hostValue;
                }
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

    function readSimpleFieldValue(element, fieldType) {
        if (!element) {
            return null;
        }

        if (Array.isArray(element)) {
            return readAshbyYesNoSelection(
                element[0],
                element[0]?.ownerDocument || document,
            );
        }

        if (element.getAttribute?.('role') === 'combobox') {
            const reactSelectValue = readReactSelectValue(element);

            if (reactSelectValue) {
                return reactSelectValue;
            }

            const smartRecruitersValue =
                readSmartRecruitersControlValue(element);

            if (smartRecruitersValue) {
                return smartRecruitersValue;
            }

            // Typed react-select filter text is not a committed selection.
            if (isReactSelectComboboxShell(element)) {
                return null;
            }

            return element.value?.trim() || null;
        }

        if (isPhoneCountryListboxButton(element)) {
            return readPhoneCountryListboxValue(element);
        }

        if (element.tagName?.toLowerCase() === 'select') {
            const selected =
                element.selectedOptions?.[0] ||
                element.options?.[element.selectedIndex];

            return (
                (selected?.textContent || selected?.value || '')
                    .replace(/\s+/g, ' ')
                    .trim() || null
            );
        }

        if (
            fieldType === 'textarea' ||
            element.tagName?.toLowerCase() === 'textarea'
        ) {
            return (
                readSmartRecruitersControlValue(element) ||
                element.value?.trim() ||
                null
            );
        }

        if (fieldType === 'tel' || element.type === 'tel') {
            const srValue = readSmartRecruitersControlValue(element);

            if (srValue) {
                return srValue;
            }

            const raw = element.value?.trim() || '';

            if (raw.startsWith('{')) {
                try {
                    const parsed = JSON.parse(raw);

                    if (
                        typeof parsed.number === 'string' &&
                        parsed.number.trim()
                    ) {
                        return parsed.number.trim();
                    }

                    if (
                        typeof parsed.nationalNumber === 'string' &&
                        parsed.nationalNumber.trim()
                    ) {
                        return parsed.nationalNumber.trim();
                    }
                } catch {
                    return null;
                }

                return null;
            }

            return raw || null;
        }

        return (
            readSmartRecruitersControlValue(element) ||
            (element.value?.trim() &&
            !isSmartRecruitersJsonStub(element.value.trim())
                ? element.value.trim()
                : null)
        );
    }

    function shouldSkipReadableControl(element, skipTypes) {
        const tag = String(element.tagName || '').toLowerCase();
        const type = String(
            element.type ||
                (tag === 'textarea'
                    ? 'textarea'
                    : tag === 'select'
                      ? 'select-one'
                      : 'text'),
        ).toLowerCase();
        const name = element.name || '';
        const id = element.id || '';
        const labelBits =
            `${name} ${id} ${element.getAttribute('aria-label') || ''}`.toLowerCase();

        if (skipTypes.has(type)) {
            return true;
        }

        return /search|captcha|honeypot|leave this blank|csrf|_token/.test(
            labelBits,
        );
    }

    function buildReadableControlRecord(element, index) {
        const tag = String(element.tagName || '').toLowerCase();
        const type = String(
            element.type ||
                (tag === 'textarea'
                    ? 'textarea'
                    : tag === 'select'
                      ? 'select-one'
                      : 'text'),
        ).toLowerCase();
        const name = element.name || '';
        const id = element.id || '';
        let value = '';
        let checked = false;

        if (type === 'checkbox' || type === 'radio') {
            checked = Boolean(element.checked);
            value = checked ? String(element.value || 'on') : '';

            if (
                type === 'radio' &&
                isWorkableApplyHost(element.ownerDocument || document)
            ) {
                const roleHost = getWorkableRoleRadioHost(element);
                const roleLabel =
                    roleHost?.getAttribute('aria-checked') === 'true'
                        ? readWorkableRoleRadioLabel(roleHost)
                        : '';

                if (roleLabel) {
                    checked = true;
                    value = roleLabel;
                }
            }

            if (type === 'checkbox' && element.closest('[class*="_yesno_"]')) {
                const yesNoValue = readAshbyYesNoValueForInput(element);

                if (yesNoValue) {
                    value = yesNoValue;
                    checked = true;
                }
            }
        } else if (tag === 'select') {
            value = String(
                readSimpleFieldValue(element, 'select') || element.value || '',
            );
        } else {
            value = String(
                readSimpleFieldValue(element, type) || element.value || '',
            );
        }

        return {
            index,
            tag,
            type,
            id: id || null,
            name: name || null,
            value,
            checked,
            required: Boolean(element.required),
            visible:
                element.offsetParent !== null ||
                (element.getClientRects?.().length ?? 0) > 0,
        };
    }

    function collectReadableFieldValueControls(root = document) {
        const skipTypes = new Set([
            'hidden',
            'submit',
            'button',
            'image',
            'reset',
            'file',
        ]);
        const controls = [];
        let index = 0;

        for (const element of querySelectorAllDeep(
            root,
            'input, textarea, select',
        )) {
            if (shouldSkipReadableControl(element, skipTypes)) {
                continue;
            }

            controls.push(buildReadableControlRecord(element, index));
            index += 1;
        }

        return controls;
    }

    function collectReadableFieldValueControlsAllFrames() {
        const controls = [];
        let index = 0;
        const skipTypes = new Set([
            'hidden',
            'submit',
            'button',
            'image',
            'reset',
            'file',
        ]);

        forEachIframeDocument((doc) => {
            for (const element of querySelectorAllDeep(
                doc,
                'input, textarea, select',
            )) {
                if (shouldSkipReadableControl(element, skipTypes)) {
                    continue;
                }

                controls.push(buildReadableControlRecord(element, index));
                index += 1;
            }
        });

        return controls;
    }

    function summarizeReadableFieldValueControls(controls, pageUrl, pageTitle) {
        const filled = controls.filter((control) => {
            if (control.type === 'checkbox' || control.type === 'radio') {
                return control.checked;
            }

            return String(control.value || '').trim() !== '';
        });

        return {
            success: true,
            page_url: pageUrl,
            page_title: pageTitle,
            count: controls.length,
            filled_count: filled.length,
            fill_rate:
                controls.length === 0
                    ? 0
                    : Number((filled.length / controls.length).toFixed(4)),
            controls,
        };
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
                const scope = findAshbyYesNoScope(options.root || document, {
                    dataFieldPath: options.dataFieldPath || null,
                    anchor: target[0],
                });
                const booleanAnswer = extractBooleanAnswer(answer);

                return isAshbyYesNoCommitted(
                    scope,
                    booleanAnswer,
                    options.root || document,
                );
            }

            if (target[0]?.getAttribute?.('role') === 'checkbox') {
                const selected = target
                    .filter(
                        (checkbox) =>
                            checkbox.getAttribute('aria-checked') === 'true',
                    )
                    .map((checkbox) =>
                        (
                            checkbox.textContent ||
                            checkbox.getAttribute('aria-label') ||
                            ''
                        )
                            .replace(/\s+/g, ' ')
                            .trim(),
                    )
                    .filter(Boolean);

                if (fieldType === 'checkbox') {
                    const expected = String(answer)
                        .split(/[,;|]/)
                        .map((part) => part.trim())
                        .filter(Boolean);

                    return expected.every((part) =>
                        selected.some((value) =>
                            optionMatchesAnswer(value, part),
                        ),
                    );
                }

                return selected.some((value) =>
                    optionMatchesAnswer(value, answer),
                );
            }

            const selectedRoleRadio = target.find(
                (radio) => radio.getAttribute('aria-checked') === 'true',
            );

            if (selectedRoleRadio) {
                const optionText = (
                    selectedRoleRadio.textContent ||
                    selectedRoleRadio.getAttribute('aria-label') ||
                    ''
                )
                    .replace(/\s+/g, ' ')
                    .trim();

                return optionMatchesAnswer(optionText, answer);
            }
        }

        if (target?.getAttribute?.('role') === 'listbox') {
            const selected = Array.from(
                target.querySelectorAll('[role="option"]'),
            ).find((option) => option.getAttribute('aria-selected') === 'true');

            if (selected) {
                const optionText = (
                    selected.textContent ||
                    selected.getAttribute('aria-label') ||
                    ''
                )
                    .replace(/\s+/g, ' ')
                    .trim();

                return optionMatchesAnswer(optionText, answer);
            }

            return false;
        }

        if (target?.getAttribute?.('role') === 'radio') {
            const group = target.closest('[role="radiogroup"]');
            const radios = group
                ? Array.from(group.querySelectorAll('[role="radio"]'))
                : [target];
            const selectedRoleRadio = radios.find(
                (radio) => radio.getAttribute('aria-checked') === 'true',
            );

            if (selectedRoleRadio) {
                const optionText = (
                    selectedRoleRadio.textContent ||
                    selectedRoleRadio.getAttribute('aria-label') ||
                    ''
                )
                    .replace(/\s+/g, ' ')
                    .trim();

                return optionMatchesAnswer(optionText, answer);
            }
        }

        if (fieldType === 'radio' || fieldType === 'checkbox') {
            if (target?.type === 'radio' || target?.type === 'checkbox') {
                if (
                    fieldType === 'checkbox' &&
                    target.checked &&
                    isConsentWildcardAnswer(answer)
                ) {
                    return true;
                }

                const selection = readNativeInputGroupSelection(
                    target,
                    fieldType,
                );

                if (fieldType === 'checkbox' && Array.isArray(selection)) {
                    const expected = String(answer)
                        .split(/[,;|]/)
                        .map((part) => part.trim())
                        .filter(Boolean);

                    return expected.every((part) =>
                        selection.some((value) =>
                            optionMatchesAnswer(value, part),
                        ),
                    );
                }

                return optionMatchesAnswer(selection, answer);
            }
        }

        const actual = readSimpleFieldValue(target, fieldType);

        if (isGreenhousePhoneCountryCombobox(target)) {
            return phoneCountryOptionMatches(
                readGreenhousePhoneCountryValue(target),
                answer,
            );
        }

        if (
            target?.getAttribute?.('role') === 'combobox' &&
            isWorkableSelectCombobox(target)
        ) {
            return workableSelectIsCommitted(target, answer);
        }

        if (isSmartRecruitersPhoneInput(target)) {
            const readback = readSmartRecruitersControlValue(target);

            return valueMatchesAnswer(readback || target.value, answer);
        }

        return valueMatchesAnswer(actual, answer);
    }

    function elementDefaultView(element) {
        return element?.ownerDocument?.defaultView || window;
    }

    function isAshbyAutofillResumeHelper(element) {
        return Boolean(
            element?.closest?.(
                '.ashby-application-form-autofill-uploader, [class*="autofillPane"], [class*="_autofillPane_"]',
            ),
        );
    }

    /**
     * Custom upload UIs often clip the native file input (Ashby resume). Still inventory it
     * when it has a real question label and is not the autofill helper dropzone.
     */
    function isLabeledApplicationFileInput(element) {
        if (!element || element.type !== 'file' || element.disabled) {
            return false;
        }

        if (isAshbyAutofillResumeHelper(element)) {
            return false;
        }

        return getQuestionLabel(element).length >= 3;
    }

    function isVisible(element) {
        if (!element || element.disabled) {
            return false;
        }

        // Workable (and similar) custom selects use readonly combobox inputs as the visible control.
        if (element.readOnly && element.getAttribute?.('role') !== 'combobox') {
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

            return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                element.offsetParent !== null
            );
        } catch {
            return false;
        }
    }

    /**
     * Template-gallery / docs site search (e.g. Jotform "Search in all Form Templates").
     * Not an application question - exclude from inventory.
     */
    function isSiteSearchChrome(element) {
        if (!element) {
            return false;
        }

        if (
            element.closest?.(
                'form[role="search"], form.hero-search-form, [role="search"]',
            )
        ) {
            return true;
        }

        const id = String(element.id || '').toLowerCase();
        const name = String(
            element.getAttribute?.('name') || element.name || '',
        ).toLowerCase();
        const placeholder = String(
            element.getAttribute?.('placeholder') || '',
        ).toLowerCase();

        if (id === 'search-input' || id.includes('search-input')) {
            return true;
        }

        if (name === 'q' && /search/.test(placeholder)) {
            return true;
        }

        return /search in all (form )?templates/i.test(placeholder);
    }

    /**
     * Workable select widgets keep a tabindex=-1 aria-hidden value input beside the readonly
     * combobox. Inventory the combobox, not this companion field.
     */
    function isWorkableHiddenSelectValueInput(element) {
        if (
            !element ||
            !isWorkableApplyHost(element.ownerDocument || document)
        ) {
            return false;
        }

        if (element.tagName?.toLowerCase() !== 'input') {
            return false;
        }

        if (
            element.type === 'radio' ||
            element.type === 'checkbox' ||
            element.type === 'file' ||
            element.type === 'hidden'
        ) {
            return false;
        }

        if (
            element.getAttribute('aria-hidden') !== 'true' &&
            element.tabIndex !== -1
        ) {
            return false;
        }

        const selectRoot = element.closest('[data-input-type="select"]');

        if (!selectRoot) {
            return false;
        }

        return selectRoot.querySelector('[role="combobox"]') !== null;
    }

    /**
     * Workable address widgets keep clipped city/postcode/country companions for Places parsing.
     * They inherit the wrong nearby label (often "First name") if inventoried.
     */
    function isWorkableHiddenAddressSubfield(element) {
        if (
            !element ||
            !isWorkableApplyHost(element.ownerDocument || document)
        ) {
            return false;
        }

        const identity = String(
            element.id ||
                element.name ||
                element.getAttribute?.('data-ui') ||
                '',
        );

        if (
            !/^(city|postcode|postalcode|zip|zipcode|country|state|region|admin_area)$/i.test(
                identity,
            )
        ) {
            return false;
        }

        if (
            element.getAttribute('aria-hidden') === 'true' ||
            element.tabIndex === -1
        ) {
            return true;
        }

        const clipped = element.closest('div[style*="overflow"]');

        if (!clipped) {
            return false;
        }

        const style = String(clipped.getAttribute('style') || '');

        return /width:\s*1px/i.test(style) && /height:\s*1px/i.test(style);
    }

    function isWorkableAddressField(element) {
        if (
            !element ||
            !isWorkableApplyHost(element.ownerDocument || document)
        ) {
            return false;
        }

        const identity = String(
            element.id ||
                element.name ||
                element.getAttribute?.('data-ui') ||
                '',
        );

        return /^address$/i.test(identity);
    }

    /**
     * Workable often geo-fills Address as "City, Country" with no street/number. Keep it
     * draftable so applicants can correct the location.
     */
    function isWorkableAddressGeoDefault(element) {
        if (!isWorkableAddressField(element)) {
            return false;
        }

        const value = String(element.value || '').trim();

        if (!value || /\d/.test(value)) {
            return false;
        }

        return /,\s*\S+/.test(value);
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
            const descriptor = Object.getOwnPropertyDescriptor(
                prototype,
                'value',
            );

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

        return (
            element.closest('.iti') !== null ||
            element.dataset?.controller === 'phone-input' ||
            element.hasAttribute('data-phone-input-country-value')
        );
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

    function isIndeedApplyPhoneInput(element) {
        if (!element || element.type !== 'tel') {
            return false;
        }

        return Boolean(
            element.closest(
                '[data-testid="phone-number-field"], [class*="mosaic-provider-module-apply-contact-info"]',
            ),
        );
    }

    function isTotaljobsGenesisHost(doc = document) {
        return /totaljobs\.com$/i.test(doc?.location?.hostname || '');
    }

    function isTotaljobsGenesisFormInput(element) {
        if (
            !element ||
            !isTotaljobsGenesisHost(element.ownerDocument || document)
        ) {
            return false;
        }

        if (element.type === 'tel' || isTotaljobsGenesisPhoneInput(element)) {
            return false;
        }

        if (element.getAttribute?.('data-genesis-element') === 'FORM_INPUT') {
            return true;
        }

        const testId = element.getAttribute?.('data-testid') || '';

        return /^input-(firstName|lastName|email)-/i.test(testId);
    }

    async function setTotaljobsGenesisFormInputValue(element, value) {
        const stringValue = String(value ?? '').trim();

        if (!stringValue) {
            return false;
        }

        element.focus();
        dispatchPointerClick(element);

        let filled = false;

        if (typeof element.select === 'function') {
            element.select();
        }

        if (typeof document.execCommand === 'function') {
            try {
                filled = document.execCommand('insertText', false, stringValue);
            } catch {
                filled = false;
            }
        }

        if (!filled) {
            setNativeValue(element, '');
            element.dispatchEvent(new Event('input', { bubbles: true }));
            setNativeValue(element, stringValue);
            element.dispatchEvent(
                new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertFromPaste',
                    data: stringValue,
                }),
            );
            filled = valueMatchesAnswer(element.value, stringValue);
        }

        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

        const ok = filled || valueMatchesAnswer(element.value, stringValue);

        if (ok) {
            heuristicsLog(
                'info',
                'apply.totaljobs',
                'Totaljobs genesis text input filled',
                {
                    testId: element.getAttribute?.('data-testid') || null,
                    valuePreview: stringValue.slice(0, 80),
                },
            );
        }

        return ok;
    }

    async function commitTotaljobsGenesisFormState(root = document) {
        const inputs = root.querySelectorAll(
            '[data-genesis-element="FORM_INPUT"]',
        );

        for (const input of inputs) {
            if (!(input instanceof HTMLInputElement)) {
                continue;
            }

            const value = String(input.value || '').trim();

            if (!value) {
                continue;
            }

            if (isTotaljobsGenesisPhoneInput(input)) {
                await setTotaljobsGenesisPhoneInputValue(
                    input,
                    value.startsWith('+') ? value : `+44${value}`,
                );
                continue;
            }

            if (isTotaljobsGenesisFormInput(input)) {
                await setTotaljobsGenesisFormInputValue(input, value);
            }
        }

        const countrySelect = root.querySelector(
            '[data-testid="select-phoneNumber-code"]',
        );

        if (countrySelect instanceof HTMLSelectElement && countrySelect.value) {
            countrySelect.dispatchEvent(new Event('input', { bubbles: true }));
            countrySelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function isSnapshotElementFilled(element, root = document) {
        if (!element) {
            return false;
        }

        const fieldType = element.field_type || 'text';
        let target = null;

        if (element.ref && typeof AutoCVApplyFieldInventory !== 'undefined') {
            const entry = AutoCVApplyFieldInventory.getRefEntry?.(element.ref);

            if (entry?.target && isTargetConnected(entry.target)) {
                target = entry.target;
            }
        }

        if (!target && element.dom) {
            target = resolveTargetFromDom(
                root,
                element.dom,
                fieldType,
                element.dom?.data_field_path || null,
            );
        }

        if (!target) {
            return false;
        }

        if (fieldType === 'checkbox') {
            const checkbox =
                target.type === 'checkbox'
                    ? target
                    : target.querySelector?.('input[type="checkbox"]');

            return Boolean(checkbox?.checked);
        }

        if (fieldType === 'radio') {
            const selection = readNativeInputGroupSelection(
                target.type === 'radio'
                    ? target
                    : target.querySelector?.('input[type="radio"]'),
                'radio',
            );

            return Boolean(selection);
        }

        const actual = readSimpleFieldValue(target, fieldType);

        return Boolean(String(actual ?? '').trim());
    }

    function filterUnfilledRequiredSnapshotElements(elements, root = document) {
        return (elements || []).filter(
            (element) =>
                element?.required && !isSnapshotElementFilled(element, root),
        );
    }

    function isTotaljobsGenesisPhoneInput(element) {
        if (!element || element.type !== 'tel') {
            return false;
        }

        const testId = element.getAttribute?.('data-testid') || '';
        const id = element.id || '';

        return (
            testId === 'input-phoneNumber-main' ||
            id === 'input-main-phoneNumber'
        );
    }

    function getTotaljobsGenesisPhoneCountrySelect(telInput) {
        let scope = telInput?.parentElement || null;

        while (scope && scope !== telInput?.ownerDocument?.body) {
            const select = scope.querySelector?.(
                '[data-testid="select-phoneNumber-code"]',
            );

            if (select) {
                return select;
            }

            scope = scope.parentElement;
        }

        const doc = telInput?.ownerDocument || document;

        return doc.querySelector('[data-testid="select-phoneNumber-code"]');
    }

    async function setTotaljobsGenesisPhoneCountrySelect(
        select,
        dialCodeDigits,
    ) {
        if (!select || !dialCodeDigits) {
            return true;
        }

        const dialValue = `+${dialCodeDigits}`;
        const match = findSelectOptionMatch(
            Array.from(select.options),
            dialValue,
        );

        if (!match) {
            heuristicsLog(
                'warn',
                'apply.phone',
                'Totaljobs country select option not found',
                {
                    dialValue,
                },
            );

            return false;
        }

        if (select.value === match.value) {
            return true;
        }

        select.value = match.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await pauseMs(80);

        return select.value === match.value;
    }

    async function setTotaljobsGenesisPhoneInputValue(element, value) {
        const parts = parseIndeedPhoneParts(value);

        if (!parts.nationalDigits) {
            return false;
        }

        const countrySelect = getTotaljobsGenesisPhoneCountrySelect(element);

        if (countrySelect && parts.dialCodeDigits) {
            const countrySet = await setTotaljobsGenesisPhoneCountrySelect(
                countrySelect,
                parts.dialCodeDigits,
            );

            if (!countrySet) {
                heuristicsLog(
                    'warn',
                    'apply.phone',
                    'Totaljobs country select not set before national fill',
                    {
                        dialCodeDigits: parts.dialCodeDigits,
                    },
                );
            }
        }

        const national = parts.nationalDigits;

        element.focus();
        dispatchPointerClick(element);
        setNativeValue(element, '');
        element.dispatchEvent(new Event('input', { bubbles: true }));

        const filled = fillTextControlInstant(element, national);

        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

        const readbackDigits = normalizePhoneDigits(element.value || '');
        const expectedDigits = normalizePhoneDigits(national);
        const ok =
            filled ||
            readbackDigits === expectedDigits ||
            readbackDigits.endsWith(expectedDigits);

        if (ok) {
            heuristicsLog(
                'info',
                'apply.phone',
                'Totaljobs genesis phone input filled',
                {
                    valuePreview: String(element.value || '').slice(0, 80),
                    dialCodeDigits: parts.dialCodeDigits,
                },
            );
        }

        return ok;
    }

    function getIndeedPhoneCountryCombobox(telInput) {
        const field = telInput?.closest?.('[data-testid="phone-number-field"]');

        return (
            field?.querySelector('[role="combobox"][data-value]') ||
            field?.querySelector(
                '[role="combobox"][aria-haspopup="listbox"]',
            ) ||
            null
        );
    }

    async function setIndeedApplyPhoneCountryCombobox(
        combobox,
        iso,
        dialCodeDigits,
    ) {
        if (!combobox || !iso) {
            return true;
        }

        if (combobox.getAttribute('data-value') === iso) {
            return true;
        }

        const doc = combobox.ownerDocument || document;

        dispatchPointerClick(combobox);
        await sleep(120);

        let option = doc.querySelector(`[data-testid="country-select-${iso}"]`);

        if (!option && dialCodeDigits) {
            const dialDisplay = `+${dialCodeDigits}`;
            option =
                Array.from(
                    doc.querySelectorAll('[data-testid^="country-select-"]'),
                ).find((candidate) =>
                    (candidate.textContent || '').includes(dialDisplay),
                ) || null;
        }

        if (!option) {
            heuristicsLog(
                'warn',
                'apply.phone',
                'Indeed country option not found',
                {
                    iso,
                    dialCodeDigits,
                },
            );

            return false;
        }

        dispatchPointerClick(option);
        option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await sleep(120);

        if (combobox.getAttribute('data-value') !== iso) {
            combobox.setAttribute('data-value', iso);
            const dialSpan = combobox.querySelector('[class*="ew4qyo"]');

            if (dialSpan && dialCodeDigits) {
                dialSpan.textContent = `+${dialCodeDigits}`;
            }

            combobox.dispatchEvent(new Event('input', { bubbles: true }));
            combobox.dispatchEvent(new Event('change', { bubbles: true }));
        }

        return combobox.getAttribute('data-value') === iso;
    }

    function formatIndeedNationalPhoneDigits(digits, iso = '') {
        const normalized = String(digits || '').replace(/\D/g, '');

        // UK Smart Apply validates national digits only. Hyphenated masks like
        // 7837-370669 fail with "Add a valid phone number to continue."
        if (
            iso === 'GB' &&
            normalized.length === 11 &&
            normalized.startsWith('0')
        ) {
            return normalized.slice(1);
        }

        return normalized;
    }

    async function setIndeedApplyPhoneInputValue(element, value) {
        const parts = parseIndeedPhoneParts(value);

        if (!parts.nationalDigits) {
            return false;
        }

        const countryCombobox = getIndeedPhoneCountryCombobox(element);

        if (countryCombobox && parts.iso) {
            const countrySet = await setIndeedApplyPhoneCountryCombobox(
                countryCombobox,
                parts.iso,
                parts.dialCodeDigits,
            );

            if (!countrySet) {
                heuristicsLog(
                    'warn',
                    'apply.phone',
                    'Indeed country combobox not updated before national fill',
                    {
                        iso: parts.iso,
                        dialCodeDigits: parts.dialCodeDigits,
                    },
                );
            }
        }

        const formatted = formatIndeedNationalPhoneDigits(
            parts.nationalDigits,
            parts.iso,
        );

        element.focus();
        dispatchPointerClick(element);

        const commitIndeedPhoneValue = async (candidate) => {
            setNativeValue(element, '');
            element.dispatchEvent(new Event('input', { bubbles: true }));
            setNativeValue(element, candidate);
            element.dispatchEvent(
                new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertFromPaste',
                    data: candidate,
                }),
            );
            element.dispatchEvent(new Event('change', { bubbles: true }));
            await pauseMs(80);
        };

        await commitIndeedPhoneValue(formatted);

        if (
            !valueMatchesAnswer(element.value, formatted) &&
            !valueMatchesAnswer(element.value, parts.nationalDigits)
        ) {
            await fillReactTextControl(element, formatted);
        }

        if (
            !valueMatchesAnswer(element.value, formatted) &&
            !valueMatchesAnswer(element.value, parts.nationalDigits)
        ) {
            await commitIndeedPhoneValue(parts.nationalDigits);
        }

        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

        const readback = element.value || '';
        const ok =
            valueMatchesAnswer(readback, formatted) ||
            valueMatchesAnswer(readback, parts.nationalDigits) ||
            valueMatchesAnswer(readback, value);

        if (ok) {
            heuristicsLog(
                'info',
                'apply.phone',
                'Indeed IPL phone input filled',
                {
                    valuePreview: readback.slice(0, 80),
                    iso: parts.iso,
                    dialCodeDigits: parts.dialCodeDigits,
                },
            );
        }

        return ok;
    }

    function isReactPhoneCountrySelect(element) {
        if (element.tagName?.toLowerCase() !== 'select') {
            return false;
        }

        return (
            element.classList?.contains('PhoneInputCountrySelect') ||
            element.closest('.PhoneInputCountry') !== null ||
            /phone number country/i.test(
                element.getAttribute('aria-label') || '',
            )
        );
    }

    function isReactPhoneNumberInput(element) {
        if (!element || element.type !== 'tel') {
            return false;
        }

        return (
            element.classList?.contains('PhoneInputInput') ||
            element.closest('.PhoneInput') !== null
        );
    }

    function resolveCountryIsoFromE164(e164, countrySelect) {
        if (!countrySelect || !String(e164).trim().startsWith('+')) {
            return null;
        }

        const digits = String(e164).replace(/\D/g, '');
        const options = new Set(
            Array.from(countrySelect.options).map((option) => option.value),
        );

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
        const listboxButton = widget?.querySelector(
            'button[aria-haspopup="listbox"]',
        );
        let fillValue = stringValue;

        if (listboxButton && stringValue.startsWith('+')) {
            const dial = extractDialCodeFromPhoneValue(stringValue);
            const countryAnswer =
                dial === '44'
                    ? 'United Kingdom'
                    : dial
                      ? `+${dial}`
                      : stringValue;

            if (dial) {
                let countrySet = false;
                const countryIso = countrySelect
                    ? resolveCountryIsoFromE164(stringValue, countrySelect)
                    : null;

                if (countrySelect && countryIso) {
                    countrySelect.value = countryIso;
                    countrySelect.dispatchEvent(
                        new Event('input', { bubbles: true }),
                    );
                    countrySelect.dispatchEvent(
                        new Event('change', { bubbles: true }),
                    );
                    await sleep(80);
                    countrySet = true;
                }

                if (!countrySet) {
                    countrySet = await setPhoneCountryListboxValue(
                        listboxButton,
                        countryAnswer,
                    );
                }

                if (!countrySet) {
                    heuristicsLog(
                        'warn',
                        'apply.phone',
                        'Phone country listbox not set before E.164 fill',
                        {
                            countryAnswer,
                            dial,
                        },
                    );
                }

                await sleep(countrySet ? 80 : 0);
                fillValue = stringValue.startsWith('+')
                    ? stringValue
                    : `+${dial}${stringValue.replace(/\D/g, '')}`;
            }
        } else {
            const countryIso = countrySelect
                ? resolveCountryIsoFromE164(stringValue, countrySelect)
                : null;

            if (countrySelect && countryIso) {
                countrySelect.value = countryIso;
                countrySelect.dispatchEvent(
                    new Event('change', { bubbles: true }),
                );
            }
        }

        element.focus();
        dispatchPointerClick(element);

        // Instant fill - char-by-char E.164 into PhoneInput re-parses dial codes mid-type
        // and can flip the country to +7 / Russia.
        const filled = fillTextControlInstant(element, fillValue);
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

        if (filled) {
            heuristicsLog(
                'info',
                'apply.phone',
                'react-phone-number-input filled',
                {
                    valuePreview: fillValue.slice(0, 80),
                    originalPreview: stringValue.slice(0, 80),
                },
            );
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
                element.dispatchEvent(
                    new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        inputType: 'insertFromPaste',
                        data: stringValue,
                    }),
                );
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(
                    new FocusEvent('blur', { bubbles: true }),
                );

                const entered = normalizePhoneDigits(
                    iti.getNumber?.() || element.value,
                );
                const expected = normalizePhoneDigits(stringValue);

                if (entered.length >= Math.min(expected.length, 8)) {
                    heuristicsLog(
                        'info',
                        'apply.phone',
                        'intl-tel-input filled',
                        {
                            valuePreview: stringValue.slice(0, 80),
                            attempt: attempt + 1,
                        },
                    );

                    return true;
                }
            }

            if (attempt === 0) {
                await sleep(40);
            }
        }

        await fillReactTextControl(element, stringValue);

        heuristicsLog(
            'info',
            'apply.phone',
            'intl-tel-input fallback to text fill',
            {
                valuePreview: stringValue.slice(0, 80),
            },
        );

        return valueMatchesAnswer(element.value, stringValue);
    }

    async function clearTextFieldValue(element) {
        if (!element) {
            return false;
        }

        const tag = element.tagName?.toLowerCase();

        if (tag !== 'input' && tag !== 'textarea') {
            return false;
        }

        if (element.type === 'hidden' || element.type === 'file') {
            return false;
        }

        element.focus();
        setNativeValue(element, '');
        element.dispatchEvent(
            new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'deleteContentBackward',
                data: null,
            }),
        );
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();

        return String(element.value || '').trim() === '';
    }

    async function clearFieldValue(element) {
        if (!element) {
            return false;
        }

        if (element.getAttribute?.('role') === 'combobox') {
            return clearComboboxFieldValue(element);
        }

        return clearTextFieldValue(element);
    }

    async function clearComboboxFieldValue(element) {
        if (!element || element.getAttribute?.('role') !== 'combobox') {
            return false;
        }

        const doc = element.ownerDocument || document;

        if (isWorkableSelectCombobox(element)) {
            const root = element.closest('[data-input-type="select"]');
            const hidden = resolveWorkableHiddenSelectInput(root, element);
            const illustrated = root?.querySelector(
                '[data-role="illustrated-input"]',
            );
            const clearButton = root?.querySelector(
                'button[aria-label*="clear" i], button[aria-label*="Clear" i], [data-role="clear"], .clear-button, button[class*="clear"]',
            );

            if (clearButton) {
                dispatchPointerClick(clearButton);
                await pauseMs(80);
            }

            element.focus();
            setNativeValue(element, '');
            element.dispatchEvent(
                new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'deleteContentBackward',
                    data: null,
                }),
            );
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    bubbles: true,
                    cancelable: true,
                }),
            );

            if (hidden) {
                setNativeValue(hidden, '');
                hidden.removeAttribute('value');
                hidden.dispatchEvent(
                    new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        inputType: 'deleteContentBackward',
                        data: null,
                    }),
                );
                hidden.dispatchEvent(new Event('change', { bubbles: true }));
            }

            if (illustrated) {
                illustrated.textContent = '';
                illustrated.removeAttribute('data-value');
            }

            root?.setAttribute('data-open', 'false');
            root?.setAttribute('data-error', 'false');
            root?.removeAttribute('data-value');
            element.setAttribute('aria-expanded', 'false');
            element.blur();

            const remaining = String(
                readReactSelectValue(element) || element.value || '',
            ).trim();
            const hiddenRemaining = String(hidden?.value || '').trim();

            heuristicsLog(
                remaining || hiddenRemaining ? 'warn' : 'info',
                'apply.combobox',
                remaining || hiddenRemaining
                    ? 'Workable combobox clear incomplete'
                    : 'Workable combobox cleared',
                {
                    remainingPreview: remaining.slice(0, 40),
                    hiddenPreview: hiddenRemaining.slice(0, 40),
                },
            );

            // Visible label cleared is enough for sidebar honesty; hidden id may
            // linger until the user picks a real option.
            return !remaining;
        }

        if (isReactSelectComboboxShell(element)) {
            const control = element.closest('.select__control');
            const shell = element.closest('.select-shell, .select__container');
            const singleValue = control?.querySelector(
                '.select__single-value, .select__multi-value__label',
            );
            const placeholder = control?.querySelector('.select__placeholder');
            const requiredInput = shell?.querySelector(
                'input[tabindex="-1"][aria-hidden="true"]',
            );

            singleValue?.remove();

            if (placeholder) {
                placeholder.style.display = '';
            }

            setNativeValue(element, '');
            element.dispatchEvent(new Event('input', { bubbles: true }));

            if (requiredInput && requiredInput !== element) {
                setNativeValue(requiredInput, '');
                requiredInput.dispatchEvent(
                    new Event('input', { bubbles: true }),
                );
                requiredInput.dispatchEvent(
                    new Event('change', { bubbles: true }),
                );
            }

            element.setAttribute('aria-expanded', 'false');
            element.blur();
            closeOpenComboboxMenus(doc);

            return !readReactSelectValue(element);
        }

        setNativeValue(element, '');
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        return !String(element.value || '').trim();
    }

    async function setFieldValue(element, value) {
        if (!element || value === null || value === undefined) {
            heuristicsLog(
                'warn',
                'apply.setFieldValue',
                'setFieldValue skipped - empty',
                {},
            );

            return false;
        }

        if (String(value) === '__CLEAR__') {
            heuristicsLog(
                'info',
                'apply.setFieldValue',
                'Clearing field via sentinel',
                {
                    role: element.getAttribute?.('role'),
                    tag: element.tagName?.toLowerCase(),
                },
            );

            return clearFieldValue(element);
        }

        if (value === '') {
            heuristicsLog(
                'warn',
                'apply.setFieldValue',
                'setFieldValue skipped - empty',
                {},
            );

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

        if (
            element.type === 'tel' &&
            /consent to receiving text|do not consent to receiving text/i.test(
                String(value),
            )
        ) {
            heuristicsLog(
                'warn',
                'apply.setFieldValue',
                'Refusing to write SMS consent text into tel input',
                {
                    valuePreview: String(value).slice(0, 80),
                },
            );

            return false;
        }

        if (role === 'combobox') {
            if (isLinkedInGeoLocationCombobox(element)) {
                const filled = await setLinkedInGeoLocationValue(
                    element,
                    value,
                );

                return filled && verifyFieldApplied(element, 'select', value);
            }

            if (isGreenhousePhoneCountryCombobox(element)) {
                const filled = await setGreenhousePhoneCountryValue(
                    element,
                    value,
                );

                return filled && verifyFieldApplied(element, 'select', value);
            }

            if (isIndeedApplyLocationCombobox(element)) {
                const filled = await setIndeedApplyLocationComboboxValue(
                    element,
                    value,
                );

                return filled && verifyFieldApplied(element, 'select', value);
            }

            if (isIndeedApplyResumeCombobox(element)) {
                const filled = await setIndeedApplyResumeComboboxValue(
                    element,
                    value,
                );

                return filled && verifyFieldApplied(element, 'select', value);
            }

            if (isIndeedApplyQuestionCombobox(element)) {
                const filled = await setIndeedApplyQuestionComboboxValue(
                    element,
                    value,
                );

                return filled && verifyFieldApplied(element, 'select', value);
            }

            const filled = await setAshbyComboboxValue(element, value);

            return filled && verifyFieldApplied(element, 'select', value);
        }

        if (isPhoneCountryListboxButton(element)) {
            const filled = await setPhoneCountryListboxValue(element, value);

            return filled && verifyFieldApplied(element, 'select', value);
        }

        if (isSmartRecruitersPhoneInput(element)) {
            return setSmartRecruitersPhoneValue(element, value);
        }

        if (element.type === 'tel' && isSmartRecruitersPhoneInput(element)) {
            return setSmartRecruitersPhoneValue(element, value);
        }

        if (element.type === 'tel' && isIndeedApplyPhoneInput(element)) {
            return setIndeedApplyPhoneInputValue(element, value);
        }

        if (element.type === 'tel' && isTotaljobsGenesisPhoneInput(element)) {
            return setTotaljobsGenesisPhoneInputValue(element, value);
        }

        if (element.type === 'tel' && isReactPhoneNumberInput(element)) {
            return setReactPhoneNumberInputValue(element, value);
        }

        if (element.type === 'tel' && isIntlTelInput(element)) {
            return setIntlTelInputValue(element, value);
        }

        if (tag === 'select') {
            const options = Array.from(element.options);
            const match = findSelectOptionMatch(options, value);

            if (!match) {
                heuristicsLog(
                    'warn',
                    'apply.setFieldValue',
                    'Select option not found',
                    {
                        valuePreview: String(value).slice(0, 80),
                        optionCount: options.length,
                    },
                );

                return false;
            }

            element.value = match.value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.classList?.remove('fb-dash-form-element__error-field');
            syncChosenSelectUi(element);

            // readSimpleFieldValue returns option label text, so verify against the requested answer
            // (or label), not the raw option value (Softgarden uses "0"/"1" values).
            const optionLabel = (match.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();

            return verifyFieldApplied(element, 'select', optionLabel || value);
        }

        if (element.type === 'checkbox' || element.type === 'radio') {
            return setGroupValue(element, value);
        }

        if (element.type === 'file') {
            heuristicsLog(
                'warn',
                'apply.setFieldValue',
                'setFieldValue skipped - file input cannot be set programmatically',
                {
                    id: element.id || null,
                    name: element.name || null,
                },
            );

            return false;
        }

        if (tag === 'fieldset' || tag === 'div') {
            const choiceInput = element.querySelector(
                'input[type="checkbox"], input[type="radio"]',
            );

            if (choiceInput) {
                return setGroupValue(choiceInput, value);
            }
        }

        if (isLeverLocationInput(element)) {
            return setLeverLocationValue(element, value);
        }

        if (isTotaljobsGenesisFormInput(element) && element.type !== 'tel') {
            return setTotaljobsGenesisFormInputValue(element, value);
        }

        const filled = await fillReactTextControl(element, value);

        heuristicsLog(
            filled ? 'info' : 'warn',
            'apply.setFieldValue',
            filled
                ? 'React text control filled'
                : 'React text control fill did not stick',
            {
                tag,
                valuePreview: String(value).slice(0, 80),
                actualPreview: String(element.value || '').slice(0, 80),
            },
        );

        if (filled) {
            clearValidationState(element);
        }

        return filled;
    }

    /**
     * Query selector across light DOM and open shadow roots (SmartRecruiters
     * oneclick `oc-input` / `spl-*` hosts keep native controls in shadow).
     *
     * @param {ParentNode} root
     * @param {string} selector
     * @returns {Element[]}
     */
    function querySelectorAllDeep(root, selector) {
        if (!root?.querySelectorAll) {
            return [];
        }

        const results = [];
        const seen = new Set();
        const visit = (node) => {
            if (!node?.querySelectorAll) {
                return;
            }

            for (const el of node.querySelectorAll(selector)) {
                if (!seen.has(el)) {
                    seen.add(el);
                    results.push(el);
                }
            }

            for (const el of node.querySelectorAll('*')) {
                if (el.shadowRoot) {
                    visit(el.shadowRoot);
                }
            }
        };

        visit(root);

        return results;
    }

    /**
     * Climb out of open shadow roots to the outermost host in the page DOM.
     *
     * @param {Element} element
     * @returns {Element}
     */
    function outermostShadowHost(element) {
        let current = element;

        while (current) {
            const root = current.getRootNode?.();

            if (root instanceof ShadowRoot && root.host) {
                current = root.host;
                continue;
            }

            break;
        }

        return current;
    }

    function collectFillableElements(root) {
        revealDeferredApplicationForm(root.defaultView?.document || root);

        const nativeControls = querySelectorAllDeep(
            root,
            'input, textarea, select',
        ).filter((element) => {
            if (isAshbyHiddenYesNoInput(element)) {
                return false;
            }

            if (isJobBoardNavSearchInput(element)) {
                return false;
            }

            if (isIndeedApplyComboboxFilterInput(element)) {
                return false;
            }

            if (isGreenhouseHiddenSelectInput(element)) {
                return false;
            }

            if (isWorkableHiddenSelectValueInput(element)) {
                return false;
            }

            if (isWorkableHiddenAddressSubfield(element)) {
                return false;
            }

            if (isChosenSearchInput(element)) {
                return false;
            }

            if (isReactPhoneCountrySelect(element)) {
                return false;
            }

            if (
                isAshbyStyledChoiceInput(element) ||
                isOracleApplyFlowStyledChoiceInput(element)
            ) {
                return true;
            }

            if (isPersonioApplicationFileInput(element)) {
                return true;
            }

            if (isLabeledApplicationFileInput(element)) {
                return true;
            }

            if (isRecruiteeApplicationFormControl(element)) {
                return true;
            }

            if (isLeverDeferredSurveyControl(element)) {
                return true;
            }

            if (isChosenEnhancedSelect(element)) {
                return true;
            }

            return isVisible(element);
        });

        const contentEditableControls = querySelectorAllDeep(
            root,
            '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
        ).filter((element) => {
            if (!isContentEditableField(element) || !isVisible(element)) {
                return false;
            }

            if (
                element.closest(
                    'form, [role="form"], .application--container, .gform_wrapper, .field-wrapper, .formio-form, .wpforms-container, #main-content',
                )
            ) {
                return true;
            }

            const host = outermostShadowHost(element);

            if (
                host?.closest?.(
                    'oc-oneclick-form, oc-personal-information, oc-input, spl-form-field, [class*="application"], [class*="employment"], [class*="job-apply"]',
                )
            ) {
                return true;
            }

            return (
                element.closest(
                    '[class*="application"], [class*="employment"], [class*="job-apply"]',
                ) !== null
            );
        });

        return [...nativeControls, ...contentEditableControls];
    }

    function forEachIframeDocument(callback) {
        callback(document);

        for (const iframe of document.querySelectorAll('iframe')) {
            try {
                const doc =
                    iframe.contentDocument || iframe.contentWindow?.document;

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
                const doc =
                    iframe.contentDocument || iframe.contentWindow?.document;

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

            const labels = inputs
                .map((input) => getFieldLabel(input))
                .join(' ');

            if (
                /email/.test(labels) &&
                (/phone|tel/.test(labels) || /name/.test(labels))
            ) {
                score += 2;
            }

            if (
                /resume|cv|cover letter|linkedin|ia-questions|employer questions/.test(
                    labels,
                )
            ) {
                score += 1;
            }
        });

        return score >= 2;
    }

    function isReedApplyScreeningForm(root = document) {
        try {
            if (!/(?:^|\.)reed\.co\.uk$/i.test(root.location?.hostname || '')) {
                return false;
            }
        } catch {
            return false;
        }

        return Boolean(
            root.querySelector(
                '[data-qa="apply-job-modal"] [data-qa="screening-questions-container"], ' +
                    '[data-qa="apply-job-modal"] [class*="screening-questions_container"], ' +
                    '[data-qa="screening-questions-container"] [id^="question-wrapper-"], ' +
                    '.screening-questions_container__PaYsQ [id^="question-wrapper-"]',
            ),
        );
    }

    function frameHasApplicationForm(root = document) {
        if (isMicro1ApplicationQuestionStep(root)) {
            return true;
        }

        if (isIndeedApplyPage(root)) {
            return (
                collectFillableElements(root).length >= 1 ||
                Boolean(
                    root.querySelector(
                        '[data-testid^="location-fields"], .ia-Questions-item, [data-testid^="input-q_"], [class*="mosaic-provider-module-apply"], #applicant\\.name, [id*="applicant.name"], [id^="input-applicant"]',
                    ),
                )
            );
        }

        if (isReedApplyScreeningForm(root)) {
            return true;
        }

        const inputs = collectFillableElements(root);

        if (inputs.length < 2) {
            return false;
        }

        const labels = inputs.map((input) => getFieldLabel(input)).join(' ');

        return /email/.test(labels) && /phone|tel|name/.test(labels);
    }

    function getFieldType(element) {
        const tag = element.tagName.toLowerCase();

        if (isContentEditableField(element)) {
            return 'textarea';
        }

        if (tag === 'textarea') {
            return 'textarea';
        }

        if (tag === 'select') {
            return 'select';
        }

        if (
            element.getAttribute?.('role') === 'combobox' ||
            isPhoneCountryListboxButton(element)
        ) {
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

        const labels = optionElementsToLabels(Array.from(element.options), 30);

        return labels.length > 0 ? labels : undefined;
    }

    function hasVisibleValidationError(element) {
        if (!element) {
            return false;
        }

        if (element.classList.contains('fb-dash-form-element__error-field')) {
            return true;
        }

        const describedBy = element.getAttribute('aria-describedby');

        if (describedBy) {
            for (const id of describedBy.split(/\s+/)) {
                const node = element.ownerDocument?.getElementById(id);

                if (!node || !isVisible(node) || node.hasAttribute('hidden')) {
                    continue;
                }

                const feedback =
                    node.querySelector?.(
                        '[data-test-form-element-error-messages], .artdeco-inline-feedback--error',
                    ) || node;
                const message = (feedback.textContent || '')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (message.length >= 3) {
                    return true;
                }
            }
        }

        const formElement = element.closest('[data-test-form-element]');
        const errorRoot = formElement?.querySelector(
            '[data-test-form-element-error-messages]:not([hidden])',
        );

        return Boolean(errorRoot && isVisible(errorRoot));
    }

    function isWorkableHiddenSelectCompanion(element) {
        if (!element || element.getAttribute?.('role') === 'combobox') {
            return false;
        }

        if (!element.closest?.('[data-input-type="select"]')) {
            return false;
        }

        return (
            element.getAttribute?.('aria-hidden') === 'true' ||
            element.tabIndex === -1 ||
            element.getAttribute?.('tabindex') === '-1'
        );
    }

    function elementNeedsDraft(element) {
        if (isWorkableInactiveConditionalField(element)) {
            return false;
        }

        // Prefer the visible Workable combobox; opaque companion ids steal the label.
        if (isWorkableHiddenSelectCompanion(element)) {
            return false;
        }

        const styledChoice =
            isAshbyStyledChoiceInput(element) ||
            isOracleApplyFlowStyledChoiceInput(element);
        const recruiteeFormControl = isRecruiteeApplicationFormControl(element);
        const leverSurveyControl = isLeverDeferredSurveyControl(element);
        const chosenSelect = isChosenEnhancedSelect(element);

        if (isSiteSearchChrome(element) || isJobBoardNavSearchInput(element)) {
            return false;
        }

        if (element.type === 'file') {
            return (
                isLabeledApplicationFileInput(element) ||
                isPersonioApplicationFileInput(element)
            );
        }

        if (
            !isVisible(element) &&
            !styledChoice &&
            !recruiteeFormControl &&
            !leverSurveyControl &&
            !chosenSelect
        ) {
            return false;
        }

        if (element.type === 'checkbox' || element.type === 'radio') {
            if (isGroupAnswered(element)) {
                return false;
            }

            return getQuestionLabel(element).length >= 3;
        }

        if (element.tagName?.toLowerCase() === 'select') {
            if (isSelectMeaningfullyFilled(element)) {
                return false;
            }
        } else if (element.getAttribute?.('role') === 'combobox') {
            if (
                (isIndeedApplyQuestionCombobox(element) ||
                    isIndeedApplyResumeCombobox(element)) &&
                isIndeedApplyComboboxFilled(element) &&
                !hasVisibleValidationError(element)
            ) {
                return false;
            }

            const comboboxValue = readReactSelectValue(element);

            if (comboboxValue && !hasVisibleValidationError(element)) {
                return false;
            }
        } else if (element.value?.trim()) {
            if (
                element.type === 'tel' &&
                isPhoneDialCodeOnlyValue(element.value)
            ) {
                // Treat dial-code-only phone widgets as unfilled.
            } else if (isWorkableAddressGeoDefault(element)) {
                // Workable geo-fills "City, Country" without a street address.
            } else if (isMicro1DefaultNumberValue(element)) {
                // micro1 steppers and hourly rate inputs ship with placeholder default "1".
            } else if (/^\$+$/.test(element.value.trim())) {
                // Gravity Forms currency masks often ship with a lone "$".
            } else if (
                element.getAttribute?.('role') === 'combobox' &&
                hasVisibleValidationError(element)
            ) {
                // LinkedIn and similar typeaheads can hold typed text without a valid selection.
            } else if (
                isIndeedApplyPage(element.ownerDocument || document) &&
                isIndeedIdentityField(element)
            ) {
                return getQuestionLabel(element).length >= 2;
            } else {
                return false;
            }
        }

        return getQuestionLabel(element).length >= 3;
    }

    function eachDraftableField(
        root,
        profile,
        settings,
        memo,
        callback,
        options = {},
    ) {
        const includeFilled = options.includeFilled === true;
        const seen = new Set();
        const processedGroups = new Set();
        let id = 0;

        for (const {
            buttons,
            label,
            optionLabels,
            dataFieldPath,
        } of collectAshbyYesNoFields(root)) {
            const identity = draftableIdentityKey(buttons?.[0], label, {
                dataFieldPath,
            });

            if (label.length < 3 || seen.has(identity)) {
                continue;
            }

            if (
                !includeFilled &&
                isAshbyYesNoAnswered(buttons, dataFieldPath, root)
            ) {
                continue;
            }

            seen.add(identity);

            callback(
                {
                    id,
                    label,
                    field_type: 'radio',
                    max_chars: undefined,
                    options: optionLabels,
                },
                buttons,
                buttons,
            );

            id += 1;
        }

        for (const {
            buttons,
            label,
            optionLabels,
        } of collectOracleSelectPillFields(root)) {
            const identity = draftableIdentityKey(buttons?.[0], label);

            if (label.length < 3 || seen.has(identity)) {
                continue;
            }

            if (!includeFilled && isOracleSelectPillAnswered(buttons)) {
                continue;
            }

            seen.add(identity);

            callback(
                {
                    id,
                    label,
                    field_type: 'radio',
                    max_chars: undefined,
                    options: optionLabels,
                },
                buttons,
                buttons,
            );

            id += 1;
        }

        for (const { toggle, label, optionLabels } of collectReedDropdownFields(
            root,
        )) {
            const identity = draftableIdentityKey(toggle, label);

            if (label.length < 3 || seen.has(identity)) {
                continue;
            }

            if (!includeFilled && isReedDropdownAnswered(toggle)) {
                continue;
            }

            seen.add(identity);

            callback(
                {
                    id,
                    label,
                    field_type: 'select',
                    max_chars: undefined,
                    options: optionLabels.length > 0 ? optionLabels : undefined,
                },
                toggle,
            );

            id += 1;
        }

        for (const element of collectFillableElements(root)) {
            if (
                getAshbyFieldEntry(element)?.querySelector('[class*="_yesno_"]')
            ) {
                continue;
            }

            if (element.type === 'radio' || element.type === 'checkbox') {
                const groupName = getGroupName(element);

                if (processedGroups.has(groupName)) {
                    continue;
                }

                processedGroups.add(groupName);

                if (
                    !includeFilled &&
                    !elementNeedsDraft(element, profile, settings, memo)
                ) {
                    continue;
                }

                if (includeFilled && isSiteSearchChrome(element)) {
                    continue;
                }

                const groupRoot = element.closest(
                    '[role="group"], [role="radiogroup"], fieldset',
                );
                const qualificationLabel =
                    getIndeedQualificationQuestionLabel(element);
                const questionLabel = getQuestionLabel(element);
                const radioGroupLabel = getRadiogroupLabel(
                    groupRoot || element,
                );
                const label =
                    qualificationLabel.length >= 3
                        ? qualificationLabel
                        : radioGroupLabel || questionLabel;
                const identity = draftableIdentityKey(element, label, {
                    groupName,
                });
                const labelIdentity = `label:${label}`;

                if (
                    label.length < 3 ||
                    seen.has(identity) ||
                    seen.has(labelIdentity)
                ) {
                    continue;
                }

                seen.add(identity);
                seen.add(labelIdentity);

                const groupInputs = getGroupInputs(element);
                const groupTarget =
                    groupInputs.length > 1 ? groupInputs : element;

                callback(
                    {
                        id,
                        label,
                        field_type:
                            element.type === 'radio' ? 'radio' : 'checkbox',
                        max_chars: undefined,
                        options: getGroupOptions(element),
                    },
                    groupTarget,
                    groupInputs.length > 1 ? groupInputs : null,
                );

                id += 1;

                continue;
            }

            if (
                !includeFilled &&
                !elementNeedsDraft(element, profile, settings, memo)
            ) {
                continue;
            }

            if (includeFilled && isSiteSearchChrome(element)) {
                continue;
            }

            if (isWorkableHiddenSelectCompanion(element)) {
                continue;
            }

            if (
                includeFilled &&
                !isVisible(element) &&
                !isAshbyStyledChoiceInput(element) &&
                !isOracleApplyFlowStyledChoiceInput(element) &&
                !isRecruiteeApplicationFormControl(element) &&
                !isLeverDeferredSurveyControl(element) &&
                !isChosenEnhancedSelect(element) &&
                !isPersonioApplicationFileInput(element) &&
                !isLabeledApplicationFileInput(element)
            ) {
                continue;
            }

            const label = getQuestionLabel(element);
            const identity = draftableIdentityKey(element, label);

            if (label.length < 3 || seen.has(identity)) {
                continue;
            }

            if (isWorkableInactiveConditionalField(element)) {
                continue;
            }

            seen.add(identity);

            callback(
                {
                    id,
                    label,
                    field_type: getFieldType(element),
                    max_chars:
                        element.maxLength > 0 ? element.maxLength : undefined,
                    options: getGroupOptions(element),
                },
                element,
            );

            id += 1;
        }

        for (const {
            combobox,
            label,
            optionLabels,
        } of collectStandaloneComboboxFields(root)) {
            const identity = draftableIdentityKey(combobox, label);

            if (label.length < 3 || seen.has(identity)) {
                continue;
            }

            if (
                !includeFilled &&
                isIndeedApplyComboboxFilled(combobox) &&
                !hasVisibleValidationError(combobox)
            ) {
                continue;
            }

            seen.add(identity);

            callback(
                {
                    id,
                    label,
                    field_type: 'select',
                    max_chars: undefined,
                    options: optionLabels.length > 0 ? optionLabels : undefined,
                },
                combobox,
            );

            id += 1;
        }

        for (const {
            button,
            label,
            optionLabels,
        } of collectPhoneCountrySelectFields(root)) {
            const identity = draftableIdentityKey(button, label);

            if (label.length < 3 || seen.has(identity)) {
                continue;
            }

            seen.add(identity);

            callback(
                {
                    id,
                    label,
                    field_type: 'select',
                    max_chars: undefined,
                    options: optionLabels.length > 0 ? optionLabels : undefined,
                },
                button,
            );

            id += 1;
        }

        for (const { radios, label } of collectRoleRadioGroups(root)) {
            const identity = draftableIdentityKey(radios?.[0], label);
            const labelIdentity = `label:${label}`;
            const optionLabels = getRoleRadioOptions(radios);

            if (
                label.length < 3 ||
                seen.has(identity) ||
                seen.has(labelIdentity) ||
                optionLabels.length < 2
            ) {
                continue;
            }

            if (!includeFilled && isRoleGroupAnswered(radios)) {
                continue;
            }

            seen.add(identity);
            seen.add(labelIdentity);

            callback(
                {
                    id,
                    label,
                    field_type: 'radio',
                    max_chars: undefined,
                    options: optionLabels,
                },
                radios[0],
                radios,
            );

            id += 1;
        }

        for (const { listbox, label, optionLabels } of collectRoleListboxFields(
            root,
        )) {
            const identity = draftableIdentityKey(listbox, label);

            if (label.length < 3 || seen.has(identity)) {
                continue;
            }

            if (!includeFilled && isRoleListboxAnswered(listbox)) {
                continue;
            }

            seen.add(identity);

            callback(
                {
                    id,
                    label,
                    field_type: 'select',
                    max_chars: undefined,
                    options: optionLabels,
                },
                listbox,
            );

            id += 1;
        }

        for (const {
            checkboxes,
            label,
            optionLabels,
        } of collectRoleCheckboxGroups(root)) {
            const identity = draftableIdentityKey(checkboxes?.[0], label);
            const labelIdentity = `label:${label}`;

            if (
                label.length < 3 ||
                seen.has(identity) ||
                seen.has(labelIdentity)
            ) {
                continue;
            }

            if (!includeFilled && isRoleCheckboxGroupAnswered(checkboxes)) {
                continue;
            }

            seen.add(identity);
            seen.add(labelIdentity);

            callback(
                {
                    id,
                    label,
                    field_type: 'checkbox',
                    max_chars: undefined,
                    options: optionLabels,
                },
                checkboxes[0],
                checkboxes,
            );

            id += 1;
        }
    }

    function collectDraftableFields(
        root,
        profile,
        settings,
        memo = {},
        options = {},
    ) {
        const items = [];

        eachDraftableField(
            root,
            profile,
            settings,
            memo,
            (field) => {
                items.push(field);
            },
            options,
        );

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

        for (const {
            buttons,
            label: yesNoLabel,
            dataFieldPath,
        } of collectAshbyYesNoFields(root)) {
            if (!labelsMatch(yesNoLabel, normalizedTarget)) {
                continue;
            }

            if (
                await setAshbyYesNoValue(buttons, answer, {
                    dataFieldPath,
                    root,
                })
            ) {
                return true;
            }
        }

        for (const {
            buttons,
            label: pillLabel,
        } of collectOracleSelectPillFields(root)) {
            if (!labelsMatch(pillLabel, normalizedTarget)) {
                continue;
            }

            if (setOracleSelectPillValue(buttons, answer)) {
                return true;
            }
        }

        for (const { toggle, label: reedLabel } of collectReedDropdownFields(
            root,
        )) {
            if (!labelsMatch(reedLabel, normalizedTarget)) {
                continue;
            }

            if (await setReedDropdownValue(toggle, answer)) {
                return true;
            }
        }

        for (const { radios, label: groupLabel } of collectRoleRadioGroups(
            root,
        )) {
            if (!labelsMatch(groupLabel, normalizedTarget)) {
                continue;
            }

            if (setRoleRadioGroupValue(radios, answer)) {
                return true;
            }
        }

        for (const { listbox, label: listboxLabel } of collectRoleListboxFields(
            root,
        )) {
            if (!labelsMatch(listboxLabel, normalizedTarget)) {
                continue;
            }

            if (setRoleListboxValue(listbox, answer)) {
                return true;
            }
        }

        for (const {
            checkboxes,
            label: checkboxLabel,
        } of collectRoleCheckboxGroups(root)) {
            if (!labelsMatch(checkboxLabel, normalizedTarget)) {
                continue;
            }

            if (setRoleCheckboxGroupValue(checkboxes, answer)) {
                return true;
            }
        }

        for (const {
            combobox,
            label: comboboxLabel,
        } of collectStandaloneComboboxFields(root)) {
            if (!labelsMatch(comboboxLabel, normalizedTarget)) {
                continue;
            }

            if (isIndeedApplyResumeCombobox(combobox)) {
                if (await setIndeedApplyResumeComboboxValue(combobox, answer)) {
                    return true;
                }
            } else if (isIndeedApplyQuestionCombobox(combobox)) {
                if (
                    await setIndeedApplyQuestionComboboxValue(combobox, answer)
                ) {
                    return true;
                }
            } else if (await setAshbyComboboxValue(combobox, answer)) {
                return true;
            }
        }

        for (const {
            button,
            label: countryLabel,
        } of collectPhoneCountrySelectFields(root)) {
            if (!labelsMatch(countryLabel, normalizedTarget)) {
                continue;
            }

            if (await setPhoneCountryListboxValue(button, answer)) {
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

                const groupRoot = element.closest(
                    '[role="radiogroup"], fieldset',
                );
                const groupLabel =
                    getRadiogroupLabel(groupRoot || element) ||
                    getQuestionLabel(element);

                if (
                    !labelsMatch(groupLabel, normalizedTarget) &&
                    !labelsMatch(getQuestionLabel(element), normalizedTarget)
                ) {
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
            for (const field of collectDraftableFields(
                doc,
                profile,
                settings,
                memo,
            )) {
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

    function countDraftableFields(
        root,
        profile,
        settings,
        memo = {},
        options = {},
    ) {
        return collectDraftableFields(root, profile, settings, memo, options)
            .length;
    }

    function resolveAnswerForTarget(target, fieldType, answer) {
        if (fieldType !== 'radio') {
            return answer;
        }

        if (Array.isArray(target)) {
            if (target[0]?.getAttribute?.('role') === 'radio') {
                const native = target[0]?.querySelector?.(
                    'input[type="radio"]',
                );

                return native
                    ? resolveRadioGroupAnswer(native, answer, target)
                    : answer;
            }

            return answer;
        }

        if (target?.type === 'radio') {
            return resolveRadioGroupAnswer(target, answer);
        }

        const native = target?.querySelector?.('input[type="radio"]');

        if (!native) {
            return answer;
        }

        const roleRadios = Array.from(
            target.querySelectorAll?.('[role="radio"]') || [],
        ).filter(isVisible);

        return resolveRadioGroupAnswer(
            native,
            answer,
            roleRadios.length >= 2 ? roleRadios : null,
        );
    }

    async function applyAnswerForTarget(
        root,
        target,
        fieldType,
        answer,
        options = {},
    ) {
        if (!answer || !isTargetConnected(target)) {
            heuristicsLog(
                'warn',
                'apply.ref',
                'applyAnswerForTarget skipped - missing answer or detached target',
                {
                    fieldType,
                    hasTarget: Boolean(target),
                    connected: isTargetConnected(target),
                },
            );

            return false;
        }

        const resolvedAnswer = resolveAnswerForTarget(
            target,
            fieldType,
            answer,
        );

        heuristicsLog('debug', 'apply.ref', 'applyAnswerForTarget', {
            fieldType,
            dataFieldPath: options.data_field_path || null,
            answerPreview: String(resolvedAnswer).slice(0, 80),
            targetRole: Array.isArray(target)
                ? target[0]?.getAttribute?.('role')
                : target?.getAttribute?.('role'),
            targetTag: Array.isArray(target)
                ? target[0]?.tagName
                : target?.tagName,
        });

        if (String(resolvedAnswer) === '__CLEAR__') {
            const clearTarget = Array.isArray(target) ? target[0] : target;

            return clearFieldValue(clearTarget);
        }

        let applied = false;

        if (Array.isArray(target)) {
            if (target[0]?.tagName?.toLowerCase() === 'button') {
                applied = await setAshbyYesNoValue(
                    resolveAshbyYesNoButtons(
                        target,
                        options.data_field_path,
                        root,
                    ),
                    answer,
                    { dataFieldPath: options.data_field_path, root },
                );
            } else if (target[0]?.getAttribute?.('role') === 'checkbox') {
                applied = setRoleCheckboxGroupValue(target, resolvedAnswer);
            } else {
                applied = setRoleRadioGroupValue(target, resolvedAnswer);
            }
        } else if (target?.getAttribute?.('role') === 'listbox') {
            applied = setRoleListboxValue(target, resolvedAnswer);
        } else if (target?.getAttribute?.('role') === 'combobox') {
            if (isGreenhousePhoneCountryCombobox(target)) {
                applied = await setGreenhousePhoneCountryValue(
                    target,
                    resolvedAnswer,
                );
            } else if (isLinkedInGeoLocationCombobox(target)) {
                applied = await setLinkedInGeoLocationValue(
                    target,
                    resolvedAnswer,
                );
            } else if (isIndeedApplyLocationCombobox(target)) {
                applied = await setIndeedApplyLocationComboboxValue(
                    target,
                    resolvedAnswer,
                );
            } else if (isIndeedApplyResumeCombobox(target)) {
                applied = await setIndeedApplyResumeComboboxValue(
                    target,
                    resolvedAnswer,
                );
            } else if (isIndeedApplyQuestionCombobox(target)) {
                applied = await setIndeedApplyQuestionComboboxValue(
                    target,
                    resolvedAnswer,
                );
            } else {
                applied = await setAshbyComboboxValue(target, resolvedAnswer);
            }
        } else if (isPhoneCountryListboxButton(target)) {
            applied = await setPhoneCountryListboxValue(target, resolvedAnswer);
        } else if (isReedDropdownToggle(target) || isReedDropdownRoot(target)) {
            applied = await setReedDropdownValue(target, resolvedAnswer);
        } else if (target?.getAttribute?.('role') === 'radiogroup') {
            applied = setRoleRadioGroupValue(
                Array.from(target.querySelectorAll('[role="radio"]')).filter(
                    isVisible,
                ),
                resolvedAnswer,
            );
        } else if (target?.getAttribute?.('role') === 'radio') {
            const group = target.closest('[role="radiogroup"]');
            const radios = group
                ? Array.from(group.querySelectorAll('[role="radio"]')).filter(
                      isVisible,
                  )
                : [target];
            applied = setRoleRadioGroupValue(radios, resolvedAnswer);
        } else if (target.type === 'radio' || target.type === 'checkbox') {
            applied = setGroupValue(target, resolvedAnswer);
        } else if (
            (fieldType === 'radio' || fieldType === 'checkbox') &&
            target.querySelector?.(`input[type="${fieldType}"]`)
        ) {
            applied = setGroupValue(
                target.querySelector(`input[type="${fieldType}"]`),
                resolvedAnswer,
            );
        } else if (
            fieldType === 'radio' &&
            target.querySelector?.('[role="radio"]')
        ) {
            applied = setRoleRadioGroupValue(
                Array.from(target.querySelectorAll('[role="radio"]')).filter(
                    isVisible,
                ),
                resolvedAnswer,
            );
        } else if (
            fieldType === 'checkbox' &&
            target.querySelector?.('[role="checkbox"]')
        ) {
            applied = setRoleCheckboxGroupValue(
                Array.from(target.querySelectorAll('[role="checkbox"]')).filter(
                    isVisible,
                ),
                resolvedAnswer,
            );
        } else if (isSmartRecruitersPhoneInput(target)) {
            applied = await setSmartRecruitersPhoneValue(
                target,
                resolvedAnswer,
            );
        } else {
            applied = await setFieldValue(target, resolvedAnswer);
        }

        if (!applied) {
            return false;
        }

        if (String(resolvedAnswer) === '__CLEAR__') {
            return applied;
        }

        if (
            Array.isArray(target) &&
            target[0]?.tagName?.toLowerCase() === 'button'
        ) {
            return applied;
        }

        if (isReedDropdownToggle(target) || isReedDropdownRoot(target)) {
            return applied;
        }

        return verifyFieldApplied(target, fieldType, resolvedAnswer, {
            root,
            dataFieldPath: options.data_field_path || null,
        });
    }

    function isQuickDraftEligible(element, root = document) {
        if (!(element instanceof Element)) {
            return false;
        }

        if (
            element.closest(
                '#autocvapply-portal-bar, #autocvapply-quick-draft, [data-autocvapply-ui]',
            )
        ) {
            return false;
        }

        const tag = element.tagName?.toLowerCase();
        const type = (element.type || '').toLowerCase();
        const role = element.getAttribute?.('role');

        if (
            tag !== 'input' &&
            tag !== 'textarea' &&
            tag !== 'select' &&
            role !== 'combobox' &&
            role !== 'listbox'
        ) {
            return false;
        }

        if (
            [
                'hidden',
                'file',
                'password',
                'submit',
                'button',
                'reset',
                'image',
                'search',
            ].includes(type)
        ) {
            return false;
        }

        if (
            element.closest('header, nav, [role="search"]') &&
            !element.closest(
                'form, [role="form"], [class*="application"], [data-field-path]',
            )
        ) {
            return false;
        }

        const identity = [element.name, element.id]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .trim();

        if (/^(search|q|query|s)$/.test(identity)) {
            return false;
        }

        if (!elementNeedsDraft(element)) {
            return false;
        }

        return (
            frameHasApplicationForm(root) ||
            looksLikeApplicationForm() ||
            Boolean(
                element.closest(
                    'form, [role="form"], [class*="application"], [class*="job"], [data-field-path], .ashby-application-form-field-entry',
                ),
            )
        );
    }

    return {
        applyAnswerByLabel,
        applyAnswerByLabelAllFrames,
        applyAnswerForTarget,
        collectAllDraftableFields,
        collectDraftableFields,
        collectStaticComboboxOptionLabels,
        countDraftableFields,
        eachDraftableField,
        forEachIframeDocument,
        harvestLazyComboboxOptionLabels,
        frameHasApplicationForm,
        getChoiceGroupScope,
        getFieldLabel,
        getFieldType,
        getGroupInputs,
        getQuestionLabel,
        isInactiveConditionalField,
        isQuickDraftEligible,
        isTargetConnected,
        looksLikeApplicationForm,
        revealDeferredApplicationForm,
        readAshbyYesNoValueForInput,
        readFieldControlValue: readSimpleFieldValue,
        collectReadableFieldValueControls,
        collectReadableFieldValueControlsAllFrames,
        summarizeReadableFieldValueControls,
        resolveTargetFromDom,
        setFieldValue,
        setGroupValue,
        setRoleRadioGroupValue,
        optionMatchesAnswer,
        scoreComboboxOptionMatch,
        valueMatchesAnswer,
        verifyFieldApplied,
        isSnapshotElementFilled,
        filterUnfilledRequiredSnapshotElements,
        commitTotaljobsGenesisFormState,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyFormHeuristics = AutoCVApplyFormHeuristics;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyFormHeuristics = AutoCVApplyFormHeuristics;
}
