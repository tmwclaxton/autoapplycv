/**
 * Universal job application form heuristics.
 * Inspired by AutoApplyMax field matching, common-intern apply scripts,
 * and Auto-Job-Form-Filler-Agent question/answer flow.
 */
const AutoCVApplyFormHeuristics = (() => {
    const FIELD_PATTERNS = {
        firstName: [/first[\s_-]?name/i, /given[\s_-]?name/i, /pr[eé]nom/i, /vorname/i],
        lastName: [/last[\s_-]?name/i, /family[\s_-]?name/i, /surname/i, /nom(?!bre)/i, /nachname/i],
        fullName: [/^name$/i, /full[\s_-]?name/i, /your[\s_-]?name/i, /applicant[\s_-]?name/i],
        email: [/e[\s-]?mail/i, /correo/i, /courriel/i],
        phone: [/phone/i, /mobile/i, /telephone/i, /tel[eé]phone/i, /\btel\b/i],
        city: [/\bcity\b/i, /\btown\b/i, /location/i, /ville/i, /where are you.*based/i, /currently based/i],
        postcode: [/post[\s-]?code/i, /zip[\s-]?code/i, /postal/i],
        country: [/\bcountry\b/i, /nation/i],
        linkedin: [/linkedin/i],
        website: [/website/i, /portfolio/i, /github/i, /personal[\s_-]?site/i],
        coverLetter: [/cover[\s_-]?letter/i, /motivation/i, /message to/i, /why (do )?you/i, /tell us about/i, /what interests you most about working at/i],
        headline: [/headline/i, /job title/i, /current title/i],
        salary: [/salary/i, /compensation/i, /expected pay/i, /pay rate/i, /minimum compensation/i],
        yearsExperience: [/years? (of )?experience/i, /experience \(years/i],
        visa: [/visa/i, /sponsorship/i, /work permit/i],
        authorized: [/legally authorized/i, /eligible to work/i, /right to work/i, /work authorization/i],
        relocate: [/willing to relocate/i, /relocation/i, /open to relocation/i],
        driversLicense: [/driver.*licen/i, /driving licence/i],
        startDate: [/when will you.*join/i, /start date/i, /available to start/i, /notice period/i],
        employmentType: [/types of employment/i, /employment type/i, /full.?time or part.?time/i],
        officePreference: [/office/i, /hybrid/i, /remote/i, /days per week/i, /coming to our office/i],
    };

    function normalize(text) {
        return (text || '').replace(/\s+/g, ' ').replace(/\*/g, '').trim().toLowerCase();
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
        const option = normalize(optionText);
        const normalizedAnswer = normalize(answer);

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

    function detectFieldType(labelText) {
        for (const [fieldKey, patterns] of Object.entries(FIELD_PATTERNS)) {
            if (patterns.some((pattern) => pattern.test(labelText))) {
                return fieldKey;
            }
        }

        return null;
    }

    function splitFullName(fullName) {
        if (!fullName) {
            return { firstName: '', lastName: '' };
        }

        const parts = fullName.trim().split(/\s+/);

        return {
            firstName: parts[0] || '',
            lastName: parts.slice(1).join(' ') || '',
        };
    }

    function buildProfileValues(profile) {
        const { firstName, lastName } = splitFullName(profile.full_name);

        return {
            firstName,
            lastName,
            fullName: profile.full_name || `${firstName} ${lastName}`.trim(),
            email: profile.email || '',
            phone: profile.phone || '',
            city: profile.city || profile.location?.split(',')[0]?.trim() || '',
            postcode: profile.postcode || '',
            country: profile.country || '',
            linkedin: profile.linkedin_url || '',
            website: profile.website_url || '',
            headline: profile.headline || '',
            coverLetter: profile.summary || profile.formatted_cv_text?.slice(0, 2500) || profile.extra_context?.slice(0, 2500) || '',
        };
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

    function resolveAnswer(fieldType, values, settings) {
        switch (fieldType) {
            case 'firstName':
                return values.firstName;
            case 'lastName':
                return values.lastName;
            case 'fullName':
                return values.fullName;
            case 'email':
                return values.email;
            case 'phone':
                return values.phone;
            case 'city':
                return values.city;
            case 'postcode':
                return values.postcode;
            case 'country':
                return values.country;
            case 'linkedin':
                return values.linkedin;
            case 'website':
                return values.website;
            case 'headline':
                return values.headline;
            case 'coverLetter':
                return values.coverLetter;
            case 'salary':
                return settings.expectedSalary || '';
            case 'yearsExperience':
                return settings.yearsOfExperience || '2';
            case 'visa':
                if (settings.visaSponsorship === 'yes') {
                    return 'I have right to work for now, but would require sponsorship at a later time';
                }

                return 'Yes';
            case 'authorized':
                if (settings.visaSponsorship === 'yes') {
                    return 'I have right to work for now, but would require sponsorship at a later time';
                }

                return settings.legallyAuthorized === 'no' ? 'No' : 'Yes';
            case 'relocate':
                if (settings.willingToRelocate === 'no') {
                    return 'No, I am not open to relocation';
                }

                return 'Yes, I am open to relocation';
            case 'driversLicense':
                return settings.driversLicense === 'no' ? 'No' : 'Yes';
            case 'startDate':
                return 'I can start in less than 1 month';
            case 'employmentType':
                return 'Employee, full-time';
            case 'officePreference':
                return 'I am happy with a few times a week';
            default:
                return '';
        }
    }

    function collectFillableElements(root) {
        return Array.from(root.querySelectorAll('input, textarea, select')).filter(isVisible);
    }

    function collectOpenQuestions(root, memo = {}) {
        const questions = [];

        for (const element of collectFillableElements(root)) {
            if (element.value?.trim()) {
                continue;
            }

            if (element.type === 'file' || element.type === 'checkbox' || element.type === 'radio') {
                continue;
            }

            const label = getQuestionLabel(element);
            const fieldType = detectFieldType(label);

            if (fieldType) {
                continue;
            }

            if (label.length < 4) {
                continue;
            }

            if (memo[label]) {
                setFieldValue(element, memo[label]);

                continue;
            }

            questions.push({
                label,
                field_type: element.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'text',
                max_chars: element.maxLength > 0 ? element.maxLength : undefined,
                element,
            });
        }

        return questions;
    }

    function fillContainer(root, profile, settings, maxFields, memo = {}) {
        const values = buildProfileValues(profile);
        let filled = 0;
        const processedGroups = new Set();

        for (const element of collectFillableElements(root)) {
            if (filled >= maxFields) {
                break;
            }

            if (element.type === 'file') {
                continue;
            }

            if (element.type === 'radio' || element.type === 'checkbox') {
                const groupName = getGroupName(element);

                if (processedGroups.has(groupName)) {
                    continue;
                }

                processedGroups.add(groupName);

                if (isGroupAnswered(element)) {
                    continue;
                }

                const label = getQuestionLabel(element);

                if (memo[label]) {
                    if (setGroupValue(element, memo[label])) {
                        filled += 1;
                    }

                    continue;
                }

                const fieldType = detectFieldType(label);

                if (!fieldType) {
                    continue;
                }

                const answer = resolveAnswer(fieldType, values, settings);

                if (answer && setGroupValue(element, answer)) {
                    filled += 1;
                }

                continue;
            }

            if (element.value?.trim()) {
                continue;
            }

            const label = getQuestionLabel(element);

            if (memo[label]) {
                if (setFieldValue(element, memo[label])) {
                    filled += 1;
                }

                continue;
            }

            const fieldType = detectFieldType(label);

            if (!fieldType) {
                continue;
            }

            const answer = resolveAnswer(fieldType, values, settings);

            if (answer && setFieldValue(element, answer)) {
                filled += 1;
            }
        }

        return filled;
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

    function elementNeedsDraft(element, profile, settings, memo) {
        if (!isVisible(element) || element.type === 'file') {
            return false;
        }

        if (element.type === 'checkbox' || element.type === 'radio') {
            if (isGroupAnswered(element)) {
                return false;
            }

            const label = getQuestionLabel(element);

            if (label.length < 3) {
                return false;
            }

            if (memo[label]) {
                setGroupValue(element, memo[label]);

                return false;
            }

            const fieldType = detectFieldType(label);

            if (fieldType) {
                const values = buildProfileValues(profile);
                const answer = resolveAnswer(fieldType, values, settings);

                if (answer && setGroupValue(element, answer)) {
                    return false;
                }
            }

            return true;
        }

        if (element.value?.trim()) {
            return false;
        }

        const label = getQuestionLabel(element);

        if (label.length < 3) {
            return false;
        }

        if (memo[label]) {
            setFieldValue(element, memo[label]);

            return false;
        }

        const fieldType = detectFieldType(label);

        if (fieldType) {
            const values = buildProfileValues(profile);
            const answer = resolveAnswer(fieldType, values, settings);

            if (answer && setFieldValue(element, answer)) {
                return false;
            }
        }

        return true;
    }

    function collectDraftableFields(root, profile, settings, memo = {}) {
        const items = [];
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

                items.push({
                    id,
                    label,
                    field_type: element.type === 'radio' ? 'radio' : 'checkbox',
                    max_chars: undefined,
                    options: getGroupOptions(element),
                });

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

            items.push({
                id,
                label,
                field_type: getFieldType(element),
                max_chars: element.maxLength > 0 ? element.maxLength : undefined,
                options: getGroupOptions(element),
            });

            id += 1;
        }

        return items;
    }

    function applyAnswerByLabel(root, label, answer) {
        if (!answer) {
            return false;
        }

        const normalizedTarget = normalize(label);
        const processedGroups = new Set();

        for (const element of collectFillableElements(root)) {
            if (element.type === 'radio' || element.type === 'checkbox') {
                const groupName = getGroupName(element);

                if (processedGroups.has(groupName)) {
                    continue;
                }

                processedGroups.add(groupName);

                if (getQuestionLabel(element) !== normalizedTarget) {
                    continue;
                }

                if (setGroupValue(element, answer)) {
                    return true;
                }

                continue;
            }

            if (getQuestionLabel(element) !== normalizedTarget) {
                continue;
            }

            if (setFieldValue(element, answer)) {
                return true;
            }
        }

        return false;
    }

    function countDraftableFields(root, profile, settings, memo = {}) {
        return collectDraftableFields(root, profile, settings, memo).length;
    }

    return {
        applyAnswerByLabel,
        buildProfileValues,
        collectDraftableFields,
        collectOpenQuestions,
        countDraftableFields,
        detectFieldType,
        fillContainer,
        forEachIframeDocument,
        frameHasApplicationForm,
        getFieldLabel,
        getFieldType,
        looksLikeApplicationForm,
        setFieldValue,
    };
})();
