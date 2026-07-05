<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';

withDefaults(
    defineProps<{
        show: boolean;
        title?: string;
        description?: string;
    }>(),
    {
        title: 'Reading your CV…',
        description:
            'Usually under a minute - large CVs can take a bit longer.',
    },
);
</script>

<template>
    <div
        v-if="show"
        class="absolute inset-0 z-10 flex flex-col items-center justify-start rounded-[inherit] bg-background/70 pt-10 backdrop-blur-sm sm:pt-14"
        aria-live="polite"
        aria-busy="true"
    >
        <div
            class="postbox-panel flex max-w-sm flex-col items-center gap-4 p-8 text-center shadow-xl"
        >
            <Loader2 class="size-10 animate-spin text-postbox-red" />
            <div class="space-y-2">
                <h2 class="text-lg font-bold text-postbox-navy">
                    {{ title }}
                </h2>
                <p class="text-sm leading-relaxed text-muted-foreground">
                    {{ description }}
                </p>
            </div>
        </div>
    </div>
</template>
