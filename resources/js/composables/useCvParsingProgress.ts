import { computed, onUnmounted, ref, watch } from 'vue';
import {
    CV_PARSING_STAGES,
    hintForElapsed,
    stageIndexForElapsed,
} from '@/lib/cvParsingProgress';
import type { Ref } from 'vue';

const TICK_MS = 250;

/**
 * Optimistic timed stages while a CV upload/parse request is in flight.
 * Stops and resets when `active` becomes false (success or error).
 */
export function useCvParsingProgress(active: Ref<boolean>) {
    const elapsedMs = ref(0);
    let startedAt = 0;
    let tickId: ReturnType<typeof setInterval> | null = null;

    function clearTick(): void {
        if (tickId !== null) {
            clearInterval(tickId);
            tickId = null;
        }
    }

    function start(): void {
        clearTick();
        startedAt = Date.now();
        elapsedMs.value = 0;
        tickId = setInterval(() => {
            elapsedMs.value = Date.now() - startedAt;
        }, TICK_MS);
    }

    function stop(): void {
        clearTick();
        elapsedMs.value = 0;
    }

    watch(
        active,
        (isActive) => {
            if (isActive) {
                start();
            } else {
                stop();
            }
        },
        { immediate: true },
    );

    onUnmounted(() => {
        clearTick();
    });

    const currentIndex = computed(() => stageIndexForElapsed(elapsedMs.value));
    const currentLabel = computed(
        () =>
            CV_PARSING_STAGES[
                Math.min(currentIndex.value, CV_PARSING_STAGES.length - 1)
            ]?.label ?? 'Reading your CV…',
    );
    const hint = computed(() => hintForElapsed(elapsedMs.value));

    return {
        stages: CV_PARSING_STAGES,
        elapsedMs,
        currentIndex,
        currentLabel,
        hint,
    };
}
