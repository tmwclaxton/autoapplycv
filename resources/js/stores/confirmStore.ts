import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ConfirmVariant = 'default' | 'destructive';

export interface ConfirmOptions {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmVariant;
}

export const useConfirmStore = defineStore('confirm', () => {
    const isOpen = ref(false);
    const options = ref<ConfirmOptions | null>(null);

    let resolvePromise: ((value: boolean) => void) | null = null;

    function normalizeOptions(input: ConfirmOptions | string): ConfirmOptions {
        if (typeof input === 'string') {
            return {
                title: 'Are you sure?',
                description: input,
                confirmLabel: 'Confirm',
                cancelLabel: 'Cancel',
                variant: 'default',
            };
        }

        return {
            confirmLabel: 'Confirm',
            cancelLabel: 'Cancel',
            variant: 'default',
            ...input,
        };
    }

    function confirm(input: ConfirmOptions | string): Promise<boolean> {
        if (resolvePromise !== null) {
            resolvePromise(false);
        }

        options.value = normalizeOptions(input);
        isOpen.value = true;

        return new Promise((resolve) => {
            resolvePromise = resolve;
        });
    }

    function accept(): void {
        isOpen.value = false;
        resolvePromise?.(true);
        cleanup();
    }

    function dismiss(): void {
        isOpen.value = false;
        resolvePromise?.(false);
        cleanup();
    }

    function cleanup(): void {
        resolvePromise = null;
        options.value = null;
    }

    return {
        isOpen,
        options,
        confirm,
        accept,
        dismiss,
    };
});
