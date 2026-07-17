<script setup lang="ts">
import { Dices } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { buildCoverLetterPreviewHtml } from '@/lib/cover-letter-preview';
import type {
    CoverLetterDesignOptions,
    CoverLetterPreviewDesign,
    CoverLetterPreviewFont,
} from '@/lib/cover-letter-preview';

const RANDOM = 'random';

const coverLetterDesign = defineModel<string>('coverLetterDesign', {
    required: true,
});
const coverLetterFont = defineModel<string>('coverLetterFont', {
    required: true,
});

const props = defineProps<{
    options: CoverLetterDesignOptions;
}>();

const designDialogOpen = ref(false);
const fontDialogOpen = ref(false);
const previewDesignSlug = ref(props.options.default_design);
const previewFontKey = ref(props.options.default_font);

function pickRandomDesignSlug(): string {
    const designs = props.options.designs;

    return (
        designs[Math.floor(Math.random() * designs.length)]?.slug ??
        props.options.default_design
    );
}

function pickRandomFontKey(): string {
    const fonts = props.options.fonts;

    return (
        fonts[Math.floor(Math.random() * fonts.length)]?.key ??
        props.options.default_font
    );
}

function syncPreviewFromPreferences(): void {
    previewDesignSlug.value =
        coverLetterDesign.value === RANDOM
            ? pickRandomDesignSlug()
            : coverLetterDesign.value;
    previewFontKey.value =
        coverLetterFont.value === RANDOM
            ? pickRandomFontKey()
            : coverLetterFont.value;
}

watch(
    [coverLetterDesign, coverLetterFont],
    () => {
        syncPreviewFromPreferences();
    },
    { immediate: true },
);

const isRandomSelection = computed(
    () =>
        coverLetterDesign.value === RANDOM || coverLetterFont.value === RANDOM,
);

const selectedDesignMeta = computed(() => {
    if (coverLetterDesign.value === RANDOM) {
        return {
            slug: RANDOM,
            title: 'Random',
            blurb: 'A design is chosen at random each time a cover letter is generated.',
            accent: '#1b365d',
            id: '??',
        };
    }

    return (
        props.options.designs.find(
            (design) => design.slug === coverLetterDesign.value,
        ) ?? props.options.designs[0]
    );
});

const selectedFontMeta = computed(() => {
    if (coverLetterFont.value === RANDOM) {
        return {
            key: RANDOM,
            label: 'Random',
            display: 'system-ui, sans-serif',
        };
    }

    return (
        props.options.fonts.find(
            (font) => font.key === coverLetterFont.value,
        ) ?? props.options.fonts[0]
    );
});

const previewDesign = computed(
    (): CoverLetterPreviewDesign | undefined =>
        props.options.designs.find(
            (design) => design.slug === previewDesignSlug.value,
        ) ?? props.options.designs[0],
);

const previewFont = computed(
    (): CoverLetterPreviewFont | undefined =>
        props.options.fonts.find((font) => font.key === previewFontKey.value) ??
        props.options.fonts[0],
);

const previewHtml = computed(() => {
    if (!previewDesign.value || !previewFont.value) {
        return '';
    }

    return buildCoverLetterPreviewHtml(
        previewDesign.value,
        previewFont.value,
        props.options.sample,
    );
});

const previewComboLabel = computed(() => {
    const designTitle = previewDesign.value?.title ?? 'Design';
    const fontLabel = previewFont.value?.label ?? 'Font';

    if (!isRandomSelection.value) {
        return `${designTitle} · ${fontLabel}`;
    }

    return `Preview sample: ${designTitle} · ${fontLabel}`;
});

function selectDesign(slug: string): void {
    coverLetterDesign.value = slug;
    designDialogOpen.value = false;
}

function selectFont(key: string): void {
    coverLetterFont.value = key;
    fontDialogOpen.value = false;
}

function shufflePreview(): void {
    if (coverLetterDesign.value === RANDOM) {
        previewDesignSlug.value = pickRandomDesignSlug();
    }

    if (coverLetterFont.value === RANDOM) {
        previewFontKey.value = pickRandomFontKey();
    }

    if (
        coverLetterDesign.value !== RANDOM &&
        coverLetterFont.value !== RANDOM
    ) {
        previewDesignSlug.value = pickRandomDesignSlug();
        previewFontKey.value = pickRandomFontKey();
    }
}
</script>

