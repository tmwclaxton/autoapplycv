/**
 * Generic form validation error detection for job application pages.
 */
var AutoCVApplyFormValidation = (() => {
    const TEXT_ERROR_PATTERNS = [
        /your form needs corrections/i,
        /missing entry for required field/i,
        /this field is required/i,
        /please fix the errors/i,
        /please complete all required fields/i,
    ];

    const FORM_ERROR_SELECTORS = [
        '.gform_validation_errors',
        '.gform_validation_error',
        '.gform_submission_error',
        '.form-error-summary',
        '.ashby-application-form-errors',
        '.ashby-application-form-error',
    ];

    function normalizeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function isHiddenFromAssistiveTech(element) {
        if (!element || element.nodeType !== 1) {
            return false;
        }

        if (element.getAttribute('aria-hidden') === 'true') {
            return true;
        }

        return Boolean(element.closest('[aria-hidden="true"]'));
    }

    function isVisible(element) {
        if (!element || element.nodeType !== 1) {
            return false;
        }

        if (isHiddenFromAssistiveTech(element)) {
            return false;
        }

        const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);

        if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) {
            return false;
        }

        const rect = element.getBoundingClientRect?.();

        if (rect && rect.width === 0 && rect.height === 0) {
            return false;
        }

        return true;
    }

    function isPromotionalAlert(text) {
        return /job alerts|straight to your inbox|subscribe to|newsletter|cookie preferences|please try again/i.test(text);
    }

    function looksLikeValidationError(text) {
        const normalized = normalizeText(text);

        if (!normalized || isPromotionalAlert(normalized)) {
            return false;
        }

        for (const pattern of TEXT_ERROR_PATTERNS) {
            if (pattern.test(normalized)) {
                return true;
            }
        }

        return /error|required|invalid|correction|missing|please fix|complete all/i.test(normalized);
    }

    function readFieldLabel(element) {
        if (!element) {
            return '';
        }

        if (typeof AutoCVApplyFormHeuristics !== 'undefined') {
            const label = AutoCVApplyFormHeuristics.getQuestionLabel(element);

            if (label.length >= 2) {
                return label;
            }
        }

        const ariaLabel = normalizeText(element.getAttribute('aria-label') || '');

        if (ariaLabel.length >= 2) {
            return ariaLabel;
        }

        const labelledBy = element.getAttribute('aria-labelledby');

        if (labelledBy) {
            const doc = element.ownerDocument || document;

            for (const id of labelledBy.split(/\s+/)) {
                const labelEl = doc.getElementById(id);
                const text = normalizeText(labelEl?.textContent || '');

                if (text.length >= 2) {
                    return text;
                }
            }
        }

        const fieldContainer = element.closest('.gfield, [data-test-form-element], fieldset, .ashby-application-form-field-entry');

        if (fieldContainer) {
            const labelEl = fieldContainer.querySelector(
                'label, legend, .gfield_label, .fb-dash-form-element__label, [data-test-single-typeahead-entity-form-title]',
            );
            const text = normalizeText(labelEl?.textContent || '');

            if (text.length >= 2) {
                return text;
            }
        }

        return normalizeText(element.name || element.id || '');
    }

    function readFieldType(element) {
        if (!element) {
            return 'text';
        }

        if (typeof AutoCVApplyFormHeuristics !== 'undefined') {
            return AutoCVApplyFormHeuristics.getFieldType(element);
        }

        const tag = String(element.tagName || '').toLowerCase();

        if (tag === 'select') {
            return 'select';
        }

        if (tag === 'textarea') {
            return 'textarea';
        }

        return element.type || 'text';
    }

    function readGravityFieldErrorMessage(container) {
        for (const selector of [
            '.validation_message',
            '.gfield_description.validation_message',
            '.gfield_validation_message',
        ]) {
            for (const node of container.querySelectorAll(selector)) {
                if (!isVisible(node)) {
                    continue;
                }

                if (node.classList.contains('validation_message--hidden-on-empty')) {
                    const text = normalizeText(node.textContent || '');

                    if (!text) {
                        continue;
                    }
                }

                const message = normalizeText(node.textContent || '');

                if (message.length >= 3 && message.length <= 280) {
                    return message;
                }
            }
        }

        return null;
    }

    function resolveInvalidInput(element) {
        if (!element) {
            return null;
        }

        const tag = String(element.tagName || '').toLowerCase();

        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            return element;
        }

        return element.querySelector('input, textarea, select');
    }

    function registerInvalidField(input, message) {
        const anchor = resolveInvalidInput(input) || input;
        const label = readFieldLabel(anchor);
        let ref = null;
        let dom = {
            id: anchor?.id || null,
            name: anchor?.name || null,
            type: anchor?.type || null,
        };

        if (typeof AutoCVApplyFieldInventory !== 'undefined' && anchor) {
            const existingRef = AutoCVApplyFieldInventory.findRefForElement?.(anchor);

            if (existingRef) {
                ref = existingRef;
                const entry = AutoCVApplyFieldInventory.getRefEntry?.(existingRef);

                if (entry?.dom) {
                    dom = entry.dom;
                }
            } else if (typeof AutoCVApplyFieldInventory.registerValidationField === 'function') {
                ref = AutoCVApplyFieldInventory.registerValidationField(anchor);
            }
        }

        return {
            ref,
            label,
            question: label,
            field_type: readFieldType(anchor),
            validationMessage: message,
            dom,
        };
    }

    function collectGravityInvalidFields(root) {
        const fields = [];
        const seen = new Set();

        for (const container of root.querySelectorAll('.gfield.gfield_error, .gfield_error')) {
            const message = readGravityFieldErrorMessage(container)
                || 'This field is required.';
            const input = container.querySelector('input, textarea, select');

            if (!input) {
                continue;
            }

            const key = input.id || input.name || message;

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            fields.push(registerInvalidField(input, message));
        }

        return fields;
    }

    function collectAriaInvalidFields(root) {
        const fields = [];
        const seen = new Set();

        for (const input of root.querySelectorAll('[aria-invalid="true"]')) {
            if (!isVisible(input)) {
                continue;
            }

            const key = input.id || input.name;

            if (!key || seen.has(key)) {
                continue;
            }

            seen.add(key);

            const container = input.closest('.gfield, [data-test-form-element], fieldset');
            let message = null;

            if (container) {
                message = readGravityFieldErrorMessage(container);
            }

            if (!message) {
                const describedBy = input.getAttribute('aria-describedby');

                if (describedBy) {
                    const doc = input.ownerDocument || document;

                    for (const id of describedBy.split(/\s+/)) {
                        const node = doc.getElementById(id);
                        const text = normalizeText(node?.textContent || '');

                        if (text.length >= 3) {
                            message = text;
                            break;
                        }
                    }
                }
            }

            fields.push(registerInvalidField(input, message || 'Please enter a valid answer.'));
        }

        return fields;
    }

    function collectLinkedInInvalidFields(root) {
        const fields = [];
        const modal = root.querySelector(
            '[data-test-modal-id="easy-apply-modal"], .jobs-easy-apply-modal, [role="dialog"]',
        ) || root;

        for (const errorRoot of modal.querySelectorAll('[data-test-form-element-error-messages]')) {
            if (!isVisible(errorRoot)) {
                continue;
            }

            const message = normalizeText(
                errorRoot.querySelector('.artdeco-inline-feedback__message')?.textContent || errorRoot.textContent,
            );

            if (message.length < 3) {
                continue;
            }

            const formElement = errorRoot.closest('[data-test-form-element]');
            const input = formElement?.querySelector('input, textarea, select, [role="combobox"]');

            if (!input) {
                continue;
            }

            fields.push(registerInvalidField(input, message));
        }

        return fields;
    }

    function dedupeInvalidFields(fields) {
        const merged = [];
        const seen = new Set();

        for (const field of fields) {
            const key = field.ref
                || field.dom?.id
                || field.dom?.name
                || field.label?.toLowerCase();

            if (!key || seen.has(key)) {
                continue;
            }

            seen.add(key);
            merged.push(field);
        }

        return merged;
    }

    function scanFormValidationMessages(root) {
        const messages = [];

        for (const pattern of TEXT_ERROR_PATTERNS) {
            const bodyText = normalizeText(root.body?.textContent || '');

            if (!bodyText) {
                break;
            }

            const match = bodyText.match(pattern);

            if (match) {
                messages.push(match[0]);
            }
        }

        for (const selector of FORM_ERROR_SELECTORS) {
            for (const node of root.querySelectorAll(selector)) {
                if (!isVisible(node)) {
                    continue;
                }

                const text = normalizeText(node.textContent || '');

                if (text.length >= 3 && looksLikeValidationError(text)) {
                    messages.push(text);
                }
            }
        }

        for (const node of root.querySelectorAll('[role="alert"]')) {
            if (!isVisible(node)) {
                continue;
            }

            const text = normalizeText(node.textContent || '');

            if (text.length >= 3 && looksLikeValidationError(text)) {
                messages.push(text);
            }
        }

        return [...new Set(messages)].slice(0, 12);
    }

    async function triggerClientSideValidation(root, options = {}) {
        const waitMs = Number(options.waitMs) || 450;
        const doc = root.ownerDocument || root;
        const form = root.querySelector?.('form')
            || (root.tagName?.toLowerCase() === 'form' ? root : null)
            || doc.querySelector?.('form');

        // Prefer HTML5 reportValidity - surfaces errors without navigating/submitting.
        // Never click real Apply/Submit controls: many ATS boards (Teamtailor, etc.) post the
        // application from the button click handler without a cancelable form submit event.
        if (form && typeof form.reportValidity === 'function') {
            try {
                form.reportValidity();
            } catch {
                // Some ATS forms throw on reportValidity; still do not click Submit.
            }

            await new Promise((resolve) => window.setTimeout(resolve, waitMs));

            return { triggered: true, method: 'reportValidity' };
        }

        // No form handle - scan visible invalid state only; do not click Submit/Apply.
        await new Promise((resolve) => window.setTimeout(resolve, 80));

        return { triggered: false, reason: 'no_safe_validation_trigger' };
    }

    function scanFormValidationState(root = document, options = {}) {
        const invalidFields = dedupeInvalidFields([
            ...collectGravityInvalidFields(root),
            ...collectAriaInvalidFields(root),
            ...collectLinkedInInvalidFields(root),
        ]);
        let validationErrors = scanFormValidationMessages(root);

        for (const field of invalidFields) {
            if (field.validationMessage) {
                validationErrors.push(field.validationMessage);
            }
        }

        validationErrors = [...new Set(validationErrors)].slice(0, 12);

        const hasErrors = invalidFields.length > 0 || validationErrors.length > 0;

        return {
            hasErrors,
            validationErrors,
            invalidFields,
            invalidFieldCount: invalidFields.length,
            triggered: Boolean(options.triggered),
        };
    }

    async function scanFormValidationStateWithTrigger(root = document, options = {}) {
        let state = scanFormValidationState(root, options);

        if (!options.triggerValidation || state.hasErrors) {
            return state;
        }

        const triggerResult = await triggerClientSideValidation(root, options);

        if (!triggerResult.triggered) {
            return {
                ...state,
                triggerSkipped: triggerResult.reason || 'not_triggered',
            };
        }

        state = scanFormValidationState(root, { ...options, triggered: true });

        return state;
    }

    function validateBlockedField(root, field = {}) {
        const label = normalizeText(field.label || field.question || '');
        const domId = field.dom?.id || field.dom?.input_id || null;
        const domName = field.dom?.name || null;
        let target = null;

        if (domId) {
            target = root.getElementById(domId);
        }

        if (!target && domName) {
            target = root.querySelector(`[name="${CSS.escape(domName)}"]`);
        }

        if (!target && label && typeof AutoCVApplyFormHeuristics !== 'undefined') {
            AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
                if (target) {
                    return;
                }

                for (const input of doc.querySelectorAll('input, textarea, select, [role="combobox"]')) {
                    const candidateLabel = AutoCVApplyFormHeuristics.getQuestionLabel(input);

                    if (candidateLabel.toLowerCase() === label.toLowerCase()) {
                        target = input;
                        break;
                    }
                }
            });
        }

        const state = scanFormValidationState(root);
        const normalizedField = registerInvalidField(target, null);

        for (const invalidField of state.invalidFields) {
            if (field.ref && invalidField.ref === field.ref) {
                return {
                    valid: false,
                    validationErrors: state.validationErrors,
                    invalidFields: state.invalidFields,
                    validationError: invalidField.validationMessage || state.validationErrors[0] || null,
                };
            }

            if (domId && invalidField.dom?.id === domId) {
                return {
                    valid: false,
                    validationErrors: state.validationErrors,
                    invalidFields: state.invalidFields,
                    validationError: invalidField.validationMessage || state.validationErrors[0] || null,
                };
            }

            if (label && invalidField.label?.toLowerCase() === label.toLowerCase()) {
                return {
                    valid: false,
                    validationErrors: state.validationErrors,
                    invalidFields: state.invalidFields,
                    validationError: invalidField.validationMessage || state.validationErrors[0] || null,
                };
            }
        }

        if (target?.getAttribute?.('aria-invalid') === 'true') {
            return {
                valid: false,
                validationErrors: state.validationErrors,
                invalidFields: state.invalidFields,
                validationError: normalizedField.validationMessage || state.validationErrors[0] || 'Please enter a valid answer.',
            };
        }

        return {
            valid: true,
            validationErrors: [],
            invalidFields: [],
            validationError: null,
        };
    }

    return {
        scanFormValidationState,
        scanFormValidationStateWithTrigger,
        triggerClientSideValidation,
        validateBlockedField,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyFormValidation = AutoCVApplyFormValidation;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyFormValidation = AutoCVApplyFormValidation;
}
