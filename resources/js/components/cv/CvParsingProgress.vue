<script setup lang="ts">
import { Check, Loader2 } from 'lucide-vue-next';
import { stageStatus } from '@/lib/cvParsingProgress';
import type { CvParsingStage } from '@/lib/cvParsingProgress';

defineProps<{
    stages: readonly CvParsingStage[];
    currentIndex: number;
    hint: string;
    /** When true, omit the large spinner (parent already shows one). */
    compact?: boolean;
}>();
</script>

<template>
    <div class="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <Loader2
            v-if="!compact"
            class="size-10 animate-spin text-postbox-red"
            aria-hidden="true"
        />

        <div class="w-full space-y-3">
            <p class="font-bold text-postbox-navy">
                {{ stages[Math.min(currentIndex, stages.length - 1)]?.label }}
            </p>

            <ol class="space-y-2 text-left" aria-label="Parsing progress">
                <li
                    v-for="(stage, index) in stages"
                    :key="stage.id"
                    class="flex items-center gap-2.5 text-sm"
                    :class="{
                        'font-semibold text-postbox-navy':
                            stageStatus(index, currentIndex) === 'current',
                        'text-postbox-navy/80':
                            stageStatus(index, currentIndex) === 'done',
                        'text-muted-foreground':
                            stageStatus(index, currentIndex) === 'pending',
                    }"
                >
                    <span
                        class="flex size-5 shrink-0 items-center justify-center border-2"
                        :class="{
                            'border-postbox-navy bg-postbox-navy text-white':
                                stageStatus(index, currentIndex) === 'done',
                            'border-postbox-red text-postbox-red':
                                stageStatus(index, currentIndex) === 'current',
                            'border-postbox-navy/25':
                                stageStatus(index, currentIndex) === 'pending',
                        }"
                        aria-hidden="true"
                    >
                        <Check
                            v-if="stageStatus(index, currentIndex) === 'done'"
                            class="size-3"
                        />
                        <Loader2
                            v-else-if="
                                stageStatus(index, currentIndex) === 'current'
                            "
                            class="size-3 animate-spin"
                        />
                    </span>
                    <span>{{ stage.label }}</span>
                </li>
            </ol>

            <p class="text-sm leading-relaxed text-muted-foreground">
                {{ hint }}
            </p>
        </div>
    </div>
</template>
