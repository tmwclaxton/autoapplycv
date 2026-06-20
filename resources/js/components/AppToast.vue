<script setup lang="ts">
import { useToastStore, MAX_TOASTS, type Toast } from '@/stores/toastStore';
import { CheckCircle, Info, TriangleAlert, XCircle, X } from 'lucide-vue-next';
import { computed, onUnmounted, watch } from 'vue';

const toastStore = useToastStore();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: TriangleAlert,
    info: Info,
};

const styles = {
    success: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200',
    error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-200',
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200',
};

const iconStyles = {
    success: 'text-green-500 dark:text-green-400',
    error: 'text-red-500 dark:text-red-400',
    warning: 'text-yellow-500 dark:text-yellow-400',
    info: 'text-blue-500 dark:text-blue-400',
};

function scheduleRemoval(toast: Toast): void {
    if (!timers.has(toast.id)) {
        timers.set(
            toast.id,
            setTimeout(() => {
                toastStore.remove(toast.id);
                timers.delete(toast.id);
            }, toast.duration),
        );
    }
}

watch(
    () => toastStore.toasts,
    (toasts) => {
        toasts.forEach(scheduleRemoval);
    },
    { immediate: true, deep: true },
);

const isAtLimit = computed(() => toastStore.toasts.length >= MAX_TOASTS);

function dismissAll(): void {
    timers.forEach(clearTimeout);
    timers.clear();
    toastStore.toasts.forEach((t) => toastStore.remove(t.id));
}

onUnmounted(() => {
    timers.forEach(clearTimeout);
    timers.clear();
});
</script>

<template>
    <Teleport to="body">
        <div class="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2" role="region" aria-label="Notifications">
            <Transition
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition-all duration-150 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
            >
                <button
                    v-if="isAtLimit"
                    class="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
                    @click="dismissAll"
                >
                    <X class="size-3" />
                    Dismiss all
                </button>
            </Transition>

            <TransitionGroup
                enter-active-class="transition-all duration-300 ease-out"
                enter-from-class="translate-x-full opacity-0"
                enter-to-class="translate-x-0 opacity-100"
                leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="translate-x-0 opacity-100"
                leave-to-class="translate-x-full opacity-0"
            >
                <div
                    v-for="toast in toastStore.toasts"
                    :key="toast.id"
                    :class="['flex w-80 max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-lg', styles[toast.type]]"
                    role="alert"
                >
                    <component :is="icons[toast.type]" :class="['mt-0.5 size-4 shrink-0', iconStyles[toast.type]]" />
                    <p class="flex-1 text-sm font-medium">{{ toast.message }}</p>
                    <button
                        class="shrink-0 opacity-60 transition-opacity hover:opacity-100 focus:outline-none"
                        aria-label="Dismiss"
                        @click="toastStore.remove(toast.id)"
                    >
                        <X class="size-4" />
                    </button>
                </div>
            </TransitionGroup>
        </div>
    </Teleport>
</template>
