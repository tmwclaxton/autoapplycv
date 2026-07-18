import { CHROME_WEB_STORE_URL } from '@/lib/site';

export const extensionDownloads = {
    chrome: '/extension/autoapplycv-chrome.zip',
    firefox: '/extension/autoapplycv-firefox.zip',
    /** Chrome Web Store listing for Chrome (and Chromium store installs). */
    chromeWebStore: CHROME_WEB_STORE_URL,
    /** @deprecated Use chrome URL; kept for older links. */
    legacy: '/extension/autoapplycv.zip',
} as const;
