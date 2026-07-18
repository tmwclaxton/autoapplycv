<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { computed, onMounted, ref } from 'vue';

const props = defineProps<{
    extensionId: string;
    token: string;
    apiBase: string;
}>();

const status = ref('Connecting your extension…');
const failed = ref(false);
const copied = ref(false);

const connectionJson = computed(() =>
    JSON.stringify(
        {
            token: props.token,
            api_base: props.apiBase,
        },
        null,
        0,
    ),
);

type RuntimeMessenger = {
    sendMessage: (
        extensionId: string,
        message: Record<string, string>,
        callback: (response?: { success?: boolean; error?: string }) => void,
    ) => void;
    lastError?: { message?: string };
};

function getRuntimeMessenger(): RuntimeMessenger | null {
    const win = window as Window & {
        chrome?: { runtime?: RuntimeMessenger };
        browser?: { runtime?: RuntimeMessenger };
    };

    return win.chrome?.runtime ?? win.browser?.runtime ?? null;
}

async function copyConnectionJson(): Promise<void> {
    await navigator.clipboard.writeText(connectionJson.value);
    copied.value = true;
    window.setTimeout(() => {
        copied.value = false;
    }, 2000);
}

function showManualConnect(message: string): void {
    failed.value = true;
    status.value = message;
}

onMounted(() => {
    const runtime = getRuntimeMessenger();

    if (!runtime?.sendMessage) {
        // Firefox does not support web-page → extension messaging.
        showManualConnect(
            'Copy the connection JSON below and paste it into the extension side panel.',
        );

        return;
    }

    runtime.sendMessage(
        props.extensionId,
        {
            type: 'EXTENSION_AUTH_COMPLETE',
            token: props.token,
            apiBase: props.apiBase,
        },
        (response) => {
            if (runtime.lastError || response?.error) {
                showManualConnect(
                    'Automatic connect failed. Copy the connection JSON below and paste it into the extension side panel.',
                );

                return;
            }

            status.value = 'Extension connected! You can close this tab.';
            window.setTimeout(() => window.close(), 1500);
        },
    );
});
</script>

<template>
    <Head title="Connect extension" />

    <div
        class="flex min-h-screen items-center justify-center bg-postbox-grey px-4 py-10"
    >
        <div
            class="w-full max-w-md border-2 border-postbox-navy bg-postbox-surface p-6 shadow-[4px_4px_0_rgb(27_54_93_/_18%)] sm:p-8"
        >
            <p class="postbox-badge mb-4 inline-flex">AutoCVApply extension</p>
            <h1 class="text-xl font-bold text-postbox-navy">
                {{ failed ? 'Finish connecting' : 'Connecting extension' }}
            </h1>
            <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
                {{ status }}
            </p>

            <div v-if="failed" class="mt-5 space-y-3">
                <pre
                    class="max-h-40 overflow-auto rounded border border-postbox-navy/20 bg-postbox-grey p-3 text-xs break-all whitespace-pre-wrap text-postbox-navy"
                    >{{ connectionJson }}</pre
                >
                <button
                    type="button"
                    class="bg-postbox-yellow hover:bg-postbox-yellow/90 w-full border-2 border-postbox-navy px-4 py-2 text-sm font-semibold text-postbox-navy transition"
                    @click="copyConnectionJson"
                >
                    {{ copied ? 'Copied' : 'Copy connection JSON' }}
                </button>
            </div>
        </div>
    </div>
</template>
