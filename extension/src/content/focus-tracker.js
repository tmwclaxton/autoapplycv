/**
 * Track focused form field for Quick Answer in popup/side panel.
 */
const AutoCVApplyFocusTracker = (() => {
    const FOCUSED_FIELD_KEY = 'focusedField';

    function fieldPayload(element) {
        const label = AutoCVApplyFormHeuristics.getFieldLabel(element);

        if (!label || label.length < 3) {
            return null;
        }

        return {
            label,
            field_type: AutoCVApplyFormHeuristics.getFieldType(element),
            max_chars: element.maxLength > 0 ? element.maxLength : undefined,
            updated_at: Date.now(),
        };
    }

    async function saveFocusedField(element) {
        const payload = fieldPayload(element);

        if (!payload) {
            await chrome.storage.session.remove(FOCUSED_FIELD_KEY);

            return;
        }

        await chrome.storage.session.set({ [FOCUSED_FIELD_KEY]: payload });
    }

    function bindFocusTracking(root = document) {
        root.addEventListener('focusin', (event) => {
            const target = event.target;

            if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
                return;
            }

            saveFocusedField(target).catch(() => {});
        }, true);
    }

    return { bindFocusTracking, FOCUSED_FIELD_KEY };
})();
