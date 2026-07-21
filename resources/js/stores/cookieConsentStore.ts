import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
    CONSENT_CATEGORIES,
    CONSENT_SNOOZE_SESSION_KEY,
    CONSENT_STORAGE_KEY,
    defaultConsentChoices,
    parseStoredConsent,
    rejectOptionalConsentChoices,
    serializeConsent,
    shouldOpenConsentModal,
} from '@/lib/cookieConsent';
import {
    applyGtagConsent,
    trackCurrentPageViewIfAllowed,
} from '@/lib/googleAnalytics';
import type { ConsentCategoryId, ConsentChoices } from '@/lib/cookieConsent';

function readSnoozed(): boolean {
    try {
        return sessionStorage.getItem(CONSENT_SNOOZE_SESSION_KEY) === '1';
    } catch {
        return false;
    }
}

function writeSnoozed(value: boolean): void {
    try {
        if (value) {
            sessionStorage.setItem(CONSENT_SNOOZE_SESSION_KEY, '1');
        } else {
            sessionStorage.removeItem(CONSENT_SNOOZE_SESSION_KEY);
        }
    } catch {
        // sessionStorage may be unavailable
    }
}

function readStoredChoices(): ConsentChoices | null {
    try {
        return (
            parseStoredConsent(localStorage.getItem(CONSENT_STORAGE_KEY))
                ?.choices ?? null
        );
    } catch {
        return null;
    }
}

function persistChoices(choices: ConsentChoices): void {
    try {
        localStorage.setItem(CONSENT_STORAGE_KEY, serializeConsent(choices));
    } catch {
        // localStorage may be unavailable
    }
}

export const useCookieConsentStore = defineStore('cookieConsent', () => {
    // Must be a computed/ref so storeToRefs() includes it (plain arrays are skipped).
    const categories = computed(() => CONSENT_CATEGORIES);
    const choices = ref<ConsentChoices>(defaultConsentChoices());
    const hasDecided = ref(false);
    const isSnoozed = ref(false);
    const forcedOpen = ref(false);
    const hydrated = ref(false);

    const isModalOpen = computed(() =>
        shouldOpenConsentModal(
            hasDecided.value,
            isSnoozed.value,
            forcedOpen.value,
        ),
    );

    function hydrate(): void {
        const stored = readStoredChoices();

        isSnoozed.value = readSnoozed();

        if (stored) {
            choices.value = stored;
            hasDecided.value = true;
            applyGtagConsent(stored);
            // Cover the case where Inertia navigate already ran before hydrate.
            trackCurrentPageViewIfAllowed(stored);
        } else {
            choices.value = defaultConsentChoices();
            hasDecided.value = false;
        }

        hydrated.value = true;
    }

    function setChoice(id: ConsentCategoryId, enabled: boolean): void {
        const category = categories.value.find((item) => item.id === id);

        if (!category || category.required) {
            return;
        }

        choices.value = {
            ...choices.value,
            [id]: enabled,
        };
    }

    function commit(next: ConsentChoices): void {
        choices.value = {
            ...next,
            functional: true,
        };
        hasDecided.value = true;
        forcedOpen.value = false;
        isSnoozed.value = false;
        writeSnoozed(false);
        persistChoices(choices.value);
        applyGtagConsent(choices.value);
        trackCurrentPageViewIfAllowed(choices.value);
    }

    function acceptAll(): void {
        commit(defaultConsentChoices());
    }

    function rejectAll(): void {
        commit(rejectOptionalConsentChoices());
    }

    function saveChoices(): void {
        commit(choices.value);
    }

    function remindLater(): void {
        forcedOpen.value = false;
        isSnoozed.value = true;
        writeSnoozed(true);
    }

    function openPreferences(): void {
        if (!hasDecided.value) {
            choices.value = defaultConsentChoices();
        }

        forcedOpen.value = true;
    }

    function onDismissWithoutSaving(): void {
        remindLater();
    }

    return {
        categories,
        choices,
        hasDecided,
        isSnoozed,
        forcedOpen,
        hydrated,
        isModalOpen,
        hydrate,
        setChoice,
        acceptAll,
        rejectAll,
        saveChoices,
        remindLater,
        openPreferences,
        onDismissWithoutSaving,
    };
});
