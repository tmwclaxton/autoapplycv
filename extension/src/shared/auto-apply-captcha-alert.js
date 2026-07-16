/**
 * CAPTCHA / security-check alert helpers for Auto Apply.
 * Side panel plays a one-shot ping when a captcha pause starts.
 */

/**
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @param {string|null|undefined} [reason]
 * @returns {boolean}
 */
export function isCaptchaAutoApplyPause(pauseContext, reason = null) {
    return Boolean(pauseContext?.captcha) || reason === 'captcha';
}

/**
 * Stable key so we ping once per captcha pause, not on every status poll/restore.
 *
 * @param {import('./auto-apply-session.js').AutoApplyPauseContext|null|undefined} pauseContext
 * @returns {string|null}
 */
export function buildCaptchaAlertKey(pauseContext) {
    if (!isCaptchaAutoApplyPause(pauseContext)) {
        return null;
    }

    return [
        pauseContext.job?.jobId || '',
        pauseContext.stepFingerprint || '',
        pauseContext.tabId || '',
        'captcha',
    ].join('|');
}

/**
 * @param {string|null|undefined} alertKey
 * @param {string|null|undefined} lastAlertKey
 * @returns {boolean}
 */
export function shouldPlayCaptchaAlert(alertKey, lastAlertKey = null) {
    if (!alertKey) {
        return false;
    }

    return alertKey !== lastAlertKey;
}

/**
 * Loud short Web Audio beeps so the user hears CAPTCHA pauses even when mp3 autoplay is blocked.
 *
 * @param {{
 *   AudioContextCtor?: typeof AudioContext,
 *   beepCount?: number,
 *   frequencyHz?: number,
 *   volume?: number,
 * }} [options]
 * @returns {boolean} true when a tone was scheduled
 */
export function playCaptchaAlertBeep(options = {}) {
    const AudioContextCtor =
        options.AudioContextCtor
        || globalThis.AudioContext
        || globalThis.webkitAudioContext;

    if (typeof AudioContextCtor !== 'function') {
        return false;
    }

    const beepCount = Math.max(1, Math.min(5, Number(options.beepCount) || 4));
    const frequencyHz = Number(options.frequencyHz) || 980;
    const volume = Math.min(1, Math.max(0.1, Number(options.volume) || 1));

    try {
        const context = new AudioContextCtor();
        const now = context.currentTime;

        for (let index = 0; index < beepCount; index += 1) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const startAt = now + index * 0.22;
            const endAt = startAt + 0.12;

            oscillator.type = 'sine';
            oscillator.frequency.value = frequencyHz;
            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(startAt);
            oscillator.stop(endAt + 0.01);
        }

        const closeAtMs = Math.ceil((beepCount * 0.22 + 0.2) * 1000);
        setTimeout(() => {
            void context.close?.().catch?.(() => {});
        }, closeAtMs);

        return true;
    } catch {
        return false;
    }
}

/**
 * Play mp3 ping when available; always try Web Audio beeps for CAPTCHA.
 *
 * @param {{
 *   getSoundUrl?: () => string|null,
 *   AudioContextCtor?: typeof AudioContext,
 *   AudioCtor?: typeof Audio,
 * }} [options]
 * @returns {{ beep: boolean, mp3: boolean }}
 */
export function playCaptchaAlertSound(options = {}) {
    const beep = playCaptchaAlertBeep({
        AudioContextCtor: options.AudioContextCtor,
    });

    let mp3 = false;
    const AudioCtor = options.AudioCtor || globalThis.Audio;
    const soundUrl =
        typeof options.getSoundUrl === 'function' ? options.getSoundUrl() : null;

    if (typeof AudioCtor === 'function' && soundUrl) {
        try {
            const audio = new AudioCtor(soundUrl);
            audio.volume = 0.9;
            void audio.play?.().then(() => {
                mp3 = true;
            }).catch(() => {});
            mp3 = true;
        } catch {
            mp3 = false;
        }
    }

    return { beep, mp3 };
}
