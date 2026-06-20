import { router } from '@inertiajs/vue3';
import { useToastStore } from '@/stores/toastStore';
import type { FlashToast } from '@/types/ui';

export function initializeFlashToast(): void {
    router.on('flash', (event) => {
        const flash = (event as CustomEvent).detail?.flash;
        const data = flash?.toast as FlashToast | undefined;

        if (!data) {
            return;
        }

        useToastStore()[data.type](data.message);
    });
}
