<script setup lang="ts">
import { toRef } from 'vue';
import CvParsingProgress from '@/components/cv/CvParsingProgress.vue';
import { useCvParsingProgress } from '@/composables/useCvParsingProgress';

const props = defineProps<{
    show: boolean;
}>();

const { stages, currentIndex, currentLabel, hint } = useCvParsingProgress(
    toRef(props, 'show'),
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
            <CvParsingProgress
                :stages="stages"
                :current-index="currentIndex"
                :current-label="currentLabel"
                :hint="hint"
            />
        </div>
    </div>
</template>
