<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { ArrowRight, CheckCircle2, FileText, RotateCcw } from 'lucide-vue-next';
import { computed, onUnmounted, reactive, ref } from 'vue';
import { howTo } from '@/routes';

type FieldType =
    | 'text'
    | 'email'
    | 'tel'
    | 'url'
    | 'textarea'
    | 'select'
    | 'file';

type DemoField = {
    id: string;
    label: string;
    type: FieldType;
    value: string;
    placeholder?: string;
    options?: { value: string; label: string }[];
    rows?: number;
    half?: boolean;
};

const MOCK_FIELDS: DemoField[] = [
    {
        id: 'firstName',
        label: 'First name',
        type: 'text',
        value: 'Alex',
        placeholder: 'Jane',
        half: true,
    },
    {
        id: 'lastName',
        label: 'Last name',
        type: 'text',
        value: 'Chen',
        placeholder: 'Smith',
        half: true,
    },
    {
        id: 'email',
        label: 'Email',
        type: 'email',
        value: 'alex.chen@email.com',
        placeholder: 'you@example.com',
    },
    {
        id: 'resume',
        label: 'Resume / CV',
        type: 'file',
        value: 'Alex_Chen_CV.pdf',
    },
];

const HIGHLIGHT_MS = 180;
const PAUSE_MS = 220;

const formValues = reactive<Record<string, string>>(
    Object.fromEntries(MOCK_FIELDS.map((field) => [field.id, ''])),
);

const isFilling = ref(false);
const isComplete = ref(false);
const activeFieldId = ref<string | null>(null);
const filledCount = ref(0);
const statusMessage = ref('');
const cancelled = ref(false);

const totalFields = MOCK_FIELDS.length;

const progressLabel = computed(() => {
    if (isFilling.value && filledCount.value > 0) {
        return `Filling ${filledCount.value} of ${totalFields}…`;
    }

    return statusMessage.value;
});

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

async function fillField(field: DemoField): Promise<void> {
    activeFieldId.value = field.id;
    await sleep(HIGHLIGHT_MS);

    if (cancelled.value) {
        return;
    }

    formValues[field.id] = field.value;
    filledCount.value += 1;
    await sleep(PAUSE_MS);
}

async function startDraftAll(): Promise<void> {
    if (isFilling.value) {
        return;
    }

    cancelled.value = false;
    isFilling.value = true;
    isComplete.value = false;
    filledCount.value = 0;
    statusMessage.value = 'Filling from profile…';

    for (const field of MOCK_FIELDS) {
        if (cancelled.value) {
            break;
        }

        await fillField(field);
    }

    if (cancelled.value) {
        return;
    }

    activeFieldId.value = null;
    isFilling.value = false;
    isComplete.value = true;
    statusMessage.value = 'Fill complete.';
}

function resetDemo(): void {
    cancelled.value = true;
    isFilling.value = false;
    isComplete.value = false;
    activeFieldId.value = null;
    filledCount.value = 0;
    statusMessage.value = '';

    for (const field of MOCK_FIELDS) {
        formValues[field.id] = '';
    }
}

function fieldClass(fieldId: string): string {
    if (activeFieldId.value !== fieldId) {
        return '';
    }

    return 'ring-2 ring-postbox-red ring-offset-1 ring-offset-white transition-shadow duration-150';
}

onUnmounted(() => {
    cancelled.value = true;
});
</script>

