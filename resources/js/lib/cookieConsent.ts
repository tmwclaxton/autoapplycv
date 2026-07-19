/**
 * Cookie / Google consent categories and helpers.
 * UI defaults live here; gtag Consent Mode defaults are set in app.blade.php.
 */

export const CONSENT_STORAGE_KEY = 'autocvapply_cookie_consent';
export const CONSENT_SNOOZE_SESSION_KEY = 'autocvapply_cookie_consent_snooze';

export type ConsentCategoryId = 'functional' | 'analytics' | 'advertising';

export type GtagConsentKey =
    | 'analytics_storage'
    | 'ad_storage'
    | 'ad_user_data'
    | 'ad_personalization';

export type GtagConsentState = 'granted' | 'denied';

export interface ConsentCategory {
    id: ConsentCategoryId;
    label: string;
    description: string;
    /** Always on; not user-toggleable. */
    required: boolean;
    /** Preselected for optional categories (opt-out model). */
    defaultEnabled: boolean;
    /** gtag Consent Mode keys updated when this category changes. */
    gtagKeys: GtagConsentKey[];
}

export type ConsentChoices = Record<ConsentCategoryId, boolean>;

export interface StoredConsent {
    version: 1;
    decidedAt: string;
    choices: ConsentChoices;
}

export const CONSENT_CATEGORIES: ConsentCategory[] = [
    {
        id: 'functional',
        label: 'Essential',
        description:
            'Required for the site to work (sign-in, preferences, and security). Always on.',
        required: true,
        defaultEnabled: true,
        gtagKeys: [],
    },
    {
        id: 'analytics',
        label: 'Analytics',
        description:
            'Helps us understand how AutoCVApply is used via Google Analytics (page views and usage).',
        required: false,
        defaultEnabled: true,
        gtagKeys: ['analytics_storage'],
    },
    {
        id: 'advertising',
        label: 'Advertising',
        description:
            'Allows Google to measure ads and personalize advertising content.',
        required: false,
        defaultEnabled: true,
        gtagKeys: ['ad_storage', 'ad_user_data', 'ad_personalization'],
    },
];

export function defaultConsentChoices(): ConsentChoices {
    return CONSENT_CATEGORIES.reduce((acc, category) => {
        acc[category.id] = category.required ? true : category.defaultEnabled;

        return acc;
    }, {} as ConsentChoices);
}

export function rejectOptionalConsentChoices(): ConsentChoices {
    return CONSENT_CATEGORIES.reduce((acc, category) => {
        acc[category.id] = category.required;

        return acc;
    }, {} as ConsentChoices);
}

export function choicesToGtagConsent(
    choices: ConsentChoices,
): Record<GtagConsentKey, GtagConsentState> {
    const result: Record<GtagConsentKey, GtagConsentState> = {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
    };

    for (const category of CONSENT_CATEGORIES) {
        const granted = choices[category.id] === true;

        for (const key of category.gtagKeys) {
            result[key] = granted ? 'granted' : 'denied';
        }
    }

    return result;
}

export function isAnalyticsConsentGranted(choices: ConsentChoices): boolean {
    return choices.analytics === true;
}

export function parseStoredConsent(raw: string | null): StoredConsent | null {
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<StoredConsent>;

        if (
            parsed.version !== 1 ||
            !parsed.choices ||
            typeof parsed.choices !== 'object'
        ) {
            return null;
        }

        const defaults = defaultConsentChoices();
        const choices: ConsentChoices = { ...defaults };

        for (const category of CONSENT_CATEGORIES) {
            if (category.required) {
                choices[category.id] = true;
                continue;
            }

            if (typeof parsed.choices[category.id] === 'boolean') {
                choices[category.id] = parsed.choices[category.id];
            }
        }

        return {
            version: 1,
            decidedAt:
                typeof parsed.decidedAt === 'string'
                    ? parsed.decidedAt
                    : new Date().toISOString(),
            choices,
        };
    } catch {
        return null;
    }
}

export function serializeConsent(choices: ConsentChoices): string {
    const payload: StoredConsent = {
        version: 1,
        decidedAt: new Date().toISOString(),
        choices: {
            ...choices,
            functional: true,
        },
    };

    return JSON.stringify(payload);
}

export function shouldOpenConsentModal(
    hasDecided: boolean,
    isSnoozed: boolean,
    forcedOpen: boolean,
): boolean {
    if (forcedOpen) {
        return true;
    }

    if (hasDecided) {
        return false;
    }

    return !isSnoozed;
}
