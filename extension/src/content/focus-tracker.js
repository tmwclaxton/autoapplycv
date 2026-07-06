/**
 * Track focused form fields and show an on-page Quick draft button.
 */
const AutoCVApplyFocusTracker = (() => {
    const FOCUSED_FIELD_KEY = 'focusedField';
    const HOST_ID = 'autocvapply-quick-draft';
    const BUTTON_LABEL = 'Quick draft';

    let hostElement = null;
    let shadowRoot = null;
    let draftButton = null;
    let activeElement = null;
    let hideTimeout = null;
    let authenticated = false;

    function mapApplicationSettingsForAssist(settings) {
        const merged = {
            phone_country_code: '+44',
            years_of_experience: '2',
            expected_salary_weekly: '',
            expected_salary_monthly: '',
            expected_salary_yearly: '',
            visa_sponsorship: 'no',
            legally_authorized: 'yes',
            willing_to_relocate: 'yes',
            drivers_license: 'yes',
            ...(settings && typeof settings === 'object' ? settings : {}),
        };

        return {
            phoneCountryCode: merged.phone_country_code,
            yearsOfExperience: String(merged.years_of_experience ?? '2'),
            expectedSalaryWeekly: merged.expected_salary_weekly ?? '',
            expectedSalaryMonthly: merged.expected_salary_monthly ?? '',
            expectedSalaryYearly: merged.expected_salary_yearly ?? '',
            visaSponsorship: merged.visa_sponsorship ?? 'no',
            legallyAuthorized: merged.legally_authorized ?? 'yes',
            willingToRelocate: merged.willing_to_relocate ?? 'yes',
            driversLicense: merged.drivers_license ?? 'yes',
        };
    }

    function isRestrictedPage() {
        const protocol = location.protocol;

        return protocol === 'chrome:'
            || protocol === 'chrome-extension:'
            || protocol === 'about:'
            || protocol === 'moz-extension:';
    }

    function isAppDashboardPage() {
        const host = location.hostname.replace(/^www\./, '');

        return host === 'autocvapply.com'
            || host === 'localhost'
            || host === '127.0.0.1';
    }

    function extensionContext() {
        return typeof AutoCVApplyExtensionContext !== 'undefined'
            ? AutoCVApplyExtensionContext
            : null;
    }

    function ensureExtensionContextOrTeardown() {
        const ctx = extensionContext();

        if (!ctx) {
            hideQuickDraftButton();

            return false;
        }

        if (ctx.isExtensionContextValid()) {
            return true;
        }

        hideQuickDraftButton();

        return false;
    }

    async function checkAuthenticated() {
        if (!ensureExtensionContextOrTeardown()) {
            authenticated = false;

            return false;
        }

        try {
            const ctx = extensionContext();
            const response = ctx
                ? await ctx.safeRuntimeSend({ type: 'GET_AUTH_STATUS' })
                : await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });
            authenticated = response?.isAuthenticated === true;

            return authenticated;
        } catch {
            authenticated = false;

            return false;
        }
    }

    async function loadProfilePayload() {
        if (!ensureExtensionContextOrTeardown()) {
            return null;
        }

        try {
            const ctx = extensionContext();

            return await new Promise((resolve, reject) => {
                const onResponse = (response) => {
                    if (response?.error) {
                        reject(new Error(response.error));
                    } else {
                        resolve(response);
                    }
                };

                if (ctx) {
                    ctx.safeRuntimeSendCallback({ type: 'GET_PROFILE' }, onResponse);

                    return;
                }

                chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        onResponse(response);
                    }
                });
            });
        } catch {
            return null;
        }
    }

    async function buildFieldPayload(element) {
        if (typeof AutoCVApplyFormHeuristics === 'undefined'
            || !AutoCVApplyFormHeuristics.isQuickDraftEligible(element, document)) {
            return null;
        }

        const profilePayload = await loadProfilePayload();

        if (!profilePayload?.profile) {
            return null;
        }

        const settings = mapApplicationSettingsForAssist(profilePayload.application_settings);

        if (typeof AutoCVApplyFieldInventory !== 'undefined') {
            const inventoryField = AutoCVApplyFieldInventory.resolveDraftableFieldForElement(
                document,
                element,
                profilePayload,
                settings,
            );

            if (inventoryField) {
                return inventoryField;
            }
        }

        const label = AutoCVApplyFormHeuristics.getQuestionLabel(element);

        if (label.length < 3) {
            return null;
        }

        return {
            label,
            field_type: AutoCVApplyFormHeuristics.getFieldType(element),
            max_chars: element.maxLength > 0 ? element.maxLength : undefined,
            updated_at: Date.now(),
        };
    }

    function ensureButtonHost() {
        if (hostElement?.isConnected && draftButton?.isConnected) {
            return hostElement;
        }

        hostElement?.remove();

        hostElement = document.createElement('div');
        hostElement.id = HOST_ID;
        hostElement.setAttribute('data-autocvapply-ui', 'quick-draft');

        shadowRoot = hostElement.attachShadow({ mode: 'closed' });
        shadowRoot.innerHTML = `
            <style>
                :host {
                    all: initial;
                }
                #quick-draft-btn {
                    all: unset;
                    box-sizing: border-box;
                    display: none;
                    align-items: center;
                    justify-content: center;
                    padding: 6px 10px;
                    border: 2px solid #1b365d;
                    background: #c8102e;
                    color: #ffffff;
                    font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
                    font-size: 12px;
                    font-weight: 700;
                    line-height: 1.2;
                    white-space: nowrap;
                    cursor: pointer;
                    box-shadow: 4px 4px 0 rgb(27 54 93 / 18%);
                    user-select: none;
                    -webkit-user-select: none;
                }
                #quick-draft-btn.is-visible {
                    display: inline-flex;
                }
                #quick-draft-btn:hover:not(:disabled) {
                    filter: brightness(1.06);
                }
                #quick-draft-btn:disabled {
                    opacity: 0.75;
                    cursor: wait;
                }
                @media (prefers-color-scheme: dark) {
                    #quick-draft-btn {
                        border-color: #8eb4d8;
                        box-shadow: 4px 4px 0 rgb(0 0 0 / 30%);
                    }
                }
            </style>
            <button type="button" id="quick-draft-btn">${BUTTON_LABEL}</button>
        `;

        Object.assign(hostElement.style, {
            position: 'absolute',
            zIndex: '2147483646',
            pointerEvents: 'auto',
            display: 'none',
        });

        document.body.appendChild(hostElement);

        draftButton = shadowRoot.getElementById('quick-draft-btn');

        if (!draftButton) {
            hostElement.remove();
            hostElement = null;
            shadowRoot = null;
            draftButton = null;

            return null;
        }

        draftButton.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        draftButton.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (draftButton.disabled) {
                return;
            }

            draftButton.disabled = true;
            draftButton.textContent = 'Drafting…';

            try {
                if (!ensureExtensionContextOrTeardown()) {
                    return;
                }

                const ctx = extensionContext();
                const response = ctx
                    ? await ctx.safeRuntimeSend({ type: 'QUICK_ANSWER_FOCUSED' })
                    : await chrome.runtime.sendMessage({ type: 'QUICK_ANSWER_FOCUSED' });

                if (response?.error) {
                    draftButton.textContent = 'Try again';
                    setTimeout(() => {
                        if (draftButton) {
                            draftButton.textContent = BUTTON_LABEL;
                        }
                    }, 1800);

                    return;
                }

                draftButton.textContent = 'Applied';
                setTimeout(() => hideQuickDraftButton(), 1200);
            } catch {
                draftButton.textContent = BUTTON_LABEL;
            } finally {
                draftButton.disabled = false;
            }
        });

        return hostElement;
    }

    function positionQuickDraftButton(element) {
        const host = ensureButtonHost();

        if (!host || !draftButton) {
            return;
        }

        const rect = element.getBoundingClientRect();
        const top = rect.bottom + window.scrollY + 6;
        const left = Math.max(8, rect.left + window.scrollX);
        const buttonWidth = draftButton.offsetWidth || 96;
        const maxLeft = window.scrollX + document.documentElement.clientWidth - buttonWidth - 8;

        host.style.top = `${top}px`;
        host.style.left = `${Math.min(left, maxLeft)}px`;
        host.style.display = 'block';
        draftButton.classList.add('is-visible');
    }

    function hideQuickDraftButton() {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }

        if (hostElement) {
            hostElement.style.display = 'none';
        }

        draftButton?.classList.remove('is-visible');

        if (draftButton) {
            draftButton.disabled = false;
            draftButton.textContent = BUTTON_LABEL;
        }

        activeElement = null;
    }

    function isFocusInsideQuickDraft(relatedTarget) {
        if (!relatedTarget || !hostElement) {
            return false;
        }

        return relatedTarget === hostElement || hostElement.contains(relatedTarget);
    }

    async function saveFocusedField(element) {
        const isAuthenticated = await checkAuthenticated();

        if (!isAuthenticated) {
            hideQuickDraftButton();

            return;
        }

        const payload = await buildFieldPayload(element);

        try {
            const ctx = extensionContext();

            if (!payload) {
                if (ctx) {
                    await ctx.safeStorageSessionRemove(FOCUSED_FIELD_KEY);
                } else {
                    await chrome.storage.session.remove(FOCUSED_FIELD_KEY);
                }

                hideQuickDraftButton();

                return;
            }

            const stored = ctx
                ? await ctx.safeStorageSessionSet({ [FOCUSED_FIELD_KEY]: payload })
                : await chrome.storage.session.set({ [FOCUSED_FIELD_KEY]: payload });

            if (ctx && !stored) {
                hideQuickDraftButton();

                return;
            }

            activeElement = element;
            positionQuickDraftButton(element);
        } catch {
            hideQuickDraftButton();
        }
    }

    function bindFocusTracking(root = document) {
        if (isRestrictedPage() || isAppDashboardPage()) {
            return;
        }

        void checkAuthenticated();

        root.addEventListener('focusin', (event) => {
            const target = event.target;

            if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
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

            if (isFocusInsideQuickDraft(event.relatedTarget)) {
                return;
            }

            hideTimeout = setTimeout(() => {
                if (activeElement === target && !isFocusInsideQuickDraft(document.activeElement)) {
                    hideQuickDraftButton();
                }
            }, 150);
        }, true);

        const reposition = () => {
            if (activeElement) {
                positionQuickDraftButton(activeElement);
            }
        };

        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition, true);

        const authMessageListener = (message) => {
            if (message.type === 'AUTH_STATE_CHANGED') {
                void checkAuthenticated().then((isAuthenticated) => {
                    if (!isAuthenticated) {
                        hideQuickDraftButton();
                    }
                });
            }
        };

        if (extensionContext()?.safeOnMessageAddListener(authMessageListener) !== true) {
            try {
                chrome.runtime.onMessage.addListener(authMessageListener);
            } catch {
                // Ignore listener registration when the extension was reloaded.
            }
        }
    }

    return { bindFocusTracking, FOCUSED_FIELD_KEY };
})();