<template>
    <section class="mt-12">
        <div class="mb-4 text-center sm:text-left">
            <span class="postbox-badge mb-3 inline-flex">Interactive demo</span>
            <h2
                class="text-xl font-bold tracking-tight text-balance text-postbox-navy sm:text-2xl"
            >
                Try Draft All
            </h2>
            <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                Click the red button - the same one on real job forms - and
                watch your profile fill the application in seconds.
            </p>
        </div>

        <div class="w-full">
            <div
                class="overflow-hidden rounded-xl border border-[#d4d4d8] bg-[#ececec] shadow-[0_8px_30px_rgb(0_0_0_/_12%)]"
            >
                <div
                    class="flex items-center gap-2 border-b border-[#d4d4d8] px-3 py-1.5 sm:py-2"
                >
                    <div class="flex shrink-0 items-center gap-1.5">
                        <span
                            class="size-2.5 rounded-full bg-[#ff5f57] sm:size-3"
                            aria-hidden="true"
                        />
                        <span
                            class="size-2.5 rounded-full bg-[#febc2e] sm:size-3"
                            aria-hidden="true"
                        />
                        <span
                            class="size-2.5 rounded-full bg-[#28c840] sm:size-3"
                            aria-hidden="true"
                        />
                    </div>
                    <div
                        class="min-w-0 flex-1 rounded-md border border-[#d4d4d8] bg-white px-2 py-0.5 text-center sm:px-2.5 sm:py-1"
                    >
                        <span
                            class="block truncate text-[10px] text-[#71717a] sm:text-xs"
                        >
                            careers.example.com/apply
                        </span>
                    </div>
                </div>

                <div
                    class="flex h-60 flex-col overflow-hidden bg-[#fafafa] sm:h-64"
                >
                    <div
                        class="shrink-0 border-b border-[#e4e4e7] bg-white px-3 py-1.5 sm:px-4 sm:py-2"
                    >
                        <p
                            class="text-[10px] font-semibold tracking-wide text-[#71717a] uppercase"
                        >
                            Acme Corp · Careers
                        </p>
                        <h3
                            class="text-xs font-semibold text-[#18181b] sm:text-sm"
                        >
                            Senior Product Designer
                        </h3>
                        <p class="text-[10px] text-[#71717a] sm:text-[11px]">
                            London · Hybrid · Full-time
                        </p>
                    </div>

                    <div
                        v-if="isComplete"
                        class="flex min-h-0 flex-1 flex-col justify-start border-t border-[#e4e4e7] bg-[#f0fdf4] px-3 py-2 sm:px-4"
                    >
                        <div
                            class="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                        >
                            <div class="flex min-w-0 items-center gap-1.5">
                                <CheckCircle2
                                    class="size-3 shrink-0 text-[#16a34a]"
                                />
                                <div class="min-w-0 leading-tight">
                                    <p
                                        class="text-xs font-semibold text-[#166534]"
                                    >
                                        Form filled from your profile
                                    </p>
                                    <p class="text-[10px] text-[#15803d]">
                                        Draft All on a real application - no
                                        copy-paste.
                                    </p>
                                </div>
                            </div>
                            <div
                                class="flex shrink-0 flex-row items-center gap-2"
                            >
                                <button
                                    type="button"
                                    class="inline-flex items-center justify-center gap-1 text-[10px] font-semibold text-postbox-navy underline-offset-2 hover:underline"
                                    @click="resetDemo"
                                >
                                    <RotateCcw class="size-3" />
                                    Reset demo
                                </button>
                                <Link
                                    :href="howTo()"
                                    class="postbox-btn inline-flex px-2.5 py-1 text-[10px] sm:px-3 sm:text-xs"
                                >
                                    Get the extension
                                    <ArrowRight class="size-3" />
                                </Link>
                            </div>
                        </div>
                    </div>

                    <template v-else>
                        <form
                            class="min-h-0 flex-1 px-3 pt-2 sm:px-4"
                            @submit.prevent
                        >
                            <div class="grid shrink-0 gap-1.5 sm:grid-cols-2">
                                <template
                                    v-for="field in MOCK_FIELDS"
                                    :key="field.id"
                                >
                                    <div
                                        :class="
                                            field.half
                                                ? 'sm:col-span-1'
                                                : 'sm:col-span-2'
                                        "
                                    >
                                        <label
                                            :for="`demo-${field.id}`"
                                            class="mb-px block text-[10px] font-medium text-[#3f3f46] sm:text-[11px]"
                                        >
                                            {{ field.label }}
                                            <span class="text-[#c8102e]"
                                                >*</span
                                            >
                                        </label>

                                        <textarea
                                            v-if="field.type === 'textarea'"
                                            :id="`demo-${field.id}`"
                                            :rows="field.rows ?? 2"
                                            :value="formValues[field.id]"
                                            :placeholder="field.placeholder"
                                            readonly
                                            :class="[
                                                'w-full resize-none rounded border border-[#d4d4d8] bg-white px-2 py-0.5 text-[11px] leading-snug text-[#18181b] placeholder:text-[#a1a1aa] focus:outline-none sm:text-xs',
                                                fieldClass(field.id),
                                            ]"
                                        />

                                        <select
                                            v-else-if="field.type === 'select'"
                                            :id="`demo-${field.id}`"
                                            :value="formValues[field.id]"
                                            disabled
                                            :class="[
                                                'w-full rounded border border-[#d4d4d8] bg-white px-2 py-0.5 text-[11px] text-[#18181b] focus:outline-none disabled:opacity-100 sm:text-xs',
                                                fieldClass(field.id),
                                            ]"
                                        >
                                            <option
                                                v-for="option in field.options"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                {{ option.label }}
                                            </option>
                                        </select>

                                        <div
                                            v-else-if="field.type === 'file'"
                                            :class="[
                                                'flex items-center gap-1.5 rounded border border-dashed border-[#d4d4d8] bg-white px-2 py-1 text-[11px] transition-colors duration-200 sm:text-xs',
                                                formValues[field.id]
                                                    ? 'border-[#86efac] bg-[#f0fdf4]'
                                                    : 'text-[#71717a]',
                                                fieldClass(field.id),
                                            ]"
                                        >
                                            <FileText
                                                class="size-3.5 shrink-0 sm:size-4"
                                                :class="
                                                    formValues[field.id]
                                                        ? 'text-[#16a34a]'
                                                        : 'text-[#a1a1aa]'
                                                "
                                            />
                                            <span
                                                :class="
                                                    formValues[field.id]
                                                        ? 'truncate font-medium text-[#166534]'
                                                        : 'truncate'
                                                "
                                            >
                                                {{
                                                    formValues[field.id] ||
                                                    'Drop resume or browse'
                                                }}
                                            </span>
                                        </div>

                                        <input
                                            v-else
                                            :id="`demo-${field.id}`"
                                            :type="field.type"
                                            :value="formValues[field.id]"
                                            :placeholder="field.placeholder"
                                            readonly
                                            :class="[
                                                'w-full rounded border border-[#d4d4d8] bg-white px-2 py-0.5 text-[11px] text-[#18181b] placeholder:text-[#a1a1aa] focus:outline-none sm:text-xs',
                                                fieldClass(field.id),
                                            ]"
                                        />
                                    </div>
                                </template>
                            </div>
                        </form>

                        <div
                            class="shrink-0 border-t border-[#e4e4e7] bg-white px-3 py-2 sm:px-4"
                        >
                            <div
                                class="flex flex-wrap items-center gap-x-2 gap-y-1"
                            >
                                <button
                                    type="button"
                                    class="inline-flex shrink-0 items-center justify-center border-2 border-postbox-navy bg-postbox-red px-2.5 py-1.5 text-[11px] leading-tight font-bold whitespace-nowrap text-white shadow-[2px_2px_0_rgb(27_54_93_/_8%)] transition-[filter] hover:brightness-105 disabled:cursor-wait disabled:opacity-70 sm:px-3 sm:py-2 sm:text-xs"
                                    :disabled="isFilling"
                                    @click="startDraftAll"
                                >
                                    Draft All
                                </button>
                                <span
                                    v-if="progressLabel"
                                    class="min-w-0 flex-1 text-[10px] leading-snug text-[#6b6b6b]"
                                >
                                    {{ progressLabel }}
                                </span>
                                <button
                                    v-if="filledCount > 0"
                                    type="button"
                                    class="inline-flex items-center gap-1 text-[10px] font-semibold text-postbox-navy underline-offset-2 hover:underline"
                                    :disabled="isFilling"
                                    @click="resetDemo"
                                >
                                    <RotateCcw class="size-3" />
                                    Reset demo
                                </button>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </section>
</template>
