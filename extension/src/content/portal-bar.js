/**
 * On-page Draft All control — isolated from host page CSS via shadow DOM.
 */
const AutoCVApplyPortalBar = (() => {
    let hostElement = null;
    let shadowRoot = null;
    let fillButton = null;
    let statusElement = null;
    let fillHandler = null;
    let fillRunning = false;

    function configure({ onFill }) {
        fillHandler = onFill;
    }

    function ensureBar() {
        if (hostElement?.isConnected && fillButton?.isConnected) {
            return hostElement;
        }

        if (!document.body) {
            return null;
        }

        hostElement?.remove();

        hostElement = document.createElement('div');
        hostElement.id = 'autocvapply-portal-bar';
        hostElement.setAttribute('data-autocvapply-ui', 'portal');

        shadowRoot = hostElement.attachShadow({ mode: 'closed' });
        shadowRoot.innerHTML = `
            <style>
                :host {
                    all: initial;
                }
                .bar {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
                }
                #draft-btn {
                    all: unset;
                    box-sizing: border-box;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 10px 16px;
                    border: 2px solid #1b365d;
                    background: #c8102e;
                    color: #ffffff;
                    font-family: inherit;
                    font-size: 13px;
                    font-weight: 700;
                    line-height: 1.2;
                    white-space: nowrap;
                    cursor: pointer;
                    box-shadow: 4px 4px 0 rgb(27 54 93 / 8%);
                    user-select: none;
                    -webkit-user-select: none;
                }
                #draft-btn:hover:not(:disabled) {
                    filter: brightness(1.06);
                }
                #draft-btn:disabled {
                    opacity: 0.72;
                    cursor: wait;
                }
                #status {
                    font-size: 11px;
                    line-height: 1.3;
                    color: #6b6b6b;
                    max-width: 200px;
                }
                #status:empty {
                    display: none;
                }
                @media (prefers-color-scheme: dark) {
                    #draft-btn {
                        border-color: #8eb4d8;
                        box-shadow: 4px 4px 0 rgb(0 0 0 / 30%);
                    }
                    #status {
                        color: #94a3b8;
                    }
                }
            </style>
            <div class="bar">
                <button type="button" id="draft-btn">Draft All</button>
                <span id="status"></span>
            </div>
        `;

        Object.assign(hostElement.style, {
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            left: 'auto',
            zIndex: '2147483647',
            pointerEvents: 'auto',
            display: 'none',
        });

        document.body.appendChild(hostElement);

        fillButton = shadowRoot.getElementById('draft-btn');
        statusElement = shadowRoot.getElementById('status');

        if (!fillButton) {
            hostElement.remove();
            hostElement = null;
            shadowRoot = null;
            fillButton = null;
            statusElement = null;

            return null;
        }

        fillButton.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (!fillHandler || fillRunning) {
                return;
            }

            if (typeof AutoCVApplyDebugLog !== 'undefined') {
                AutoCVApplyDebugLog.logInfo('content', 'draft-all.start', 'Draft All button clicked', {
                    url: window.location.href.split('?')[0],
                });
            }

            fillRunning = true;
            fillButton.disabled = true;
            setStatus('Filling from profile…');

            try {
                const result = await fillHandler();

                if (result?.ok === false) {
                    finishFill(result.message || 'Fill failed.');
                } else {
                    finishFill(result?.message || 'Fill complete.');
                }
            } catch (error) {
                finishFill(error?.message || 'Fill failed.');
            }
        });

        return hostElement;
    }

    function update({ visible = false, sidebarOpen = false }) {
        if (!visible || !sidebarOpen || !fillHandler) {
            hide();

            return;
        }

        if (!ensureBar()) {
            hide();

            return;
        }

        hostElement.style.display = 'block';
        hostElement.style.left = '24px';
        hostElement.style.right = 'auto';

        if (!fillRunning && fillButton?.disabled) {
            fillButton.disabled = false;
        }
    }

    function setStatus(text) {
        if (!statusElement) {
            ensureBar();
        }

        if (statusElement) {
            statusElement.textContent = text || '';
        }
    }

    function finishFill(message) {
        fillRunning = false;

        if (fillButton) {
            fillButton.disabled = false;
        }

        setStatus(message || 'Fill complete.');
        setTimeout(() => setStatus(''), 5000);
    }

    function hide() {
        if (hostElement) {
            hostElement.style.display = 'none';
        }

        fillRunning = false;

        if (fillButton && !fillRunning) {
            fillButton.disabled = false;
        }
    }

    function destroy() {
        hostElement?.remove();
        hostElement = null;
        shadowRoot = null;
        fillButton = null;
        statusElement = null;
        fillRunning = false;
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'DRAFT_ALL_PROGRESS' && fillRunning) {
            setStatus(message.message || '');
        }
    });

    return { configure, destroy, hide, setStatus, update };
})();
