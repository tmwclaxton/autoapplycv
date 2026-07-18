import {
    buildAutoApplyManualResumePanelCopy,
    isManualResumeAutoApplyPause,
} from './auto-apply-pause-ui.js';

/**
 * Assist panel for CAPTCHA / login / identity pauses that need Resume (not Save & fill).
 *
 * @param {{
 *   showMessage: (text: string, type?: string) => void,
 *   getAutoApplyPauseContext?: () => object|null,
 * }} options
 */
export function initAutoApplyManualResumePanel({
    showMessage,
    getAutoApplyPauseContext = () => null,
}) {
    const sectionEl = document.getElementById(
        'auto-apply-manual-resume-section',
    );
    const titleEl = document.getElementById('auto-apply-manual-resume-title');
    const detailEl = document.getElementById('auto-apply-manual-resume-detail');
    const summaryEl = document.getElementById(
        'auto-apply-manual-resume-summary',
    );
    const resumeBtn = document.getElementById('auto-apply-manual-resume-btn');

    if (!sectionEl || !titleEl || !detailEl || !summaryEl || !resumeBtn) {
        return { renderManualResumePanel: () => {} };
    }

    let resumeInFlight = false;

    function renderManualResumePanel() {
        const pauseContext = getAutoApplyPauseContext();
        const copy = isManualResumeAutoApplyPause(pauseContext)
            ? buildAutoApplyManualResumePanelCopy(pauseContext)
            : null;

        if (!copy) {
            sectionEl.hidden = true;
            titleEl.textContent = '';
            detailEl.textContent = '';
            summaryEl.textContent = '';
            resumeBtn.disabled = false;
            resumeBtn.textContent = 'Resume';

            return;
        }

        sectionEl.hidden = false;
        titleEl.textContent = copy.title;
        detailEl.textContent = copy.detail;
        summaryEl.textContent = copy.summary;
        resumeBtn.textContent = copy.buttonLabel;
        resumeBtn.disabled = resumeInFlight;
    }

    async function resumeAutoApply() {
        if (resumeInFlight) {
            return;
        }

        resumeInFlight = true;
        resumeBtn.disabled = true;
        resumeBtn.textContent = 'Resuming…';

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'AUTO_APPLY_RESUME',
            });

            if (response?.error) {
                throw new Error(response.error);
            }

            showMessage('Resuming Auto Apply…', 'success');
            renderManualResumePanel();
        } catch (error) {
            showMessage(
                error.message || 'Could not resume Auto Apply.',
                'error',
            );
            resumeInFlight = false;
            resumeBtn.disabled = false;
            const pauseContext = getAutoApplyPauseContext();
            const copy = buildAutoApplyManualResumePanelCopy(pauseContext);
            resumeBtn.textContent = copy?.buttonLabel || 'Resume';
        }
    }

    resumeBtn.addEventListener('click', () => {
        void resumeAutoApply();
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (
            message.type === 'AUTO_APPLY_PAUSED' ||
            message.type === 'AUTO_APPLY_RESUMED' ||
            message.type === 'AUTO_APPLY_STATUS'
        ) {
            if (message.type === 'AUTO_APPLY_RESUMED') {
                resumeInFlight = false;
            }

            renderManualResumePanel();
        }
    });

    return { renderManualResumePanel };
}
