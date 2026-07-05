<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { onMounted, ref } from 'vue';

const props = defineProps<{
    extensionId: string;
    token: string;
    apiBase: string;
}>();

const status = ref('Connecting your extension…');
const failed = ref(false);

onMounted(() => {
    const chromeApi = (
        window as Window & {
            chrome?: {
                runtime?: {
                    sendMessage: (
                        extensionId: string,
                        message: Record<string, string>,
                        callback: (response?: {
                            success?: boolean;
                            error?: string;
                        }) => void,
                    ) => void;
                    lastError?: { message?: string };
                };
            };
        }
    ).chrome;

    if (!chromeApi?.runtime?.sendMessage) {
        failed.value = true;
        status.value =
            'Could not reach the extension automatically. Close this tab and paste your connection JSON into the extension instead.';

        return;
    }

    chromeApi.runtime.sendMessage(
        props.extensionId,
        {
            type: 'EXTENSION_AUTH_COMPLETE',
            token: props.token,
            apiBase: props.apiBase,
        },
        (response) => {
            if (chromeApi.runtime?.lastError || response?.error) {
                failed.value = true;
                status.value =
                    'Could not connect the extension automatically. Close this tab and paste your connection JSON instead.';

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
                {{ failed ? 'Almost there' : 'Connecting extension' }}
            </h1>
            <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
                {{ status }}
            </p>
        </div>
    </div>
</template>
