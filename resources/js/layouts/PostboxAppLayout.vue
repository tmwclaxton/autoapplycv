<script setup lang="ts">
import AppConfirmDialog from '@/components/AppConfirmDialog.vue';
import AppToast from '@/components/AppToast.vue';
import PostboxAppNav from '@/components/postbox/PostboxAppNav.vue';
import PostboxShell from '@/components/postbox/PostboxShell.vue';

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
