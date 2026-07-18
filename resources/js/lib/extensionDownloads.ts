import { CHROME_WEB_STORE_URL } from '@/lib/site';
import extensionManifest from '../../../extension/manifest.json';

/** Same version as extension/manifest.json (bundled at build time). */
export const extensionVersion: string = extensionManifest.version;

function versionedExtensionZip(path: string): string {
    return `${path}?v=${encodeURIComponent(extensionVersion)}`;
}

export const extensionDownloads = {
    chrome: versionedExtensionZip('/extension/autoapplycv-chrome.zip'),
    firefox: versionedExtensionZip('/extension/autoapplycv-firefox.zip'),
    /** Chrome Web Store listing for Chrome (and Chromium store installs). */
    chromeWebStore: CHROME_WEB_STORE_URL,
    /** @deprecated Use chrome URL; kept for older links. */
    legacy: versionedExtensionZip('/extension/autoapplycv.zip'),
} as const;
