import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration: number;
}

export const MAX_TOASTS = 5;

export const useToastStore = defineStore('toast', () => {
    const toasts = ref<Toast[]>([]);

    function add(type: ToastType, message: string, duration = 4000): void {
        const id = crypto.randomUUID();

        if (toasts.value.length >= MAX_TOASTS) {
            toasts.value.shift();
        }

        toasts.value.push({ id, type, message, duration });
    }

    function remove(id: string): void {
        toasts.value = toasts.value.filter((toast) => toast.id !== id);
    }

    function success(message: string, duration?: number): void {
        add('success', message, duration);
    }

    function error(message: string, duration?: number): void {
        add('error', message, duration);
    }

    function info(message: string, duration?: number): void {
        add('info', message, duration);
    }

    function warning(message: string, duration?: number): void {
        add('warning', message, duration);
    }

    return { toasts, add, remove, success, error, info, warning };
});
