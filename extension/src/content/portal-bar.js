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
            <div class="autocvapply-portal-inner postbox-panel">
                <div class="autocvapply-portal-stamp postbox-stamp" aria-hidden="true">CV</div>
                <span class="autocvapply-portal-brand">AutoCVApply</span>
                <button type="button" class="postbox-btn compact" id="autocvapply-draft-all-btn">Draft all</button>
                <button type="button" class="postbox-btn-outline compact" id="autocvapply-open-panel-btn">Sidebar</button>
                <span id="autocvapply-portal-status"></span>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            @import url('https://fonts.bunny.net/css?family=dm-sans:400,600,700');
            #autocvapply-portal-bar {
                --postbox-red: #c8102e;
                --postbox-navy: #1b365d;
                --postbox-paper: #fafaf8;
                --postbox-grey: #e8e6e1;
                --postbox-surface: #ffffff;
                --postbox-panel-shadow: 4px 4px 0 rgb(27 54 93 / 8%);
                --postbox-stamp-shadow: 2px 2px 0 rgb(200 16 46 / 20%);
                position: fixed;
                bottom: 80px;
                right: 24px;
                z-index: 999998;
                font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
            }
            #autocvapply-portal-bar .autocvapply-portal-inner {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                max-width: min(92vw, 560px);
                border: 2px solid var(--postbox-navy);
                background: var(--postbox-surface);
                box-shadow: var(--postbox-panel-shadow);
            }
            #autocvapply-portal-bar .autocvapply-portal-stamp {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                border: 2px solid var(--postbox-red);
                background: var(--postbox-surface);
                color: var(--postbox-red);
                transform: rotate(-4deg);
                box-shadow: var(--postbox-stamp-shadow);
                font-size: 9px;
                font-weight: 700;
                letter-spacing: -0.04em;
                text-transform: uppercase;
            }
            #autocvapply-portal-bar .postbox-btn,
            #autocvapply-portal-bar .postbox-btn-outline {
                width: auto;
                padding: 0.45rem 0.75rem;
                font-size: 12px;
                font-weight: 700;
                white-space: nowrap;
                cursor: pointer;
                border: 2px solid var(--postbox-navy);
            }
            #autocvapply-portal-bar .postbox-btn {
                background: var(--postbox-red);
                color: #fff;
            }
            #autocvapply-portal-bar .postbox-btn-outline {
                background: var(--postbox-surface);
                color: var(--postbox-navy);
            }
            #autocvapply-portal-status {
                font-size: 11px;
                color: #6b6b6b;
                margin-left: 2px;
                max-width: 140px;
            }
            .autocvapply-portal-brand {
                font-size: 12px;
                font-weight: 700;
                color: var(--postbox-navy);
                letter-spacing: -0.02em;
            }
            @media (prefers-color-scheme: dark) {
                #autocvapply-portal-bar {
                    --postbox-navy: #8eb4d8;
                    --postbox-grey: #1a2030;
                    --postbox-surface: #161b27;
                    --postbox-panel-shadow: 4px 4px 0 rgb(0 0 0 / 30%);
                }
                #autocvapply-portal-status { color: #94a3b8; }
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
