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
import { CONSENT_CATEGORIES } from '@/lib/cookieConsent';
import { useCookieConsentStore } from '@/stores/cookieConsentStore';
import type { ConsentCategoryId } from '@/lib/cookieConsent';
import { privacy } from '@/routes';

const consentStore = useCookieConsentStore();
const { isModalOpen, choices, hydrated } = storeToRefs(consentStore);
const categories = CONSENT_CATEGORIES;

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
            class="fixed top-auto right-0 bottom-0 left-0 flex max-h-[min(85dvh,100%)] w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-t-xl rounded-b-none border-2 border-postbox-navy bg-postbox-surface p-0 sm:top-[50%] sm:right-auto sm:bottom-auto sm:left-[50%] sm:max-h-[min(90vh,40rem)] sm:max-w-xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg"
            :show-close-button="true"
        >
            <div
                class="shrink-0 border-b-2 border-postbox-navy bg-postbox-grey px-4 py-3 pr-12 sm:px-6 sm:py-5"
            >
                <DialogHeader class="space-y-1 text-left sm:space-y-2">
                    <p class="postbox-label mb-0 hidden sm:block">
                        Your privacy
                    </p>
                    <DialogTitle
                        class="text-lg font-bold tracking-tight text-postbox-navy sm:text-2xl"
                    >
                        Cookies and advertising
                    </DialogTitle>
                    <DialogDescription
                        class="text-xs leading-snug text-muted-foreground sm:text-sm sm:leading-relaxed"
                    >
                        <span class="sm:hidden">
                            Analytics and ad cookies help improve AutoCVApply.
                            Optional categories start on. See our
                            <Link :href="privacy()" class="postbox-link">
                                privacy policy
                            </Link>
                            .
                        </span>
                        <span class="hidden sm:inline">
                            We use Google Analytics and advertising cookies to
                            improve AutoCVApply and measure ads. Optional
                            categories start on - turn off any you prefer. See
                            our
                            <Link :href="privacy()" class="postbox-link">
                                privacy policy
                            </Link>
                            for details.
                        </span>
                    </DialogDescription>
                </DialogHeader>
            </div>

            <div
                class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 sm:py-5"
            >
                <ul class="divide-y-2 divide-postbox-navy/10" role="list">
                    <li
                        v-for="category in categories"
                        :key="category.id"
                        class="py-2.5 first:pt-0 last:pb-0 sm:py-4"
                    >
                        <label
                            class="flex items-start justify-between gap-3 sm:gap-4"
                            :class="
                                category.required
                                    ? 'cursor-default'
                                    : 'cursor-pointer'
                            "
                        >
                            <span class="min-w-0 flex-1">
                                <span
                                    class="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                                >
                                    <span
                                        class="text-sm font-bold text-postbox-navy"
                                    >
                                        {{ category.label }}
                                    </span>
                                    <span
                                        v-if="category.required"
                                        class="inline-flex border border-postbox-navy/25 bg-postbox-grey px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-postbox-navy uppercase"
                                    >
                                        Always on
                                    </span>
                                    <span
                                        v-else-if="choices[category.id]"
                                        class="inline-flex border border-postbox-red/30 bg-postbox-red/5 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-postbox-red uppercase"
                                    >
                                        On
                                    </span>
                                </span>
                                <span
                                    class="mt-0.5 block text-xs leading-snug text-muted-foreground sm:mt-1 sm:text-sm sm:leading-relaxed"
                                >
                                    {{ category.description }}
                                </span>
                            </span>
                            <Checkbox
                                class="mt-0.5 size-5 shrink-0 border-2 border-postbox-navy data-[state=checked]:border-postbox-navy data-[state=checked]:bg-postbox-navy data-[state=checked]:text-white"
                                :model-value="choices[category.id] === true"
                                :disabled="category.required"
                                :aria-label="category.label"
                                @update:model-value="
                                    (value) =>
                                        onCheckedChange(category.id, value)
                                "
                            />
                        </label>
                    </li>
                </ul>
            </div>

            <DialogFooter
                class="shrink-0 flex-col gap-2 border-t-2 border-postbox-navy bg-postbox-grey px-4 py-3 sm:flex-col sm:gap-3 sm:space-x-0 sm:px-6 sm:py-4"
            >
                <button
                    type="button"
                    class="postbox-btn w-full"
                    @click="consentStore.acceptAll()"
                >
                    Accept all
                </button>
                <div class="grid w-full grid-cols-2 gap-2">
                    <button
                        type="button"
                        class="postbox-btn-outline w-full"
                        @click="consentStore.saveChoices()"
                    >
                        Save choices
                    </button>
                    <button
                        type="button"
                        class="postbox-btn-outline w-full"
                        @click="consentStore.rejectAll()"
                    >
                        Reject optional
                    </button>
                </div>
                <button
                    type="button"
                    class="postbox-btn-ghost w-full py-1.5 text-xs text-muted-foreground hover:text-postbox-navy sm:py-2 sm:text-sm"
                    @click="consentStore.remindLater()"
                >
                    Remind me later
                </button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
