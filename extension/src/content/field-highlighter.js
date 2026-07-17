/**
 * Red outline on draftable fields detected by form heuristics / field inventory.
 */
const AutoCVApplyFieldHighlighter = (() => {
    const HIGHLIGHT_CLASS = 'autocvapply-field-detected';
    const highlightedElements = new Set();

    function ensureStyles() {
        if (document.getElementById('autocvapply-field-highlight-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'autocvapply-field-highlight-styles';
        // box-shadow + border survive LinkedIn/Artdeco styles that clip or reset outline.
        style.textContent = `
            .${HIGHLIGHT_CLASS},
            select.${HIGHLIGHT_CLASS},
            input.${HIGHLIGHT_CLASS},
            textarea.${HIGHLIGHT_CLASS},
            [role="combobox"].${HIGHLIGHT_CLASS},
            .artdeco-text-input--input.${HIGHLIGHT_CLASS},
            .fb-dash-form-element__select-dropdown.${HIGHLIGHT_CLASS} {
                outline: 2px solid #c8102e !important;
                outline-offset: 2px !important;
                border-color: #c8102e !important;
                box-shadow: 0 0 0 2px #c8102e !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function isExtensionUiElement(element) {
        return Boolean(
            element.closest('#autocvapply-portal-bar, #autocvapply-quick-draft, [data-autocvapply-ui]'),
        );
    }

    function isWorkableApplyHost(doc = document) {
        try {
            return /(?:^|\.)workable\.com$/i.test(doc.location?.hostname || '');
        } catch {
            return false;
        }
    }

    function isMeaningfulHighlightContainer(scope, rep) {
        return scope instanceof Element
            && scope !== rep
            && Boolean(scope.matches?.(
                'fieldset, [role="radiogroup"], [role="group"], [data-input-type="select"], [data-role="illustrated-input"], [data-role="dropzone"], .styles--3IYUq',
            ));
    }

    function resolveWorkableHighlightScope(element) {
        if (!(element instanceof Element) || !isWorkableApplyHost(element.ownerDocument || document)) {
            return null;
        }

        if (element.getAttribute?.('role') === 'combobox') {
            return element.closest('[data-input-type="select"]')
                || element.closest('[data-role="illustrated-input"]')
                || element;
        }

        if (element.type === 'radio' || element.type === 'checkbox') {
            return element.closest('fieldset[role="radiogroup"]')
                || element.closest('[role="radiogroup"]')
                || element.closest('[role="group"][aria-labelledby]')
                || element.closest('.styles--3IYUq')
                || element;
        }

        if (element.type === 'file') {
            return element.closest('[data-role="dropzone"]')
                || element.closest('.styles--3IYUq')
                || element;
        }

        const tag = element.tagName?.toLowerCase();

        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            return element.closest('[data-role="illustrated-input"]')
                || element.closest('.styles--3IYUq')
                || element;
        }

        return null;
    }

    function resolveChoiceHighlightScope(target, roleRadios) {
        const rep = Array.isArray(target) ? target[0] : (roleRadios?.[0] || target);

        if (typeof AutoCVApplyFormHeuristics?.getChoiceGroupScope === 'function' && rep) {
            const scope = AutoCVApplyFormHeuristics.getChoiceGroupScope(rep);

            if (scope instanceof Element) {
                return scope;
            }
        }

        return null;
    }

    function resolveChoiceOptionHighlightElement(input) {
        if (!(input instanceof Element)) {
            return null;
        }

        return input.closest('label')
            || input.closest('[class*="_option_"]')
            || input.closest('li.column, li[class*="option"], [role="option"]')
            || input;
    }

    function resolveChoiceGroupHighlightElements(target, roleRadios) {
        const inputs = Array.isArray(target) && target.length > 1
            ? target
            : (roleRadios?.length > 1 ? roleRadios : null);

        if (!inputs?.length) {
            return [];
        }

        const optionElements = inputs
            .map((input) => resolveChoiceOptionHighlightElement(input))
            .filter((element) => element instanceof Element);

        return optionElements.length >= 2 ? optionElements : [];
    }

    function resolveHighlightElement(target, roleRadios) {
        let rep = roleRadios?.[0] || target;
        let scope = rep;

        if (Array.isArray(target) && target[0]?.tagName?.toLowerCase() === 'button') {
            scope = target[0].closest('[data-field-path], .ashby-application-form-field-entry')
                || target[0].closest('[class*="_yesno_"]')
                || target[0];
            rep = target[0];
        } else if (roleRadios?.length) {
            const repRole = roleRadios[0]?.getAttribute?.('role');
            const workableGroup = resolveWorkableHighlightScope(roleRadios[0]);

            if (isMeaningfulHighlightContainer(workableGroup, roleRadios[0])) {
                scope = workableGroup;
            } else if (repRole === 'radio') {
                scope = rep.closest('[role="radiogroup"]') || rep;
            } else if (repRole === 'checkbox') {
                scope = rep.closest('[role="group"], fieldset, [role="radiogroup"]') || rep;
            }
        } else if (target?.getAttribute?.('role') === 'listbox') {
            scope = target;
        } else if (target?.getAttribute?.('role') === 'combobox') {
            // Greenhouse / react-select and Workable custom selects: outline the
            // visible control shell, not the 2px-wide combobox input.
            scope = target.closest('[data-input-type="select"]')
                || target.closest('.select__container')
                || target.closest('.select__control, .select-shell')
                || target.closest('[data-field-path], .ashby-application-form-field-entry')
                || target;
        } else if (Array.isArray(target)) {
            scope = resolveChoiceHighlightScope(target, roleRadios)
                || target[0]?.closest(
                    'fieldset, [role="radiogroup"], [role="group"], [data-field-path], .ashby-application-form-field-entry, .application-field, .gfield',
                )
                || target[0];
        } else if (target?.type === 'radio' || target?.type === 'checkbox') {
            scope = resolveWorkableHighlightScope(target)
                || resolveChoiceHighlightScope(target, roleRadios)
                || target.closest(
                    'fieldset, [role="radiogroup"], [role="group"], [data-field-path], .ashby-application-form-field-entry, .application-field, .gfield',
                )
                || target;
        } else if (target instanceof Element) {
            const workableScope = resolveWorkableHighlightScope(target);

            if (isMeaningfulHighlightContainer(workableScope, target)) {
                scope = workableScope;
            }
        }

        return scope instanceof Element ? scope : null;
    }

    function resolveHighlightElements(target, roleRadios) {
        const rep = roleRadios?.[0] || (Array.isArray(target) ? target[0] : target);
        const workableScope = rep instanceof Element ? resolveWorkableHighlightScope(rep) : null;

        if (isMeaningfulHighlightContainer(workableScope, rep)) {
            return [workableScope];
        }

        const choiceOptions = resolveChoiceGroupHighlightElements(target, roleRadios);

        if (choiceOptions.length >= 2) {
            return choiceOptions;
        }

        const element = resolveHighlightElement(target, roleRadios);

        return element instanceof Element ? [element] : [];
    }

    function clearHighlights() {
        for (const element of highlightedElements) {
            element.classList.remove(HIGHLIGHT_CLASS);
        }

        highlightedElements.clear();
    }

    function applyHighlights(root, profile, settings, memo = {}) {
        ensureStyles();
        clearHighlights();

        // Match field inventory: outline inventoriable controls even when already filled.
        // Easy Apply contact steps (email/phone prefilled) must still show red outlines.
        AutoCVApplyFormHeuristics.eachDraftableField(
            root,
            profile,
            settings,
            memo,
            (_field, target, roleRadios) => {
                for (const element of resolveHighlightElements(target, roleRadios)) {
                    if (!element || isExtensionUiElement(element)) {
                        continue;
                    }

                    element.classList.add(HIGHLIGHT_CLASS);
                    highlightedElements.add(element);
                }
            },
            { includeFilled: true },
        );
    }

    return { applyHighlights, clearHighlights };
})();
