import { router } from '@inertiajs/vue3';
import {
    choicesToGtagConsent,
    isAdvertisingConsentGranted,
    isAnalyticsConsentGranted,
} from '@/lib/cookieConsent';
import type { ConsentChoices } from '@/lib/cookieConsent';

declare global {
    interface Window {
        gtag?: (...args: unknown[]) => void;
        dataLayer?: unknown[];
    }
}

export type PurchaseConversion = {
    transaction_id: string;
    value: number;
    currency: string;
    item_id: string;
    item_name: string;
};

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

function purchaseStorageKey(transactionId: string): string {
    return `autocvapply_ga_purchase_${transactionId}`;
}

function hasTrackedPurchase(transactionId: string): boolean {
    try {
        return (
            sessionStorage.getItem(purchaseStorageKey(transactionId)) === '1'
        );
    } catch {
        return false;
    }
}

function markPurchaseTracked(transactionId: string): void {
    try {
        sessionStorage.setItem(purchaseStorageKey(transactionId), '1');
    } catch {
        // sessionStorage may be unavailable
    }
}

/**
 * Fire a GA4/Google Ads purchase conversion after paid checkout succeeds.
 * Requires analytics or advertising consent. Dedupes by transaction_id for the tab session.
 */
export function trackPurchaseConversion(
    conversion: PurchaseConversion,
    choices: ConsentChoices,
): boolean {
    if (
        !isAdvertisingConsentGranted(choices) &&
        !isAnalyticsConsentGranted(choices)
    ) {
        return false;
    }

    if (typeof window.gtag !== 'function') {
        return false;
    }

    if (
        !conversion.transaction_id ||
        hasTrackedPurchase(conversion.transaction_id)
    ) {
        return false;
    }

    markPurchaseTracked(conversion.transaction_id);

    window.gtag('event', 'purchase', {
        transaction_id: conversion.transaction_id,
        value: conversion.value,
        currency: conversion.currency,
        items: [
            {
                item_id: conversion.item_id,
                item_name: conversion.item_name,
                price: conversion.value,
                quantity: 1,
            },
        ],
    });

    return true;
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
