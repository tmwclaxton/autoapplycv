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
        style.textContent = `
            .${HIGHLIGHT_CLASS} {
                outline: 2px solid #c8102e !important;
                outline-offset: 1px !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function isExtensionUiElement(element) {
        return Boolean(
            element.closest('#autocvapply-portal-bar, #autocvapply-quick-draft, [data-autocvapply-ui]'),
        );
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

            if (repRole === 'radio') {
                scope = rep.closest('[role="radiogroup"]') || rep;
            } else if (repRole === 'checkbox') {
                scope = rep.closest('[role="group"], fieldset, [role="radiogroup"]') || rep;
            }
        } else if (target?.getAttribute?.('role') === 'listbox') {
            scope = target;
        } else if (target?.getAttribute?.('role') === 'combobox') {
            // Greenhouse / react-select: outline .select__container (label +
            // control). The combobox itself is a 2px-wide input.
            scope = target.closest('.select__container')
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
            scope = resolveChoiceHighlightScope(target, roleRadios)
                || target.closest(
                    'fieldset, [role="radiogroup"], [role="group"], [data-field-path], .ashby-application-form-field-entry, .application-field, .gfield',
                )
                || target;
        }

        return scope instanceof Element ? scope : null;
    }

    function resolveHighlightElements(target, roleRadios) {
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

        AutoCVApplyFormHeuristics.eachDraftableField(root, profile, settings, memo, (_field, target, roleRadios) => {
            for (const element of resolveHighlightElements(target, roleRadios)) {
                if (!element || isExtensionUiElement(element)) {
                    continue;
                }

                element.classList.add(HIGHLIGHT_CLASS);
                highlightedElements.add(element);
            }
        });
    }

    return { applyHighlights, clearHighlights };
})();
