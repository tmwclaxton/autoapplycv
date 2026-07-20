<script setup lang="ts">
import { usePage } from '@inertiajs/vue3';
import { onMounted, watch } from 'vue';
import AppConfirmDialog from '@/components/AppConfirmDialog.vue';
import AppToast from '@/components/AppToast.vue';
import PostboxAppNav from '@/components/postbox/PostboxAppNav.vue';
import PostboxShell from '@/components/postbox/PostboxShell.vue';
import { trackSignUpConversion } from '@/lib/googleAnalytics';
import { useCookieConsentStore } from '@/stores/cookieConsentStore';

withDefaults(
    defineProps<{
        tagline?: string;
        maxWidth?: '4xl' | '5xl' | '6xl' | '7xl';
    }>(),
    {
        tagline: 'Stop retyping your life story.',
        maxWidth: '5xl',
    },
);

const page = usePage();
const consentStore = useCookieConsentStore();

function fireSignUpConversionIfNeeded(): void {
    const conversion = page.props.flash?.sign_up_conversion as
        | { transaction_id?: string; method?: string }
        | undefined;

    if (!conversion?.transaction_id || !consentStore.hasDecided) {
        return;
    }

    trackSignUpConversion(
        conversion.transaction_id,
        consentStore.choices,
        conversion.method ?? 'WorkOS',
    );
}

onMounted(() => {
    fireSignUpConversionIfNeeded();
});

watch(
    () =>
        [
            page.props.flash?.sign_up_conversion,
            consentStore.hasDecided,
            consentStore.choices.analytics,
            consentStore.choices.advertising,
        ] as const,
    () => {
        fireSignUpConversionIfNeeded();
    },
);
</script>

<template>
    <PostboxShell
        :tagline="tagline"
        :show-sign-out="true"
        :max-width="maxWidth"
    >
        <template #nav>
            <PostboxAppNav />
        </template>

        <slot />
    </PostboxShell>

    <AppToast />
    <AppConfirmDialog />
</template>
