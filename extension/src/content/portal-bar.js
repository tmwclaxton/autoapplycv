/**
 * On-page draft bar (GrantGunner-style portal footer, simplified).
 */
const AutoCVApplyPortalBar = (() => {
    let barElement = null;
    let statusElement = null;

    function ensureBar() {
        if (barElement) {
            return barElement;
        }

        barElement = document.createElement('div');
        barElement.id = 'autocvapply-portal-bar';
        barElement.innerHTML = `
            <div class="autocvapply-portal-inner">
                <span class="autocvapply-portal-brand">AutoCVApply</span>
                <button type="button" id="autocvapply-draft-all-btn">Draft all empty fields</button>
                <button type="button" id="autocvapply-open-panel-btn">Side panel</button>
                <span id="autocvapply-portal-status"></span>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            #autocvapply-portal-bar {
                position: fixed;
                bottom: 80px;
                right: 24px;
                z-index: 999998;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            #autocvapply-portal-bar .autocvapply-portal-inner {
                display: flex;
                align-items: center;
                gap: 8px;
                background: #0f172a;
                color: #f8fafc;
                padding: 10px 14px;
                border-radius: 14px;
                box-shadow: 0 8px 30px rgba(15, 23, 42, 0.35);
                max-width: min(92vw, 520px);
            }
            #autocvapply-portal-bar button {
                border: 0;
                border-radius: 999px;
                padding: 8px 14px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
            }
            #autocvapply-draft-all-btn {
                background: linear-gradient(135deg, #2563eb, #1d4ed8);
                color: white;
            }
            #autocvapply-open-panel-btn {
                background: rgba(255,255,255,0.12);
                color: #f8fafc;
            }
            #autocvapply-portal-status {
                font-size: 12px;
                color: #94a3b8;
                margin-left: 4px;
            }
            .autocvapply-portal-brand {
                font-size: 12px;
                font-weight: 700;
                color: #93c5fd;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(barElement);

        statusElement = barElement.querySelector('#autocvapply-portal-status');

        barElement.querySelector('#autocvapply-draft-all-btn').addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'START_DRAFT_ALL' }).catch(() => {});
        });

        barElement.querySelector('#autocvapply-open-panel-btn').addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {});
        });

        return barElement;
    }

    function show(onJobSite = true) {
        if (!onJobSite) {
            return;
        }

        ensureBar();
    }

    function setStatus(text) {
        if (!statusElement) {
            ensureBar();
        }

        statusElement.textContent = text || '';
    }

    function hide() {
        barElement?.remove();
        barElement = null;
        statusElement = null;
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'DRAFT_ALL_PROGRESS') {
            setStatus(message.message || '');
        }

        if (message.type === 'DRAFT_ALL_DONE') {
            setStatus(message.message || 'Draft complete');
            setTimeout(() => setStatus(''), 5000);
        }
    });

    return { hide, setStatus, show };
})();
