/**
 * Track focused form field and show an on-page Quick Answer button.
 */
const AutoCVApplyFocusTracker = (() => {
    const FOCUSED_FIELD_KEY = 'focusedField';
    let quickAnswerButton = null;
    let activeElement = null;
    let hideTimeout = null;

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

    function ensureQuickAnswerStyles() {
        if (document.getElementById('autocvapply-quick-answer-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'autocvapply-quick-answer-styles';
        style.textContent = `
            #autocvapply-quick-answer-btn {
                position: absolute;
                z-index: 2147483646;
                display: none;
                align-items: center;
                gap: 6px;
                padding: 6px 10px;
                border: 2px solid #1b365d;
                background: #c8102e;
                color: #fff;
                font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 4px 4px 0 rgb(27 54 93 / 18%);
                user-select: none;
            }
            #autocvapply-quick-answer-btn:hover {
                background: #a50d25;
            }
            #autocvapply-quick-answer-btn.is-visible {
                display: inline-flex;
            }
            #autocvapply-quick-answer-btn.is-loading {
                opacity: 0.75;
                cursor: wait;
            }
        `;
        document.head.appendChild(style);
    }

    function ensureQuickAnswerButton() {
        if (quickAnswerButton) {
            return quickAnswerButton;
        }

        ensureQuickAnswerStyles();

        quickAnswerButton = document.createElement('button');
        quickAnswerButton.id = 'autocvapply-quick-answer-btn';
        quickAnswerButton.type = 'button';
        quickAnswerButton.textContent = 'Quick Answer';
        quickAnswerButton.addEventListener('mousedown', (event) => {
            event.preventDefault();
        });
        quickAnswerButton.addEventListener('click', async () => {
            quickAnswerButton.classList.add('is-loading');
            quickAnswerButton.textContent = 'Drafting…';

            try {
                await chrome.runtime.sendMessage({ type: 'QUICK_ANSWER_FOCUSED' });
                quickAnswerButton.textContent = 'Applied';
                setTimeout(() => hideQuickAnswerButton(), 1200);
            } catch {
                quickAnswerButton.textContent = 'Quick Answer';
            } finally {
                quickAnswerButton.classList.remove('is-loading');
            }
        });

        document.body.appendChild(quickAnswerButton);

        return quickAnswerButton;
    }

    function positionQuickAnswerButton(element) {
        const button = ensureQuickAnswerButton();
        const rect = element.getBoundingClientRect();
        const top = rect.bottom + window.scrollY + 6;
        const left = Math.max(8, rect.left + window.scrollX);
        const maxLeft = window.scrollX + document.documentElement.clientWidth - button.offsetWidth - 8;

        button.style.top = `${top}px`;
        button.style.left = `${Math.min(left, maxLeft)}px`;
        button.classList.add('is-visible');
    }

    function hideQuickAnswerButton() {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }

        quickAnswerButton?.classList.remove('is-visible', 'is-loading');

        if (quickAnswerButton) {
            quickAnswerButton.textContent = 'Quick Answer';
        }

        activeElement = null;
    }

    async function saveFocusedField(element) {
        const payload = fieldPayload(element);

        try {
            if (!payload) {
                await chrome.storage.session.remove(FOCUSED_FIELD_KEY);
                hideQuickAnswerButton();

                return;
            }

            await chrome.storage.session.set({ [FOCUSED_FIELD_KEY]: payload });
            activeElement = element;
            positionQuickAnswerButton(element);
        } catch {
            hideQuickAnswerButton();
        }
    }

    function bindFocusTracking(root = document) {
        if (location.protocol === 'chrome:'
            || location.protocol === 'chrome-extension:'
            || location.protocol === 'about:'
            || location.protocol === 'moz-extension:') {
            return;
        }

        root.addEventListener('focusin', (event) => {
            const target = event.target;

            if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
                return;
            }

            if (target.type === 'hidden' || target.type === 'file' || target.type === 'checkbox' || target.type === 'radio') {
                return;
            }

            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }

            saveFocusedField(target).catch(() => {});
        }, true);

        root.addEventListener('focusout', (event) => {
            const target = event.target;

            if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
                return;
            }

            hideTimeout = setTimeout(() => {
                if (activeElement === target) {
                    hideQuickAnswerButton();
                }
            }, 150);
        }, true);

        window.addEventListener('scroll', () => {
            if (activeElement) {
                positionQuickAnswerButton(activeElement);
            }
        }, true);
    }

    return { bindFocusTracking, FOCUSED_FIELD_KEY };
})();
