import {
    useConfirmStore,
    type ConfirmOptions,
} from '@/stores/confirmStore';

export function useConfirm() {
    const store = useConfirmStore();

    function confirmDelete(
        input: ConfirmOptions | string,
    ): Promise<boolean> {
        if (typeof input === 'string') {
            return store.confirm({
                title: 'Delete this file?',
                description: input,
                confirmLabel: 'Delete',
                cancelLabel: 'Cancel',
                variant: 'destructive',
            });
        }

        return store.confirm({
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            variant: 'destructive',
            ...input,
        });
    }

    return {
        confirm: store.confirm,
        confirmDelete,
    };
}
