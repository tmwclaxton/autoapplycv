/**
 * LinkedIn Easy Apply contact-info field helpers (content script global).
 */
var AutoCVApplyLinkedInEasyApplyFields = (() => {
    const PLACEHOLDER_OPTION_PATTERN = /^(select an option|choose an option|please select|select\.\.\.|--)$/i;

    const DIAL_CODE_TO_COUNTRY = [
        ['971', 'United Arab Emirates'],
        ['966', 'Saudi Arabia'],
        ['972', 'Israel'],
        ['886', 'Taiwan'],
        ['852', 'Hong Kong'],
        ['353', 'Ireland'],
        ['351', 'Portugal'],
        ['358', 'Finland'],
        ['420', 'Czech Republic'],
        ['421', 'Slovakia'],
        ['44', 'United Kingdom'],
        ['49', 'Germany'],
        ['33', 'France'],
        ['39', 'Italy'],
        ['34', 'Spain'],
        ['61', 'Australia'],
        ['64', 'New Zealand'],
        ['91', 'India'],
        ['81', 'Japan'],
        ['86', 'China'],
        ['55', 'Brazil'],
        ['52', 'Mexico'],
        ['27', 'South Africa'],
        ['65', 'Singapore'],
        ['31', 'Netherlands'],
        ['32', 'Belgium'],
        ['41', 'Switzerland'],
        ['46', 'Sweden'],
        ['47', 'Norway'],
        ['45', 'Denmark'],
        ['48', 'Poland'],
        ['1', 'United States'],
    ];

    function normalize(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function isPlaceholderSelectOption(option) {
        if (!option) {
            return true;
        }

        const text = normalize(option.textContent);
        const value = normalize(option.value);

        return PLACEHOLDER_OPTION_PATTERN.test(text)
            || PLACEHOLDER_OPTION_PATTERN.test(value)
            || value === '';
    }

    function isSelectElement(element) {
        return element?.tagName?.toLowerCase() === 'select';
    }

    function isTextInputElement(element) {
        return element?.tagName?.toLowerCase() === 'input' && element.type !== 'hidden';
    }

    function isSelectPlaceholder(select) {
        if (!isSelectElement(select)) {
            return true;
        }

        const selected = select.selectedOptions?.[0] || select.options?.[select.selectedIndex];

        return isPlaceholderSelectOption(selected);
    }

    function readProfileEmail(profileData) {
        return normalize(
            profileData?.user?.email
            || profileData?.profile?.email
            || '',
        );
    }

    function readProfilePhone(profileData) {
        const raw = profileData?.profile?.phone || '';
        const settingsCode = normalize(
            profileData?.application_settings?.phone_country_code
            || profileData?.application_settings?.phoneCountryCode
            || '',
        );
        const normalized = String(raw).replace(/\s/g, '');

        if (!normalized) {
            return { e164: '', dialCode: settingsCode, nationalNumber: '' };
        }

        if (normalized.startsWith('+')) {
            const digits = normalized.replace(/\D/g, '');
            const dialCode = resolveDialCodeFromDigits(digits) || settingsCode;
            const dialDigits = dialCode.replace(/\D/g, '');
            let nationalDigits = digits;

            if (dialDigits && digits.startsWith(dialDigits)) {
                nationalDigits = digits.slice(dialDigits.length);
            }

            return {
                e164: `+${digits}`,
                dialCode: dialCode.startsWith('+') ? dialCode : `+${dialCode}`,
                nationalNumber: nationalDigits.replace(/^0+/, ''),
            };
        }

        const dialCode = settingsCode.startsWith('+') ? settingsCode : (settingsCode ? `+${settingsCode}` : '+44');
        const dialDigits = dialCode.replace(/\D/g, '');
        const nationalDigits = normalized.replace(/\D/g, '').replace(/^0+/, '');

        return {
            e164: dialDigits ? `+${dialDigits}${nationalDigits}` : nationalDigits,
            dialCode,
            nationalNumber: nationalDigits,
        };
    }

    function resolveDialCodeFromDigits(digits) {
        for (const [code] of DIAL_CODE_TO_COUNTRY) {
            if (digits.startsWith(code)) {
                return `+${code}`;
            }
        }

        return '';
    }

    function resolveDefaultDialCode(profileData) {
        const phone = readProfilePhone(profileData);

        if (phone.dialCode) {
            return phone.dialCode;
        }

        const country = normalize(profileData?.profile?.country || profileData?.country || '').toLowerCase();

        if (country.includes('united kingdom') || country === 'uk' || country === 'gb') {
            return '+44';
        }

        if (country.includes('united states') || country === 'us' || country === 'usa') {
            return '+1';
        }

        return '+44';
    }

    function escapeSelectorValue(value) {
        if (typeof CSS !== 'undefined' && CSS.escape) {
            return CSS.escape(value);
        }

        return String(value).replace(/"/g, '\\"');
    }

    function findSelectByLabel(modal, labelPattern) {
        for (const label of modal.querySelectorAll('[data-test-text-entity-list-form-title], .fb-dash-form-element__label, label')) {
            const text = normalize(label.textContent);

            if (!labelPattern.test(text)) {
                continue;
            }

            const container = label.closest('[data-test-form-element], [data-test-text-entity-list-form-component], .fb-dash-form-element');

            if (!container) {
                continue;
            }

            const select = container.querySelector('select[data-test-text-entity-list-form-select], select.fb-dash-form-element__select-dropdown');

            if (isSelectElement(select)) {
                return select;
            }
        }

        return null;
    }

    function findInputByLabel(modal, labelPattern) {
        for (const label of modal.querySelectorAll('label.artdeco-text-input--label, .fb-dash-form-element__label, label')) {
            const text = normalize(label.textContent);

            if (!labelPattern.test(text)) {
                continue;
            }

            const forId = label.getAttribute('for');

            if (forId) {
                const input = modal.querySelector(`#${escapeSelectorValue(forId)}`);

                if (isTextInputElement(input)) {
                    return input;
                }
            }

            const container = label.closest('[data-test-single-line-text-form-component], [data-test-form-element], .fb-dash-form-element');
            const input = container?.querySelector('input[type="text"], input[type="tel"], input:not([type="hidden"])');

            if (isTextInputElement(input)) {
                return input;
            }
        }

        return null;
    }

    function matchEmailOption(options, email) {
        const normalizedEmail = email.toLowerCase();

        if (!normalizedEmail) {
            return null;
        }

        const validOptions = options.filter((option) => !isPlaceholderSelectOption(option));

        return validOptions.find((option) => {
            const value = normalize(option.value).toLowerCase();
            const text = normalize(option.textContent).toLowerCase();

            return value === normalizedEmail
                || text === normalizedEmail
                || value.includes(normalizedEmail)
                || normalizedEmail.includes(value);
        }) || null;
    }

    function matchCountryOption(options, dialCode) {
        const normalizedDial = dialCode.replace(/\s/g, '');
        const dialDigits = normalizedDial.replace(/\D/g, '');

        if (!dialDigits) {
            return null;
        }

        const validOptions = options.filter((option) => !isPlaceholderSelectOption(option));
        const dialPattern = new RegExp(`\\(\\+${dialDigits}\\)|\\+${dialDigits}\\b`);

        return validOptions.find((option) => {
            const value = normalize(option.value);
            const text = normalize(option.textContent);

            return dialPattern.test(value) || dialPattern.test(text);
        }) || null;
    }

    function clearFieldErrorMarkers(control) {
        control.classList.remove('fb-dash-form-element__error-field');

        const describedBy = control.getAttribute('aria-describedby');

        if (!describedBy) {
            return;
        }

        for (const id of describedBy.split(/\s+/)) {
            const errorRoot = control.ownerDocument?.getElementById(id);

            if (!errorRoot) {
                continue;
            }

            for (const node of errorRoot.querySelectorAll('[data-test-form-element-error-messages], .artdeco-inline-feedback--error')) {
                node.style.display = 'none';
                node.setAttribute('hidden', 'hidden');
            }
        }
    }

    function dispatchBubbledEvent(element, type) {
        const view = element.ownerDocument?.defaultView || window;
        const EventConstructor = view.Event || Event;

        element.dispatchEvent(new EventConstructor(type, { bubbles: true }));
    }

    function setSelectOption(select, option) {
        select.value = option.value;
        dispatchBubbledEvent(select, 'input');
        dispatchBubbledEvent(select, 'change');
        clearFieldErrorMarkers(select);

        return select.value === option.value;
    }

    function setTextInputValue(input, value) {
        const stringValue = String(value || '');

        if (!stringValue) {
            return false;
        }

        const view = input.ownerDocument?.defaultView || window;
        const prototype = view.HTMLInputElement?.prototype;
        const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'value') : null;

        if (descriptor?.set) {
            descriptor.set.call(input, stringValue);
        } else {
            input.value = stringValue;
        }

        dispatchBubbledEvent(input, 'input');
        dispatchBubbledEvent(input, 'change');
        clearFieldErrorMarkers(input);

        return normalize(input.value) === normalize(stringValue);
    }

    function findLocationTypeaheadInput(modal) {
        const byPattern = modal.querySelector('input[role="combobox"][id*="location-GEO-LOCATION"]');

        if (byPattern) {
            return byPattern;
        }

        return findInputByLabel(modal, /location\s*\(\s*city\s*\)/i);
    }

    function readProfileLocation(profileData) {
        const city = normalize(profileData?.profile?.city || '');
        const country = normalize(profileData?.profile?.country || '');
        const location = normalize(profileData?.profile?.location || '');

        if (location) {
            return location;
        }

        const parts = [city, country].filter(Boolean);

        return parts.join(', ');
    }

    function locationTypeaheadNeedsFill(input) {
        if (!input) {
            return false;
        }

        const formElement = input.closest('[data-test-form-element]');
        const hasVisibleError = Boolean(formElement?.querySelector('[data-test-form-element-error-messages]:not([hidden])'));

        if (hasVisibleError || input.classList.contains('fb-dash-form-element__error-field')) {
            return true;
        }

        return !normalize(input.value);
    }

    async function fillLocationTypeahead(modal, profileData) {
        const input = findLocationTypeaheadInput(modal);

        if (!input || !locationTypeaheadNeedsFill(input)) {
            return Boolean(input && !locationTypeaheadNeedsFill(input));
        }

        const locationValue = readProfileLocation(profileData);

        if (!locationValue) {
            return false;
        }

        if (typeof AutoCVApplyFormHeuristics !== 'undefined') {
            return AutoCVApplyFormHeuristics.applyAnswerForTarget(
                modal.ownerDocument || document,
                input,
                'select',
                locationValue,
                { root: modal.ownerDocument || document },
            );
        }

        return setTextInputValue(input, locationValue.split(',')[0].trim());
    }

    function fillEmailSelect(modal, profileData) {
        const select = findSelectByLabel(modal, /\bemail\b/i);

        if (!select || !isSelectPlaceholder(select)) {
            return Boolean(select && !isSelectPlaceholder(select));
        }

        const email = readProfileEmail(profileData);
        const options = Array.from(select.options);
        const match = matchEmailOption(options, email)
            || options.find((option) => !isPlaceholderSelectOption(option));

        if (!match) {
            return false;
        }

        return setSelectOption(select, match);
    }

    function fillPhoneCountrySelect(modal, profileData) {
        const select = findSelectByLabel(modal, /phone\s+country\s+code|country\s+code/i);

        if (!select || !isSelectPlaceholder(select)) {
            return Boolean(select && !isSelectPlaceholder(select));
        }

        const phone = readProfilePhone(profileData);
        const dialCode = phone.dialCode || resolveDefaultDialCode(profileData);
        const options = Array.from(select.options);
        const match = matchCountryOption(options, dialCode);

        if (!match) {
            return false;
        }

        return setSelectOption(select, match);
    }

    function fillMobilePhoneInput(modal, profileData) {
        const input = findInputByLabel(modal, /mobile\s+phone|phone\s+number/i);

        if (!input) {
            return false;
        }

        if (normalize(input.value)) {
            return true;
        }

        const phone = readProfilePhone(profileData);

        return setTextInputValue(input, phone.nationalNumber);
    }

    const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    function isContactInfoStep(modal) {
        if (!modal) {
            return false;
        }

        const sectionHeading = modal.querySelector(
            '.jobs-easy-apply-form-section__title, form h3.t-bold, form h3, .ph5 h3.t-bold, .ph5 h3',
        );
        const heading = normalize(sectionHeading?.textContent || modal.querySelector('h3')?.textContent || '');

        if (/contact info/i.test(heading)) {
            return true;
        }

        return Boolean(
            findSelectByLabel(modal, /\bemail\b/i)
            || findInputByLabel(modal, /mobile\s+phone/i),
        );
    }

    const RESUME_FILE_EXTENSION_PATTERN = /\.(?:pdf|docx?|rtf|odt|pages|txt)\b/i;
    const RESUME_DATE_LINE_PATTERN = /\b(?:uploaded|last used)\s+(?:on\s+)?(?:\d|[a-z]{3,9}\.?\s+\d)/i;
    const RESUME_BADGE_PATTERN = /^(?:pdf|docx?|rtf|odt|pages|txt)$/i;
    const RESUME_MONTHS = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
    };

    function readLegacyResumeHeading(modal) {
        const sectionHeading = modal.querySelector(
            '.jobs-easy-apply-form-section__title, form h3.t-bold, form h3, .ph5 h3.t-bold, .ph5 h3',
        );

        return normalize(sectionHeading?.textContent || modal.querySelector('h3')?.textContent || '');
    }

    function looksLikeResumeOptionText(text) {
        const value = normalize(text);

        return value.length > 0
            && value.length <= 300
            && (RESUME_FILE_EXTENSION_PATTERN.test(value) || RESUME_DATE_LINE_PATTERN.test(value));
    }

    function isHiddenResumeNode(node) {
        return Boolean(node?.closest?.('[hidden], [aria-hidden="true"]'));
    }

    /**
     * Smallest ancestor of a bare radio input (no [role=radio] host) that wraps
     * only this radio, i.e. the visible option row.
     */
    function findRadioRowHost(input) {
        let node = input.parentElement;
        let best = null;

        for (let depth = 0; node && depth < 6; depth += 1) {
            if (node.querySelectorAll('input[type="radio"]').length !== 1) {
                break;
            }

            best = node;

            if (looksLikeResumeOptionText(node.textContent)) {
                return node;
            }

            node = node.parentElement;
        }

        return best;
    }

    function readResumeOptionFileName(host) {
        if (!(host instanceof HTMLElement)) {
            return '';
        }

        const explicit = normalize(
            host.querySelector('.jobs-document-upload-redesign-card__file-name')?.textContent || '',
        );

        if (explicit) {
            return explicit;
        }

        for (const leaf of host.querySelectorAll('h3, h4, p, span, div, a, strong')) {
            if (leaf.childElementCount > 0) {
                continue;
            }

            const text = normalize(leaf.textContent);

            if (
                text
                && text.length <= 200
                && RESUME_FILE_EXTENSION_PATTERN.test(text)
                && !RESUME_DATE_LINE_PATTERN.test(text)
                && !RESUME_BADGE_PATTERN.test(text)
                && !/^(?:download|select|deselect|remove|delete)\b/i.test(text)
            ) {
                return text;
            }
        }

        const flat = normalize(host.textContent).replace(/^(?:pdf|docx?|rtf|odt|pages|txt)\s+/i, '');
        const match = flat.match(/^(.*?\.(?:pdf|docx?|rtf|odt|pages|txt))(?:\s*\(\d+\))?\b/i);

        return match ? normalize(match[1]) : '';
    }

    function readResumeOptionDateParts(text, kind) {
        const pattern = kind === 'uploaded'
            ? /\buploaded\s+(?:on\s+)?([^·|]+)/i
            : /\blast used\s+(?:on\s+)?([^·|]+)/i;
        const match = normalize(text).match(pattern);

        if (!match) {
            return null;
        }

        const raw = normalize(match[1]);
        const numeric = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);

        if (numeric) {
            let year = Number(numeric[3]);

            if (year < 100) {
                year += 2000;
            }

            return { kind: 'numeric', a: Number(numeric[1]), b: Number(numeric[2]), year };
        }

        const monthFirst = raw.match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/i);

        if (monthFirst) {
            const month = RESUME_MONTHS[monthFirst[1].slice(0, 4).toLowerCase()]
                ?? RESUME_MONTHS[monthFirst[1].slice(0, 3).toLowerCase()];

            if (month !== undefined) {
                return { kind: 'named', month, day: Number(monthFirst[2]), year: Number(monthFirst[3]) };
            }
        }

        const dayFirst = raw.match(/^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})\b/i);

        if (dayFirst) {
            const month = RESUME_MONTHS[dayFirst[2].slice(0, 4).toLowerCase()]
                ?? RESUME_MONTHS[dayFirst[2].slice(0, 3).toLowerCase()];

            if (month !== undefined) {
                return { kind: 'named', month, day: Number(dayFirst[1]), year: Number(dayFirst[3]) };
            }
        }

        return null;
    }

    function resumeDatePartsToTime(parts, dayFirst) {
        if (!parts) {
            return null;
        }

        let month;
        let day;

        if (parts.kind === 'named') {
            month = parts.month;
            day = parts.day;
        } else if (parts.a > 12 && parts.b <= 12) {
            day = parts.a;
            month = parts.b - 1;
        } else if (parts.b > 12 && parts.a <= 12) {
            month = parts.a - 1;
            day = parts.b;
        } else if (dayFirst) {
            day = parts.a;
            month = parts.b - 1;
        } else {
            month = parts.a - 1;
            day = parts.b;
        }

        if (month < 0 || month > 11 || day < 1 || day > 31) {
            return null;
        }

        return Date.UTC(parts.year, month, day);
    }

    /**
     * Numeric "Uploaded on 3/10/2026" is ambiguous. Infer the order from any
     * unambiguous date on the same picker, else from the page language
     * (LinkedIn en/en-US renders M/D/YYYY).
     */
    function inferResumeDayFirst(modal, partsList) {
        for (const parts of partsList) {
            if (parts?.kind !== 'numeric') {
                continue;
            }

            if (parts.a > 12 && parts.b <= 12) {
                return true;
            }

            if (parts.b > 12 && parts.a <= 12) {
                return false;
            }
        }

        const lang = String(modal?.ownerDocument?.documentElement?.getAttribute('lang') || '').toLowerCase();

        if (!lang || lang === 'en' || /^en-(?:us|ca|ph)\b/.test(lang)) {
            return false;
        }

        return true;
    }

    function isResumeOptionSelected(option) {
        if (!option) {
            return false;
        }

        if (option.kind === 'ember') {
            return option.host.classList.contains('jobs-document-upload-redesign-card__container--selected')
                || Boolean(option.input?.checked);
        }

        if (option.input) {
            return Boolean(option.input.checked);
        }

        return option.host.getAttribute('aria-checked') === 'true';
    }

    /**
     * Every CV choice on LinkedIn's resume picker: legacy Ember cards
     * (.jobs-document-upload-redesign-card__container) or the 2026 React SDUI
     * <fieldset role="radiogroup"> of <div role="radio"> cards whose text is
     * "PDF <file name> Uploaded on M/D/YYYY".
     */
    function listResumeOptions(modal) {
        if (!modal) {
            return [];
        }

        const raw = [];
        const emberCards = [...modal.querySelectorAll('.jobs-document-upload-redesign-card__container')];

        if (emberCards.length > 0) {
            for (const host of emberCards) {
                raw.push({ host, input: host.querySelector('input[type="radio"]'), kind: 'ember' });
            }
        } else {
            const seen = new Set();

            for (const host of modal.querySelectorAll('[role="radio"]')) {
                if (!looksLikeResumeOptionText(host.textContent) || seen.has(host)) {
                    continue;
                }

                seen.add(host);
                raw.push({ host, input: host.querySelector('input[type="radio"]'), kind: 'sdui' });
            }

            for (const input of modal.querySelectorAll('input[type="radio"]')) {
                if (input.closest('[role="radio"]')) {
                    continue;
                }

                const host = findRadioRowHost(input);

                if (!host || seen.has(host) || !looksLikeResumeOptionText(host.textContent)) {
                    continue;
                }

                seen.add(host);
                raw.push({ host, input, kind: 'sdui' });
            }
        }

        const visible = raw.filter((entry) => !isHiddenResumeNode(entry.host));
        const withParts = visible.map((entry) => {
            const text = normalize(entry.host.textContent);

            return {
                ...entry,
                text,
                uploadedParts: readResumeOptionDateParts(text, 'uploaded'),
                lastUsedParts: readResumeOptionDateParts(text, 'last used'),
            };
        });
        const dayFirst = inferResumeDayFirst(
            modal,
            withParts.flatMap((entry) => [entry.uploadedParts, entry.lastUsedParts]),
        );

        return withParts.map((entry, index) => {
            const fileName = readResumeOptionFileName(entry.host);
            const option = {
                host: entry.host,
                input: entry.input instanceof HTMLInputElement ? entry.input : null,
                kind: entry.kind,
                index,
                fileName,
                label: fileName || readResumeCardLabel(entry.host),
                uploadedAt: resumeDatePartsToTime(entry.uploadedParts, dayFirst),
                lastUsedAt: resumeDatePartsToTime(entry.lastUsedParts, dayFirst),
            };

            option.selected = isResumeOptionSelected(option);

            return option;
        });
    }

    /** Compare CV file names ignoring case, extensions, "(1)" copies and punctuation. */
    function resumeNameKey(name) {
        return String(name || '')
            .toLowerCase()
            .replace(/\.(?:pdf|docx?|rtf|odt|pages|txt)\b/g, '')
            .replace(/\(\d+\)/g, '')
            .replace(/[^a-z0-9]+/g, '');
    }

    function pickNewestResumeOption(options, dateKey) {
        const dated = options.filter((option) => Number.isFinite(option[dateKey]));

        if (dated.length === 0) {
            return null;
        }

        return [...dated].sort((a, b) => {
            if (b[dateKey] !== a[dateKey]) {
                return b[dateKey] - a[dateKey];
            }

            if (a.selected !== b.selected) {
                return a.selected ? -1 : 1;
            }

            return a.index - b.index;
        })[0];
    }

    /**
     * Which LinkedIn resume to use: the user's default AutoCVApply CV (matched by
     * file name), else the most recently uploaded card, else the most recently
     * used card, else whatever LinkedIn already selected, else the first listed.
     * "Uploaded on" wins over "Last used on": an older CV can carry a newer
     * last-used date precisely because it was picked by mistake before.
     *
     * @returns {{ option: object, reason: string } | null}
     */
    function chooseResumeOption(options, { preferredResumeNames = [] } = {}) {
        if (!Array.isArray(options) || options.length === 0) {
            return null;
        }

        const preferredKeys = preferredResumeNames
            .map((name) => resumeNameKey(name))
            .filter((key) => key.length >= 3);

        if (preferredKeys.length > 0) {
            const matches = options.filter((option) => {
                const key = resumeNameKey(option.fileName || option.label);

                return key && preferredKeys.includes(key);
            });

            if (matches.length > 0) {
                const option = pickNewestResumeOption(matches, 'uploadedAt')
                    || matches.find((entry) => entry.selected)
                    || matches[0];

                return { option, reason: 'default-cv' };
            }
        }

        const newestUploaded = pickNewestResumeOption(options, 'uploadedAt');

        if (newestUploaded) {
            return { option: newestUploaded, reason: 'most-recent-upload' };
        }

        const newestUsed = pickNewestResumeOption(options, 'lastUsedAt');

        if (newestUsed) {
            return { option: newestUsed, reason: 'most-recent-used' };
        }

        const selected = options.find((option) => option.selected);

        if (selected) {
            return { option: selected, reason: 'already-selected' };
        }

        return { option: options[0], reason: 'first-listed' };
    }

    function findLinkedInResumeFileInput(modal) {
        if (!modal) {
            return null;
        }

        const legacy = modal.querySelector('input[type="file"][id*="upload-resume" i]:not([disabled])')
            || modal.querySelector('.js-jobs-document-upload__container input[type="file"]:not([disabled])')
            || modal.querySelector('input[type="file"][name="file"]:not([disabled])');

        if (legacy) {
            return legacy;
        }

        // SDUI: a bare file input next to an "Upload resume" control. Skip cover
        // letter uploads.
        for (const input of modal.querySelectorAll('input[type="file"]:not([disabled])')) {
            const attrs = `${input.id || ''} ${input.name || ''} ${input.getAttribute('aria-label') || ''}`;
            let context = '';
            let node = input.parentElement;

            for (let depth = 0; node && depth < 4 && !context; depth += 1) {
                const text = normalize(node.textContent);

                if (text) {
                    context = text.slice(0, 200);
                }

                node = node.parentElement;
            }

            const haystack = `${attrs} ${context}`;

            if (/cover[\s_-]*letter/i.test(haystack) && !/\bresume\b|\bcv\b/i.test(attrs)) {
                continue;
            }

            if (/\bresume\b|\bcv\b|r[eé]sum[eé]/i.test(haystack)) {
                return input;
            }
        }

        return null;
    }

    function isResumeStep(modal) {
        if (!modal) {
            return false;
        }

        const heading = readLegacyResumeHeading(modal);

        if (/^resume$/i.test(heading) || /\bresume\b/i.test(heading)) {
            return true;
        }

        if (
            modal.querySelector('.jobs-document-upload-redesign-card__container')
            || modal.querySelector('input[type="file"][id*="upload-resume" i]')
            || modal.querySelector('.jobs-document-upload__upload-button')
        ) {
            return true;
        }

        // SDUI has no h3 / legacy classes: the step is a resume step when it lists
        // CV cards or offers a resume upload input.
        return listResumeOptions(modal).length > 0 || Boolean(findLinkedInResumeFileInput(modal));
    }

    function hasSelectedResume(modal) {
        if (!modal) {
            return false;
        }

        if (modal.querySelector('.jobs-document-upload-redesign-card__container--selected')) {
            return true;
        }

        const checkedRadio = modal.querySelector(
            '.jobs-document-upload-redesign-card__container input[type="radio"]:checked',
        );

        if (checkedRadio) {
            return true;
        }

        return listResumeOptions(modal).some((option) => option.selected);
    }

    function readResumeCardLabel(card) {
        if (!(card instanceof HTMLElement)) {
            return '';
        }

        const fileName = normalize(
            card.querySelector(
                '.jobs-document-upload-redesign-card__file-name, .jobs-document-upload-redesign-card__title, h3',
            )?.textContent
            || '',
        );

        if (fileName) {
            return fileName;
        }

        const ariaLabel = normalize(card.getAttribute('aria-label') || '');

        // LinkedIn uses generic toggle labels ("Selected", "Select this resume") that
        // must not win over the visible file name for ranking.
        if (ariaLabel && !/^(selected|select this resume|deselect)$/i.test(ariaLabel)) {
            return ariaLabel;
        }

        return normalize(card.textContent || '');
    }

    function scoreResumeCard(card, preferredNames = []) {
        const label = readResumeCardLabel(card).toLowerCase();
        const labelKey = resumeNameKey(readResumeOptionFileName(card) || label);
        let score = 0;

        for (const rawName of preferredNames) {
            const fileName = String(rawName || '').trim().toLowerCase();

            if (!fileName) {
                continue;
            }

            const baseName = fileName.replace(/\.[^.]+$/, '');

            if (
                (labelKey && labelKey === resumeNameKey(fileName))
                || label.includes(fileName)
                || (baseName && label.includes(baseName))
            ) {
                score += 20;
            }
        }

        if (/autocvapply|auto\s*cv\s*apply/i.test(label)) {
            score += 12;
        }

        if (/\.pdf\b/i.test(label)) {
            score += 3;
        }

        if (/linkedin|profile/i.test(label) && !/autocvapply/i.test(label)) {
            score -= 8;
        }

        if (/updated|recent|today|yesterday|\b20\d{2}\b/i.test(label)) {
            score += 1;
        }

        return score;
    }

    function listResumeCards(modal) {
        return listResumeOptions(modal).map((option) => option.host);
    }

    /**
     * LinkedIn collapses older resumes behind "Show N more resumes". Expand so ranking
     * can see AutoCVApply / preferred-name cards that are not in the initial two.
     *
     * @param {Element} modal
     * @returns {Promise<boolean>} true when at least one expand click ran
     */
    async function expandCollapsedResumeCards(modal) {
        if (!modal) {
            return false;
        }

        let expanded = false;

        for (let attempt = 0; attempt < 4; attempt += 1) {
            const button = [...modal.querySelectorAll('button')].find((node) => {
                const label = normalize(
                    node.getAttribute('aria-label') || node.textContent || '',
                );

                return /show\s+(?:\d+\s+)?more\s+(?:resumes?|documents?|files?)/i.test(label);
            });

            if (!(button instanceof HTMLElement) || button.disabled) {
                break;
            }

            button.click();
            expanded = true;
            await sleep(250);
        }

        return expanded;
    }

    /**
     * The card to click for the user's default / newest CV, or null when that card
     * is already selected (or there are no cards).
     */
    function findResumeCardToSelect(modal, options = {}) {
        if (!modal) {
            return null;
        }

        const choice = chooseResumeOption(listResumeOptions(modal), {
            preferredResumeNames: Array.isArray(options.preferredResumeNames)
                ? options.preferredResumeNames
                : [],
        });

        if (!choice || choice.option.selected) {
            return null;
        }

        return choice.option.host;
    }

    function clickResumeCard(card) {
        if (!(card instanceof HTMLElement)) {
            return false;
        }

        const radio = card.querySelector('input[type="radio"]');
        const label = card.querySelector('label[for]')
            || card.querySelector('.jobs-document-upload-redesign-card__toggle-label');

        if (radio instanceof HTMLInputElement) {
            radio.checked = true;
            dispatchBubbledEvent(radio, 'input');
            dispatchBubbledEvent(radio, 'change');
        }

        if (label instanceof HTMLElement) {
            label.click();
        }

        card.click();

        return true;
    }

    /**
     * SDUI cards are React-controlled radios: a real click on the input lets React
     * see the change (assigning .checked first would make React ignore it).
     */
    function clickResumeOption(option) {
        if (!option) {
            return false;
        }

        if (option.kind === 'ember') {
            return clickResumeCard(option.host);
        }

        if (option.input) {
            option.input.click();

            if (option.input.checked) {
                return true;
            }
        }

        const label = option.host.querySelector('label[for]');

        if (label instanceof HTMLElement) {
            label.click();

            if (option.input?.checked) {
                return true;
            }
        }

        option.host.click();

        return true;
    }

    async function attachCvToFileInput(fileInput, getCvDocument) {
        if (!(fileInput instanceof HTMLInputElement) || typeof getCvDocument !== 'function') {
            return false;
        }

        if (fileInput.files?.length > 0 || fileInput.value) {
            return true;
        }

        const result = await getCvDocument();
        const fetchImpl = typeof fetch === 'function' ? fetch : null;

        if (!fetchImpl || !result?.base64) {
            return false;
        }

        const response = await fetchImpl(result.base64);
        const blob = await response.blob();
        const file = new File([blob], result.fileName || 'cv.pdf', {
            type: result.mimeType || blob.type || 'application/pdf',
        });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        const view = fileInput.ownerDocument?.defaultView || window;
        const prototype = view.HTMLInputElement?.prototype;
        const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'files') : null;

        if (descriptor?.set) {
            descriptor.set.call(fileInput, dataTransfer.files);
        } else {
            fileInput.files = dataTransfer.files;
        }

        dispatchBubbledEvent(fileInput, 'input');
        dispatchBubbledEvent(fileInput, 'change');

        return true;
    }

    async function fillResumeStep(modal, options = {}) {
        if (!modal || !isResumeStep(modal)) {
            return { filled: 0, success: true, skipped: true, resumeSelected: false };
        }

        /** @type {string[]} */
        let preferredResumeNames = Array.isArray(options.preferredResumeNames)
            ? options.preferredResumeNames.filter(Boolean)
            : [];

        if (preferredResumeNames.length === 0 && typeof options.getCvDocument === 'function') {
            try {
                const preview = await options.getCvDocument();

                if (preview?.fileName) {
                    preferredResumeNames = [String(preview.fileName)];
                }
            } catch {
                // Falls back to the most recently uploaded card.
            }
        }

        await expandCollapsedResumeCards(modal);

        const choice = chooseResumeOption(listResumeOptions(modal), { preferredResumeNames });

        if (choice) {
            const selectedLabel = choice.option.fileName || choice.option.label;

            if (choice.option.selected) {
                return {
                    filled: 0,
                    success: true,
                    skipped: false,
                    resumeSelected: true,
                    method: 'already-selected',
                    reason: choice.reason,
                    selectedLabel,
                };
            }

            clickResumeOption(choice.option);
            await sleep(350);

            const fresh = listResumeOptions(modal).find((entry) => entry.host === choice.option.host);

            if (fresh?.selected || isResumeOptionSelected(choice.option)) {
                return {
                    filled: 1,
                    success: true,
                    resumeSelected: true,
                    method: 'select-card',
                    reason: choice.reason,
                    selectedLabel,
                };
            }

            if (hasSelectedResume(modal)) {
                return {
                    filled: 0,
                    success: true,
                    resumeSelected: true,
                    method: 'select-card-unverified',
                    reason: choice.reason,
                    selectedLabel,
                    errors: [`Could not confirm LinkedIn selected resume "${selectedLabel}".`],
                };
            }
        }

        if (hasSelectedResume(modal)) {
            return { filled: 0, success: true, skipped: false, resumeSelected: true, method: 'already-selected' };
        }

        const fileInput = findLinkedInResumeFileInput(modal);

        if (fileInput && typeof options.getCvDocument === 'function') {
            const attached = await attachCvToFileInput(fileInput, options.getCvDocument);
            await sleep(300);

            return {
                filled: attached ? 1 : 0,
                success: attached || hasSelectedResume(modal),
                resumeSelected: hasSelectedResume(modal),
                method: attached ? 'upload' : 'upload-failed',
                errors: attached ? [] : ['Could not attach CV to LinkedIn resume upload.'],
            };
        }

        return {
            filled: 0,
            success: false,
            resumeSelected: hasSelectedResume(modal),
            errors: ['No resume selected on LinkedIn Resume step.'],
        };
    }

    function isVisibleErrorNode(node) {
        if (!node) {
            return false;
        }

        const root = node.closest('[data-test-form-element-error-messages], .artdeco-inline-feedback--error');

        if (!root) {
            return false;
        }

        if (root.hasAttribute('hidden')) {
            return false;
        }

        const style = root.style?.display || root.getAttribute('style') || '';

        if (/display\s*:\s*none/i.test(style)) {
            return false;
        }

        return true;
    }

    function readContactValidationErrors(modal) {
        const errors = [];

        for (const node of modal.querySelectorAll('[data-test-form-element-error-messages] .artdeco-inline-feedback__message, .artdeco-inline-feedback--error .artdeco-inline-feedback__message')) {
            if (!isVisibleErrorNode(node)) {
                continue;
            }

            const message = normalize(node.textContent);

            if (message.length >= 3) {
                errors.push(message);
            }
        }

        return [...new Set(errors)];
    }

    async function fillContactInfoStep(modal, profileData) {
        if (!modal || !profileData) {
            return { filled: 0, success: false, errors: ['Missing modal or profile.'] };
        }

        let filled = 0;
        let errors = [];

        if (isContactInfoStep(modal)) {
            if (fillEmailSelect(modal, profileData)) {
                filled += 1;
            }

            if (fillPhoneCountrySelect(modal, profileData)) {
                filled += 1;
            }

            if (fillMobilePhoneInput(modal, profileData)) {
                filled += 1;
            }

            if (await fillLocationTypeahead(modal, profileData)) {
                filled += 1;
            }

            errors = readContactValidationErrors(modal);
        }

        const emailSelect = findSelectByLabel(modal, /\bemail\b/i);
        const countrySelect = findSelectByLabel(modal, /phone\s+country\s+code|country\s+code/i);
        const phoneInput = findInputByLabel(modal, /mobile\s+phone|phone\s+number/i);
        const locationInput = findLocationTypeaheadInput(modal);
        const emailReady = !emailSelect || !isSelectPlaceholder(emailSelect);
        const countryReady = !countrySelect || !isSelectPlaceholder(countrySelect);
        const phoneReady = !phoneInput || Boolean(normalize(phoneInput.value));
        const locationReady = !locationInput || !locationTypeaheadNeedsFill(locationInput);
        const contactReady = !isContactInfoStep(modal) || (emailReady && countryReady && phoneReady && locationReady);

        return {
            filled,
            success: contactReady && errors.length === 0,
            errors,
            emailSelected: emailSelect ? emailReady : null,
            countrySelected: countrySelect ? countryReady : null,
            phoneFilled: phoneInput ? phoneReady : null,
            locationFilled: locationInput ? locationReady : null,
        };
    }

    return {
        fillContactInfoStep,
        fillResumeStep,
        fillEmailSelect,
        fillLocationTypeahead,
        fillPhoneCountrySelect,
        fillMobilePhoneInput,
        expandCollapsedResumeCards,
        findLinkedInResumeFileInput,
        findLocationTypeaheadInput,
        findResumeCardToSelect,
        hasSelectedResume,
        listResumeCards,
        listResumeOptions,
        chooseResumeOption,
        resumeNameKey,
        readResumeCardLabel,
        scoreResumeCard,
        isContactInfoStep,
        isResumeStep,
        isPlaceholderSelectOption,
        isSelectPlaceholder,
        locationTypeaheadNeedsFill,
        matchCountryOption,
        matchEmailOption,
        readContactValidationErrors,
        readProfileEmail,
        readProfileLocation,
        readProfilePhone,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyLinkedInEasyApplyFields = AutoCVApplyLinkedInEasyApplyFields;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyLinkedInEasyApplyFields = AutoCVApplyLinkedInEasyApplyFields;
}
