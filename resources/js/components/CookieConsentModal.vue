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
            class="gap-0 overflow-hidden border-2 border-postbox-navy bg-postbox-surface p-0 sm:max-w-xl"
            :show-close-button="true"
        >
            <div
                class="border-b-2 border-postbox-navy bg-postbox-grey px-6 py-5 pr-12"
            >
                <DialogHeader class="space-y-2 text-left">
                    <p class="postbox-label mb-0">Your privacy</p>
                    <DialogTitle
                        class="text-2xl font-bold tracking-tight text-postbox-navy"
                    >
                        Cookies and advertising
                    </DialogTitle>
                    <DialogDescription
                        class="text-sm leading-relaxed text-muted-foreground"
                    >
                        We use Google Analytics and advertising cookies to
                        improve AutoCVApply and measure ads. Optional categories
                        start on - turn off any you prefer. See our
                        <Link :href="privacy()" class="postbox-link">
                            privacy policy
                        </Link>
                        for details.
                    </DialogDescription>
                </DialogHeader>
            </div>

            <div class="px-6 py-5">
                <ul class="divide-y-2 divide-postbox-navy/10" role="list">
                    <li
                        v-for="category in categories"
                        :key="category.id"
                        class="py-4 first:pt-0 last:pb-0"
                    >
                        <label
                            class="flex items-start justify-between gap-4"
                            :class="
                                category.required
                                    ? 'cursor-default'
                                    : 'cursor-pointer'
                            "
                        >
                            <span class="min-w-0 flex-1">
                                <span
                                    class="flex flex-wrap items-center gap-x-2 gap-y-1"
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
                                    class="mt-1 block text-sm leading-relaxed text-muted-foreground"
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
                class="flex-col gap-3 border-t-2 border-postbox-navy bg-postbox-grey px-6 py-4 sm:flex-col sm:space-x-0"
            >
                <button
                    type="button"
                    class="postbox-btn w-full"
                    @click="consentStore.acceptAll()"
                >
                    Accept all
                </button>
                <div class="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
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
                    class="postbox-btn-ghost w-full text-sm text-muted-foreground hover:text-postbox-navy"
                    @click="consentStore.remindLater()"
                >
                    Remind me later
                </button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
