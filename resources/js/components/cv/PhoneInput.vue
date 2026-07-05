<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
    DEFAULT_PHONE_COUNTRY_CODE,
    findPhoneCountryByIso2,
    normalizeDialCode,
    PHONE_COUNTRIES,
    resolvePhoneCountryIso2,
} from '@/lib/phone-countries';

const phone = defineModel<string | null>('phone', { required: true });
const countryCode = defineModel<string>('countryCode', { required: true });

const selectedIso2 = ref(resolvePhoneCountryIso2(countryCode.value));

watch(
    () => countryCode.value,
    (value) => {
        const iso2 = resolvePhoneCountryIso2(value);
        const current = findPhoneCountryByIso2(selectedIso2.value);

        if (current?.dialCode !== normalizeDialCode(value)) {
            selectedIso2.value = iso2;
        }
    },
);

const selectedCountry = computed(() => {
    return (
        findPhoneCountryByIso2(selectedIso2.value) ??
        findPhoneCountryByIso2('GB') ??
        PHONE_COUNTRIES[0]
    );
});

function onCountryChange(event: Event): void {
    const iso2 = (event.target as HTMLSelectElement).value;
    selectedIso2.value = iso2;

    const country = findPhoneCountryByIso2(iso2);

    if (country) {
        countryCode.value = country.dialCode;
    }
}

function ensureCountryCode(): void {
    if (!countryCode.value?.trim()) {
        countryCode.value = DEFAULT_PHONE_COUNTRY_CODE;
        selectedIso2.value = resolvePhoneCountryIso2(countryCode.value);
    }
}

ensureCountryCode();
</script>

<template>
    <div
        class="mt-2 flex overflow-hidden border-2 border-postbox-navy bg-postbox-surface focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-postbox-red"
    >
        <select
            id="field-phone-country-code"
            :value="selectedIso2"
            name="tel-country-code"
            autocomplete="tel-country-code"
            class="w-[7.5rem] shrink-0 cursor-pointer border-0 border-r-2 border-postbox-navy bg-postbox-surface px-2 py-2.5 text-sm text-postbox-ink focus:outline-none sm:w-[8.5rem]"
            aria-label="Phone country code"
            @change="onCountryChange"
        >
            <option
                v-for="country in PHONE_COUNTRIES"
                :key="country.iso2"
                :value="country.iso2"
            >
                {{ country.dialCode }} {{ country.name }}
            </option>
        </select>

        <input
            id="field-phone"
            v-model="phone"
            name="tel"
            type="tel"
            autocomplete="tel"
            class="min-w-0 flex-1 border-0 bg-transparent px-3.5 py-2.5 text-sm text-postbox-ink focus:outline-none"
            :placeholder="`${selectedCountry.dialCode} 7700 000000`"
        />
    </div>
</template>
