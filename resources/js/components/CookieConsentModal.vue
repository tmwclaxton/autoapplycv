<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { storeToRefs } from 'pinia';
import { onMounted } from 'vue';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useCookieConsentStore } from '@/stores/cookieConsentStore';
import type { ConsentCategoryId } from '@/lib/cookieConsent';
import { privacy } from '@/routes';

const consentStore = useCookieConsentStore();
const { isModalOpen, choices, categories, hydrated } =
    storeToRefs(consentStore);

onMounted(() => {
    if (!hydrated.value) {
        consentStore.hydrate();
    }
});

function onOpenChange(open: boolean): void {
    if (!open) {
        consentStore.onDismissWithoutSaving();
    }
}

function onCheckedChange(
    id: ConsentCategoryId,
    value: boolean | 'indeterminate',
): void {
    consentStore.setChoice(id, value === true);
}
</script>

<template>
    <Dialog :open="isModalOpen" @update:open="onOpenChange">
        <DialogContent
            class="border-2 border-postbox-navy bg-background sm:max-w-lg"
            :show-close-button="true"
        >
            <DialogHeader class="space-y-2 text-left">
                <DialogTitle class="text-xl font-bold text-postbox-navy">
                    Cookies and advertising
                </DialogTitle>
                <DialogDescription
                    class="text-sm leading-relaxed text-muted-foreground"
                >
                    We use Google Analytics and advertising cookies to improve
                    AutoCVApply and measure ads. Optional categories start
                    enabled - uncheck any you prefer to turn off. See our
                    <Link :href="privacy()" class="postbox-link">
                        privacy policy
                    </Link>
                    for details.
                </DialogDescription>
            </DialogHeader>

            <ul class="space-y-3" role="list">
                <li
                    v-for="category in categories"
                    :key="category.id"
                    class="rounded-md border border-postbox-navy/15 p-3"
                >
                    <label
                        class="flex items-start gap-3"
                        :class="
                            category.required
                                ? 'cursor-default opacity-90'
                                : 'cursor-pointer'
                        "
                    >
                        <Checkbox
                            class="mt-0.5 border-postbox-navy data-[state=checked]:border-postbox-navy data-[state=checked]:bg-postbox-navy"
                            :checked="choices[category.id]"
                            :disabled="category.required"
                            :aria-label="category.label"
                            @update:checked="
                                (value) => onCheckedChange(category.id, value)
                            "
                        />
                        <span class="min-w-0">
                            <span
                                class="block text-sm font-bold text-postbox-navy"
                            >
                                {{ category.label }}
                                <span
                                    v-if="category.required"
                                    class="ml-1 text-xs font-medium text-muted-foreground"
                                >
                                    (always on)
                                </span>
                            </span>
                            <span
                                class="mt-0.5 block text-sm leading-relaxed text-muted-foreground"
                            >
                                {{ category.description }}
                            </span>
                        </span>
                    </label>
                </li>
            </ul>

            <DialogFooter class="flex-col gap-2 sm:flex-col sm:space-x-0">
                <div
                    class="flex w-full flex-col gap-2 sm:flex-row sm:justify-end"
                >
                    <button
                        type="button"
                        class="postbox-btn w-full sm:w-auto"
                        @click="consentStore.acceptAll()"
                    >
                        Accept all
                    </button>
                    <button
                        type="button"
                        class="postbox-btn-outline w-full sm:w-auto"
                        @click="consentStore.saveChoices()"
                    >
                        Save choices
                    </button>
                </div>
                <div
                    class="flex w-full flex-col gap-2 sm:flex-row sm:justify-end"
                >
                    <button
                        type="button"
                        class="postbox-btn-ghost w-full text-sm sm:w-auto"
                        @click="consentStore.rejectAll()"
                    >
                        Reject optional
                    </button>
                    <button
                        type="button"
                        class="postbox-btn-ghost w-full text-sm sm:w-auto"
                        @click="consentStore.remindLater()"
                    >
                        Remind me later
                    </button>
                </div>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
