/**
 * LinkedIn Easy Apply contact-info field helpers (content script global).
 */
const AutoCVApplyLinkedInEasyApplyFields = (() => {
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

    function isResumeStep(modal) {
        if (!modal) {
            return false;
        }

        const sectionHeading = modal.querySelector(
            '.jobs-easy-apply-form-section__title, form h3.t-bold, form h3, .ph5 h3.t-bold, .ph5 h3',
        );
        const heading = normalize(sectionHeading?.textContent || modal.querySelector('h3')?.textContent || '');

        if (/^resume$/i.test(heading) || /\bresume\b/i.test(heading)) {
            return true;
        }

        return Boolean(
            modal.querySelector('.jobs-document-upload-redesign-card__container')
            || modal.querySelector('input[type="file"][id*="upload-resume" i]')
            || modal.querySelector('.jobs-document-upload__upload-button'),
        );
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

        return Boolean(checkedRadio);
    }

    function findResumeCardToSelect(modal) {
        if (!modal || hasSelectedResume(modal)) {
            return null;
        }

        const byAria = modal.querySelector('.jobs-document-upload-redesign-card__container[aria-label="Select this resume"]');

        if (byAria) {
            return byAria;
        }

        for (const card of modal.querySelectorAll('.jobs-document-upload-redesign-card__container')) {
            if (!card.classList.contains('jobs-document-upload-redesign-card__container--selected')) {
                return card;
            }
        }

        return null;
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

    function findLinkedInResumeFileInput(modal) {
        if (!modal) {
            return null;
        }

        return modal.querySelector('input[type="file"][id*="upload-resume" i]:not([disabled])')
            || modal.querySelector('.js-jobs-document-upload__container input[type="file"]:not([disabled])')
            || modal.querySelector('input[type="file"][name="file"]:not([disabled])');
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

        if (hasSelectedResume(modal)) {
            return { filled: 0, success: true, skipped: false, resumeSelected: true, method: 'already-selected' };
        }

        const card = findResumeCardToSelect(modal);

        if (card) {
            clickResumeCard(card);
            await sleep(350);

            if (hasSelectedResume(modal)) {
                return { filled: 1, success: true, resumeSelected: true, method: 'select-card' };
            }
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
        findLinkedInResumeFileInput,
        findLocationTypeaheadInput,
        findResumeCardToSelect,
        hasSelectedResume,
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
