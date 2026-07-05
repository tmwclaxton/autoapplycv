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
            scope = target.closest('[data-field-path], .ashby-application-form-field-entry') || target;
        } else if (target?.type === 'radio' || target?.type === 'checkbox') {
            scope = target.closest(
                'fieldset, [role="radiogroup"], [role="group"], [data-field-path], .ashby-application-form-field-entry',
            ) || target;
        } else if (Array.isArray(target)) {
            scope = target[0];
        }

        return scope instanceof Element ? scope : null;
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
            const element = resolveHighlightElement(target, roleRadios);

            if (!element || isExtensionUiElement(element)) {
                return;
            }

            element.classList.add(HIGHLIGHT_CLASS);
            highlightedElements.add(element);
        });
    }

    return { applyHighlights, clearHighlights };
})();
