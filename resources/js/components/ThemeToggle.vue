<script setup lang="ts">
import { Monitor, Moon, Sun } from 'lucide-vue-next';
import { computed } from 'vue';
import {
    type Appearance,
    useAppearance,
} from '@/composables/useAppearance';

const { appearance, updateAppearance } = useAppearance();

const order: Appearance[] = ['light', 'dark', 'system'];

const icons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
} as const;

const labels: Record<Appearance, string> = {
    light: 'Light mode',
    dark: 'Dark mode',
    system: 'System theme',
};

const CurrentIcon = computed(() => icons[appearance.value]);

function cycleTheme(): void {
    const currentIndex = order.indexOf(appearance.value);
    const nextIndex = (currentIndex + 1) % order.length;

    updateAppearance(order[nextIndex]);
}
</script>

<template>
    <button
        type="button"
        class="postbox-btn-ghost border-2 p-2"
        :title="labels[appearance]"
        :aria-label="labels[appearance]"
        @click="cycleTheme"
    >
        <component :is="CurrentIcon" class="size-4" />
    </button>
</template>
