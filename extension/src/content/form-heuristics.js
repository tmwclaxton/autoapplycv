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
        city: [/\bcity\b/i, /\btown\b/i, /location/i, /ville/i],
        postcode: [/post[\s-]?code/i, /zip[\s-]?code/i, /postal/i],
        country: [/\bcountry\b/i, /nation/i],
        linkedin: [/linkedin/i],
        website: [/website/i, /portfolio/i, /github/i, /personal[\s_-]?site/i],
        coverLetter: [/cover[\s_-]?letter/i, /motivation/i, /message to/i, /why (do )?you/i, /tell us about/i],
        headline: [/headline/i, /job title/i, /current title/i],
        salary: [/salary/i, /compensation/i, /expected pay/i, /pay rate/i],
        yearsExperience: [/years? (of )?experience/i, /experience \(years/i],
        visa: [/visa/i, /sponsorship/i, /work permit/i],
        authorized: [/legally authorized/i, /eligible to work/i, /right to work/i, /work authorization/i],
        relocate: [/willing to relocate/i, /relocation/i],
        driversLicense: [/driver.*licen/i, /driving licence/i],
    };

    function normalize(text) {
        return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
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

    function isVisible(element) {
        if (!element || element.disabled || element.readOnly) {
            return false;
        }

        if (element.type === 'hidden') {
            return false;
        }

        const style = window.getComputedStyle(element);

        return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
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
            const target = String(value).toLowerCase();
            const label = getFieldLabel(element);
            const shouldCheck = target === 'yes' || target === 'true' || target === '1';

            if (label.includes('no') && !shouldCheck) {
                element.checked = true;
                element.dispatchEvent(new Event('change', { bubbles: true }));

                return true;
            }

            if (shouldCheck) {
                element.checked = true;
                element.dispatchEvent(new Event('change', { bubbles: true }));

                return true;
            }

            return false;
        }

        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
            || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

        if (setter) {
            setter.call(element, String(value));
        } else {
            element.value = String(value);
        }

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
                return settings.visaSponsorship === 'yes' ? 'Yes' : 'No';
            case 'authorized':
                return settings.legallyAuthorized === 'no' ? 'No' : 'Yes';
            case 'relocate':
                return settings.willingToRelocate === 'no' ? 'No' : 'Yes';
            case 'driversLicense':
                return settings.driversLicense === 'no' ? 'No' : 'Yes';
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

            const label = getFieldLabel(element);
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

        for (const element of collectFillableElements(root)) {
            if (filled >= maxFields) {
                break;
            }

            if (element.value?.trim()) {
                continue;
            }

            if (element.type === 'file') {
                continue;
            }

            const label = getFieldLabel(element);

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

    function looksLikeApplicationForm(root = document) {
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

            if (/resume|cv|cover letter|linkedin/.test(labels)) {
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
            return !element.checked;
        }

        if (element.value?.trim()) {
            return false;
        }

        const label = getFieldLabel(element);

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
        let id = 0;

        for (const element of collectFillableElements(root)) {
            if (!elementNeedsDraft(element, profile, settings, memo)) {
                continue;
            }

            const label = getFieldLabel(element);

            if (seen.has(label)) {
                continue;
            }

            seen.add(label);

            items.push({
                id,
                label,
                field_type: getFieldType(element),
                max_chars: element.maxLength > 0 ? element.maxLength : undefined,
                options: getSelectOptions(element),
            });

            id += 1;
        }

        return items;
    }

    function applyAnswerByLabel(root, label, answer) {
        if (!answer) {
            return false;
        }

        for (const element of collectFillableElements(root)) {
            if (getFieldLabel(element) !== label) {
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
