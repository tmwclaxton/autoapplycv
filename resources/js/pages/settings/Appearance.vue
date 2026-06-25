<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { setLayoutProps } from '@inertiajs/vue3';
import AppearanceTabs from '@/components/AppearanceTabs.vue';

setLayoutProps({
    tagline: 'Light mode or dark — your call.',
});
</script>

<template>
    <Head title="Appearance settings" />

    <h1 class="sr-only">Appearance settings</h1>

    <div class="space-y-6">
        <div>
            <h2 class="text-lg font-bold text-postbox-navy">
                Theme preference
            </h2>
            <p class="mt-1 text-sm text-muted-foreground">
                Choose how AutoCVApply looks on this device.
            </p>
        </div>

        <AppearanceTabs />
    </div>
</template>
