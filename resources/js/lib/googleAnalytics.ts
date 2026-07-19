import { router } from '@inertiajs/vue3';

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

/**
 * GA4 pageviews for Inertia SPA navigations (and the initial paint).
 * Blade loads gtag with send_page_view: false so this is the only page_view source.
 */
export function initializeGoogleAnalytics(): void {
    if (typeof window.gtag !== 'function') {
        return;
    }

    router.on('navigate', (event) => {
        trackPageView(event.detail.page.url);
    });
}
