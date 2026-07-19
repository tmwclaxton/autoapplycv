import { router } from '@inertiajs/vue3';
import {
    choicesToGtagConsent,
    isAnalyticsConsentGranted,
} from '@/lib/cookieConsent';
import type { ConsentChoices } from '@/lib/cookieConsent';

declare global {
    interface Window {
        gtag?: (...args: unknown[]) => void;
        dataLayer?: unknown[];
    }
}

function measurementId(): string | null {
    const script = document.querySelector<HTMLScriptElement>(
        'script[src*="googletagmanager.com/gtag/js?id="]',
    );

    if (!script?.src) {
        return null;
    }

    try {
        return new URL(script.src).searchParams.get('id');
    } catch {
        return null;
    }
}

function trackPageView(pagePath: string): void {
    const id = measurementId();

    if (!id || typeof window.gtag !== 'function') {
        return;
    }

    window.gtag('config', id, {
        page_path: pagePath,
    });
}

let analyticsConsentGranted = false;
let navigateListenerBound = false;

/**
 * Push Consent Mode update and gate SPA pageviews on analytics consent.
 */
export function applyGtagConsent(choices: ConsentChoices): void {
    analyticsConsentGranted = isAnalyticsConsentGranted(choices);

    if (typeof window.gtag !== 'function') {
        return;
    }

    window.gtag('consent', 'update', choicesToGtagConsent(choices));
}

/**
 * Fire a pageview for the current URL when analytics consent is granted.
 */
export function trackCurrentPageViewIfAllowed(choices: ConsentChoices): void {
    if (!isAnalyticsConsentGranted(choices)) {
        return;
    }

    trackPageView(window.location.pathname + window.location.search);
}

/**
 * GA4 pageviews for Inertia SPA navigations (and the initial paint).
 * Blade loads gtag with send_page_view: false so this is the only page_view source.
 * Pageviews are skipped until analytics consent is granted.
 */
export function initializeGoogleAnalytics(): void {
    if (typeof window.gtag !== 'function') {
        return;
    }

    if (navigateListenerBound) {
        return;
    }

    navigateListenerBound = true;

    router.on('navigate', (event) => {
        if (!analyticsConsentGranted) {
            return;
        }

        trackPageView(event.detail.page.url);
    });
}