<template>
    <div
        class="grid items-start gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"
    >
        <div class="space-y-4">
            <div class="postbox-panel space-y-4 p-4 sm:p-5">
                <div>
                    <h2 class="postbox-label">Cover letter settings</h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                        These settings apply to cover letters the extension
                        generates, including on the fly during Auto Apply. Pick
                        Random to vary design and font on each generation.
                    </p>
                </div>

                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                        Design
                    </p>
                    <button
                        type="button"
                        class="flex w-full items-center gap-3 rounded-lg border-2 border-postbox-navy/20 bg-background p-3 text-left transition-colors hover:border-postbox-navy/45"
                        @click="designDialogOpen = true"
                    >
                        <span
                            class="flex size-12 shrink-0 flex-col overflow-hidden rounded-md border border-black/10 shadow-sm"
                            aria-hidden="true"
                        >
                            <span
                                class="h-4 w-full"
                                :style="{
                                    background:
                                        selectedDesignMeta?.accent ?? '#1b365d',
                                }"
                            />
                            <span class="flex flex-1 gap-0.5 bg-white p-1">
                                <span
                                    class="w-1/3 rounded-sm"
                                    :style="{
                                        background:
                                            selectedDesignMeta?.accent ??
                                            '#1b365d',
                                        opacity: 0.25,
                                    }"
                                />
                                <span class="flex flex-1 flex-col gap-0.5">
                                    <span
                                        class="h-1 rounded-full bg-black/15"
                                    />
                                    <span
                                        class="h-1 w-4/5 rounded-full bg-black/10"
                                    />
                                    <span
                                        class="h-1 w-3/5 rounded-full bg-black/10"
                                    />
                                </span>
                            </span>
                        </span>
                        <span class="min-w-0 flex-1">
                            <span
                                class="block truncate text-sm font-semibold text-postbox-navy"
                            >
                                {{ selectedDesignMeta?.title }}
                            </span>
                            <span
                                class="mt-0.5 block truncate text-xs text-muted-foreground"
                            >
                                {{
                                    coverLetterDesign === RANDOM
                                        ? 'Varies each generation'
                                        : selectedDesignMeta?.blurb
                                }}
                            </span>
                        </span>
                        <span
                            class="shrink-0 text-xs font-medium text-postbox-navy"
                        >
                            Change
                        </span>
                    </button>
                </div>

                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                        Font
                    </p>
                    <button
                        type="button"
                        class="flex w-full items-center gap-3 rounded-lg border-2 border-postbox-navy/20 bg-background p-3 text-left transition-colors hover:border-postbox-navy/45"
                        @click="fontDialogOpen = true"
                    >
                        <span
                            class="flex size-12 shrink-0 items-center justify-center rounded-md border border-black/10 bg-[#f4f5f7] text-lg font-semibold text-postbox-navy shadow-sm"
                            :style="{
                                fontFamily: selectedFontMeta?.display,
                            }"
                            aria-hidden="true"
                        >
                            Aa
                        </span>
                        <span class="min-w-0 flex-1">
                            <span
                                class="block truncate text-sm font-semibold text-postbox-navy"
                                :style="{
                                    fontFamily:
                                        coverLetterFont === RANDOM
                                            ? undefined
                                            : selectedFontMeta?.display,
                                }"
                            >
                                {{ selectedFontMeta?.label }}
                            </span>
                            <span
                                class="mt-0.5 block truncate text-xs text-muted-foreground"
                            >
                                {{
                                    coverLetterFont === RANDOM
                                        ? 'Varies each generation'
                                        : 'Used for headings and letter body'
                                }}
                            </span>
                        </span>
                        <span
                            class="shrink-0 text-xs font-medium text-postbox-navy"
                        >
                            Change
                        </span>
                    </button>
                </div>

                <button
                    v-if="isRandomSelection"
                    type="button"
                    class="postbox-btn-outline inline-flex w-full items-center justify-center gap-2"
                    @click="shufflePreview"
                >
                    <Dices class="size-4" />
                    Shuffle preview
                </button>
            </div>
        </div>

        <div
            class="postbox-panel space-y-3 p-4 sm:p-5 lg:sticky lg:top-4 lg:self-start"
        >
            <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 class="postbox-label">Live preview</h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                        Sample cover letter for James Mitchell.
                        <span v-if="isRandomSelection">
                            Preference is Random - this shows one sample roll.
                        </span>
                        <span v-else
                            >Updates as you change design or font.</span
                        >
                    </p>
                </div>
                <p
                    class="rounded-md border border-postbox-navy/15 bg-postbox-navy/5 px-2 py-1 text-xs text-postbox-navy"
                >
                    {{ previewComboLabel }}
                </p>
            </div>

            <div
                class="max-h-[min(85vh,1100px)] overflow-auto rounded-lg border border-postbox-navy/15 bg-[#e8ecec]"
            >
                <iframe
                    title="Cover letter design preview"
                    class="mx-auto block h-[1100px] w-full min-w-[210mm] origin-top scale-[0.58] sm:scale-[0.68] lg:scale-[0.72] xl:scale-[0.82] 2xl:scale-[0.9]"
                    :srcdoc="previewHtml"
                />
            </div>
        </div>
    </div>

    <Dialog v-model:open="designDialogOpen">
        <DialogContent
            class="max-h-[min(90vh,40rem)] overflow-y-auto border-2 border-postbox-navy bg-background sm:max-w-2xl"
        >
            <DialogHeader class="space-y-2 text-left">
                <DialogTitle class="text-xl font-bold text-postbox-navy">
                    Choose cover letter design
                </DialogTitle>
                <DialogDescription class="text-sm text-muted-foreground">
                    Used when Auto Apply generates and attaches a cover letter
                    PDF.
                </DialogDescription>
            </DialogHeader>

            <div class="grid gap-2 sm:grid-cols-2">
                <button
                    type="button"
                    class="flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors"
                    :class="
                        coverLetterDesign === RANDOM
                            ? 'border-postbox-navy bg-postbox-navy/5'
                            : 'border-postbox-navy/15 hover:border-postbox-navy/40'
                    "
                    @click="selectDesign(RANDOM)"
                >
                    <span
                        class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md bg-postbox-navy text-xs font-bold text-white"
                        aria-hidden="true"
                    >
                        ?
                    </span>
                    <span>
                        <span
                            class="block text-sm font-semibold text-postbox-navy"
                            >Random</span
                        >
                        <span class="mt-1 block text-xs text-muted-foreground">
                            Pick a different design each time a cover letter is
                            generated.
                        </span>
                    </span>
                </button>

                <button
                    v-for="design in options.designs"
                    :key="design.slug"
                    type="button"
                    class="flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors"
                    :class="
                        coverLetterDesign === design.slug
                            ? 'border-postbox-navy bg-postbox-navy/5'
                            : 'border-postbox-navy/15 hover:border-postbox-navy/40'
                    "
                    @click="selectDesign(design.slug)"
                >
                    <span
                        class="mt-0.5 flex size-10 shrink-0 flex-col overflow-hidden rounded-md border border-black/10"
                        aria-hidden="true"
                    >
                        <span
                            class="h-3 w-full"
                            :style="{ background: design.accent }"
                        />
                        <span class="flex-1 bg-white" />
                    </span>
                    <span>
                        <span class="flex items-baseline justify-between gap-2">
                            <span
                                class="text-sm font-semibold text-postbox-navy"
                                >{{ design.title }}</span
                            >
                            <span class="text-xs text-muted-foreground">{{
                                design.id
                            }}</span>
                        </span>
                        <span class="mt-1 block text-xs text-muted-foreground">
                            {{ design.blurb }}
                        </span>
                    </span>
                </button>
            </div>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="fontDialogOpen">
        <DialogContent
            class="max-h-[min(90vh,36rem)] overflow-y-auto border-2 border-postbox-navy bg-background sm:max-w-lg"
        >
            <DialogHeader class="space-y-2 text-left">
                <DialogTitle class="text-xl font-bold text-postbox-navy">
                    Choose font family
                </DialogTitle>
                <DialogDescription class="text-sm text-muted-foreground">
                    Applied to headings and body text on generated cover
                    letters.
                </DialogDescription>
            </DialogHeader>

            <div class="grid gap-2 sm:grid-cols-2">
                <button
                    type="button"
                    class="rounded-lg border-2 px-3 py-3 text-left text-sm transition-colors"
                    :class="
                        coverLetterFont === RANDOM
                            ? 'border-postbox-navy bg-postbox-navy/5 font-semibold text-postbox-navy'
                            : 'border-postbox-navy/15 text-postbox-navy/80 hover:border-postbox-navy/40'
                    "
                    @click="selectFont(RANDOM)"
                >
                    <span class="block font-semibold">Random</span>
                    <span
                        class="mt-1 block text-xs font-normal text-muted-foreground"
                    >
                        Varies each generation
                    </span>
                </button>

                <button
                    v-for="font in options.fonts"
                    :key="font.key"
                    type="button"
                    class="rounded-lg border-2 px-3 py-3 text-left text-sm transition-colors"
                    :class="
                        coverLetterFont === font.key
                            ? 'border-postbox-navy bg-postbox-navy/5 font-semibold text-postbox-navy'
                            : 'border-postbox-navy/15 text-postbox-navy/80 hover:border-postbox-navy/40'
                    "
                    :style="{ fontFamily: font.display }"
                    @click="selectFont(font.key)"
                >
                    {{ font.label }}
                </button>
            </div>
        </DialogContent>
    </Dialog>
</template>
