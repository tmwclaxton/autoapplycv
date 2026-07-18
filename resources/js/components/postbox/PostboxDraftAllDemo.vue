<script setup lang="ts">
import { ArrowRight, CheckCircle2, FileText, RotateCcw } from 'lucide-vue-next';
import { computed, onUnmounted, reactive, ref } from 'vue';
import { CHROME_WEB_STORE_URL } from '@/lib/site';

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

    return 'outline outline-2 outline-postbox-red outline-offset-1 transition-[outline] duration-150';
}

onUnmounted(() => {
    cancelled.value = true;
});
</script>

<template>
    <section class="mt-12">
        <p class="postbox-label mb-2">Interactive demo</p>
        <h2
            class="text-xl font-bold tracking-tight text-balance text-postbox-navy sm:text-2xl"
        >
            Try Draft All
        </h2>
        <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
            Click the red button - the same one on real job forms - and watch
            your profile fill the application in seconds.
        </p>

        <div class="postbox-panel mt-6 overflow-hidden p-0">
            <div
                class="border-b-2 border-postbox-navy bg-postbox-grey px-3 py-2 sm:px-4"
            >
                <div
                    class="border-2 border-postbox-navy bg-postbox-surface px-2 py-1 text-center"
                >
                    <span class="block truncate text-xs text-muted-foreground">
                        careers.example.com/apply
                    </span>
                </div>
            </div>

            <div
                class="flex flex-col bg-postbox-paper sm:h-80 sm:overflow-hidden"
            >
                <div
                    class="shrink-0 border-b-2 border-postbox-navy bg-postbox-surface px-3 py-2 sm:px-4"
                >
                    <p class="postbox-label mb-1">Acme Corp · Careers</p>
                    <h3 class="text-sm font-bold text-postbox-navy">
                        Senior Product Designer
                    </h3>
                    <p class="text-xs text-muted-foreground">
                        London · Hybrid · Full-time
                    </p>
                </div>

                <form
                    class="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-3 sm:px-4"
                    @submit.prevent
                >
                    <div class="grid shrink-0 gap-2 sm:grid-cols-2">
                        <template v-for="field in MOCK_FIELDS" :key="field.id">
                            <div
                                :class="
                                    field.half
                                        ? 'sm:col-span-1'
                                        : 'sm:col-span-2'
                                "
                            >
                                <label
                                    :for="`demo-${field.id}`"
                                    class="mb-1 block text-xs font-semibold text-postbox-navy"
                                >
                                    {{ field.label }}
                                    <span class="text-postbox-red">*</span>
                                </label>

                                <textarea
                                    v-if="field.type === 'textarea'"
                                    :id="`demo-${field.id}`"
                                    :rows="field.rows ?? 2"
                                    :value="formValues[field.id]"
                                    :placeholder="field.placeholder"
                                    readonly
                                    :class="[
                                        'postbox-input resize-none py-1 text-xs leading-snug placeholder:text-muted-foreground',
                                        fieldClass(field.id),
                                    ]"
                                />

                                <select
                                    v-else-if="field.type === 'select'"
                                    :id="`demo-${field.id}`"
                                    :value="formValues[field.id]"
                                    disabled
                                    :class="[
                                        'postbox-input py-1 text-xs disabled:opacity-100',
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
                                        'postbox-dropzone flex items-center gap-1.5 px-2 py-1.5 text-xs transition-colors duration-200',
                                        formValues[field.id]
                                            ? 'border-postbox-navy bg-postbox-grey'
                                            : 'text-muted-foreground',
                                        fieldClass(field.id),
                                    ]"
                                >
                                    <FileText
                                        class="size-3.5 shrink-0 sm:size-4"
                                        :class="
                                            formValues[field.id]
                                                ? 'text-postbox-red'
                                                : 'text-muted-foreground'
                                        "
                                    />
                                    <span
                                        :class="
                                            formValues[field.id]
                                                ? 'truncate font-semibold text-postbox-navy'
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
                                        'postbox-input py-1 text-xs placeholder:text-muted-foreground',
                                        fieldClass(field.id),
                                    ]"
                                />
                            </div>
                        </template>
                    </div>
                </form>

                <div
                    class="shrink-0 border-t-2 border-postbox-navy px-3 py-2 sm:px-4"
                    :class="
                        isComplete ? 'bg-postbox-grey' : 'bg-postbox-surface'
                    "
                >
                    <div
                        v-if="isComplete"
                        class="flex flex-col gap-2 py-1 sm:flex-row sm:items-center sm:justify-between sm:py-0"
                    >
                        <div class="flex min-w-0 items-center gap-1.5">
                            <CheckCircle2
                                class="size-3.5 shrink-0 text-postbox-red sm:size-4"
                            />
                            <p
                                class="truncate text-xs font-bold text-postbox-navy"
                            >
                                Form filled from your profile
                                <span
                                    class="hidden font-normal text-muted-foreground sm:inline"
                                >
                                    - no copy-paste on real forms
                                </span>
                            </p>
                        </div>
                        <div class="flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                class="postbox-link inline-flex items-center gap-0.5 text-xs font-semibold no-underline hover:underline"
                                @click="resetDemo"
                            >
                                <RotateCcw class="size-3" />
                                Reset
                            </button>
                            <a
                                :href="CHROME_WEB_STORE_URL"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="postbox-link inline-flex items-center gap-0.5 text-xs font-semibold no-underline hover:underline"
                            >
                                Get extension
                                <ArrowRight class="size-3" />
                            </a>
                        </div>
                    </div>

                    <div
                        v-else
                        class="flex flex-col gap-2 py-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1 sm:py-0"
                    >
                        <button
                            type="button"
                            class="postbox-btn shrink-0 px-3 py-1.5 text-xs whitespace-nowrap"
                            :disabled="isFilling"
                            @click="startDraftAll"
                        >
                            Draft All
                        </button>
                        <span
                            v-if="progressLabel"
                            class="min-w-0 flex-1 text-xs leading-snug text-muted-foreground"
                        >
                            {{ progressLabel }}
                        </span>
                        <button
                            v-if="filledCount > 0"
                            type="button"
                            class="postbox-link inline-flex items-center gap-1 text-xs font-semibold no-underline hover:underline"
                            :disabled="isFilling"
                            @click="resetDemo"
                        >
                            <RotateCcw class="size-3" />
                            Reset demo
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>
