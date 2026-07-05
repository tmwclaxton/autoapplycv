<script setup lang="ts">
import { storeToRefs } from 'pinia';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useConfirmStore } from '@/stores/confirmStore';

const confirmStore = useConfirmStore();
const { isOpen, options } = storeToRefs(confirmStore);

function onOpenChange(open: boolean): void {
    if (!open) {
        confirmStore.dismiss();
    }
}
</script>

<template>
    <Dialog :open="isOpen" @update:open="onOpenChange">
        <DialogContent
            class="border-2 border-postbox-navy bg-background sm:max-w-md"
            :show-close-button="true"
        >
            <DialogHeader class="space-y-2 text-left">
                <DialogTitle class="text-xl font-bold text-postbox-navy">
                    {{ options?.title }}
                </DialogTitle>
                <DialogDescription
                    v-if="options?.description"
                    class="text-sm leading-relaxed text-muted-foreground"
                >
                    {{ options.description }}
                </DialogDescription>
            </DialogHeader>

            <DialogFooter class="flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                    type="button"
                    class="postbox-btn-outline w-full sm:w-auto"
                    @click="confirmStore.dismiss()"
                >
                    {{ options?.cancelLabel ?? 'Cancel' }}
                </button>
                <button
                    type="button"
                    class="postbox-btn w-full sm:w-auto"
                    :class="
                        options?.variant === 'destructive'
                            ? 'bg-postbox-red hover:bg-postbox-red/90'
                            : ''
                    "
                    @click="confirmStore.accept()"
                >
                    {{ options?.confirmLabel ?? 'Confirm' }}
                </button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
