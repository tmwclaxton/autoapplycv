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
        __autocvapplyGoogleAdsConversions?: {
            sign_up?: string;
            purchase?: string;
        };
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

function adsConversionSendTo(kind: 'sign_up' | 'purchase'): string | null {
    const sendTo = window.__autocvapplyGoogleAdsConversions?.[kind]?.trim();

    return sendTo || null;
}

/**
 * Fire a native Google Ads website conversion (AW- send_to).
 * Requires advertising consent so ad_storage / ad_user_data are granted.
 */
function trackAdsConversion(
    kind: 'sign_up' | 'purchase',
    choices: ConsentChoices,
    params: Record<string, unknown> = {},
): boolean {
    if (!isAdvertisingConsentGranted(choices)) {
        return false;
    }

    if (typeof window.gtag !== 'function') {
        return false;
    }

    const sendTo = adsConversionSendTo(kind);

    if (!sendTo) {
        return false;
    }

    window.gtag('event', 'conversion', {
        send_to: sendTo,
        ...params,
    });

    return true;
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

    const purchaseParams = {
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
    };

    // Standard GA4 ecommerce purchase (and legacy GA4-imported Ads action).
    window.gtag('event', 'purchase', purchaseParams);

    // Legacy GA4 custom purchase event name still used in some reports.
    window.gtag('event', 'conversion_event_purchase', purchaseParams);

    // Native Google Ads website conversion (records in Ads without GA4 import lag).
    trackAdsConversion('purchase', choices, {
        transaction_id: conversion.transaction_id,
        value: conversion.value,
        currency: conversion.currency,
    });

    return true;
}

function signUpStorageKey(transactionId: string): string {
    return `autocvapply_ga_sign_up_${transactionId}`;
}

/**
 * Fire GA4 / Google Ads sign-up conversion (new account).
 * Also emits ads_conversion_Sign_up_1 for the Ads primary action of that name.
 */
export function trackSignUpConversion(
    transactionId: string,
    choices: ConsentChoices,
    method = 'WorkOS',
): boolean {
    if (
        !isAdvertisingConsentGranted(choices) &&
        !isAnalyticsConsentGranted(choices)
    ) {
        return false;
    }

    if (typeof window.gtag !== 'function' || !transactionId) {
        return false;
    }

    try {
        if (sessionStorage.getItem(signUpStorageKey(transactionId)) === '1') {
            return false;
        }

        sessionStorage.setItem(signUpStorageKey(transactionId), '1');
    } catch {
        // sessionStorage may be unavailable
    }

    window.gtag('event', 'sign_up', {
        method,
        transaction_id: transactionId,
    });

    // Legacy GA4-imported Ads custom event (still useful in GA4).
    window.gtag('event', 'ads_conversion_Sign_up_1', {
        method,
        transaction_id: transactionId,
    });

    // Native Google Ads website conversion (records in Ads without GA4 import lag).
    trackAdsConversion('sign_up', choices, {
        transaction_id: transactionId,
    });

    return true;
}

/**
 * Bind a Google Ads click id so GA4 can attribute later conversion events.
 * Prefer landing with ?gclid=; this also sets the linker cookie for same-tab tests.
 */
export function bindGclidForTesting(gclid: string): boolean {
    const trimmed = gclid.trim();

    if (!trimmed || typeof window.gtag !== 'function') {
        return false;
    }

    window.gtag('set', { gclid: trimmed });

    try {
        const maxAge = 90 * 24 * 60 * 60;
        const stamp = Math.floor(Date.now() / 1000);
        document.cookie = `_gcl_aw=1.${stamp}.${encodeURIComponent(trimmed)};path=/;max-age=${maxAge};SameSite=Lax`;
    } catch {
        // cookie write may fail in restricted contexts
    }

    return true;
}

/**
 * Fire one-off test conversions for verifying Ads / GA4 (admin tooling).
 * Pass a real gclid from Ads click_view so events can attribute to the campaign.
 *
 * @returns Labels of events that were sent
 */
export function trackTestConversions(
    choices: ConsentChoices,
    count = 5,
    gclid: string | null = null,
): string[] {
    const batches = Math.max(1, Math.min(20, count));
    const sent: string[] = [];
    let purchases = 0;
    let signUps = 0;

    if (gclid?.trim()) {
        if (bindGclidForTesting(gclid)) {
            sent.push(`gclid bound`);
        }
    }

    for (let index = 0; index < batches; index++) {
        const stamp = `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;

        if (
            trackPurchaseConversion(
                {
                    transaction_id: `test_purchase_${stamp}`,
                    value: index % 2 === 0 ? 7 : 17,
                    currency: 'GBP',
                    item_id: index % 2 === 0 ? 'starter' : 'pro',
                    item_name:
                        index % 2 === 0
                            ? 'AutoCVApply Starter (test)'
                            : 'AutoCVApply Pro (test)',
                },
                choices,
            )
        ) {
            purchases += 1;
        }

        if (trackSignUpConversion(`test_sign_up_${stamp}`, choices, 'test')) {
            signUps += 1;
        }
    }

    if (purchases > 0) {
        sent.push(`purchase x${purchases}`);
        sent.push(`conversion_event_purchase x${purchases}`);

        if (adsConversionSendTo('purchase')) {
            sent.push(`AW purchase x${purchases}`);
        }
    }

    if (signUps > 0) {
        sent.push(`sign_up x${signUps}`);
        sent.push(`ads_conversion_Sign_up_1 x${signUps}`);

        if (adsConversionSendTo('sign_up')) {
            sent.push(`AW sign_up x${signUps}`);
        }
    }

    return sent;
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
