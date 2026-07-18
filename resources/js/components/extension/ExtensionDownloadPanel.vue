<script setup lang="ts">
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { Chrome, Download, ExternalLink } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { extensionDownloads } from '@/lib/extensionDownloads';

type BrowserChoice = 'chrome' | 'firefox';

withDefaults(
    defineProps<{
        showInstructions?: boolean;
    }>(),
    {
        showInstructions: true,
    },
);

const selectedBrowser = ref<BrowserChoice | null>(null);

const browserOptions: Array<{
    id: BrowserChoice;
    title: string;
    subtitle: string;
}> = [
    {
        id: 'chrome',
        title: 'Chrome, Edge, or Brave',
        subtitle: 'Chromium browsers',
    },
    {
        id: 'firefox',
        title: 'Firefox',
        subtitle: 'Mozilla Firefox',
    },
];

const downloadUrl = computed(() => {
    if (selectedBrowser.value === 'chrome') {
        return extensionDownloads.chrome;
    }

    if (selectedBrowser.value === 'firefox') {
        return extensionDownloads.firefox;
    }

    return null;
});

const downloadFilename = computed(() => {
    if (selectedBrowser.value === 'chrome') {
        return 'autoapplycv-chrome.zip';
    }

    if (selectedBrowser.value === 'firefox') {
        return 'autoapplycv-firefox.zip';
    }

    return null;
});

const downloadLabel = computed(() => {
    if (selectedBrowser.value === 'chrome') {
        return 'Download autoapplycv-chrome.zip';
    }

    if (selectedBrowser.value === 'firefox') {
        return 'Download autoapplycv-firefox.zip';
    }

    return 'Download extension';
});

function selectBrowser(browser: BrowserChoice): void {
    selectedBrowser.value = browser;
}
</script>

<template>
    <div class="space-y-6">
        <div>
            <p class="postbox-label">Step 1 · Choose your browser</p>
            <p class="mt-1 text-sm text-muted-foreground">
                Pick the browser you apply with. We will show the correct
                download and install steps.
            </p>

            <div
                class="mt-4 grid gap-3 sm:grid-cols-2"
                role="radiogroup"
                aria-label="Choose your browser"
            >
                <button
                    v-for="option in browserOptions"
                    :key="option.id"
                    type="button"
                    role="radio"
                    :aria-checked="selectedBrowser === option.id"
                    class="rounded-xl border-2 p-5 text-left transition-colors"
                    :class="
                        selectedBrowser === option.id
                            ? 'border-postbox-red bg-postbox-red/5 shadow-sm'
                            : 'border-postbox-navy/15 bg-postbox-surface hover:border-postbox-navy/30 hover:bg-postbox-grey/30'
                    "
                    @click="selectBrowser(option.id)"
                >
                    <div class="flex items-start gap-4">
                        <div
                            class="flex size-12 shrink-0 items-center justify-center border-2 border-postbox-navy bg-postbox-grey"
                            :class="
                                selectedBrowser === option.id
                                    ? 'border-postbox-red bg-postbox-red/10'
                                    : ''
                            "
                        >
                            <Chrome
                                v-if="option.id === 'chrome'"
                                class="size-6 text-postbox-navy"
                                aria-hidden="true"
                            />
                            <FontAwesomeIcon
                                v-else
                                :icon="['fab', 'firefox-browser']"
                                class="size-6 text-postbox-navy"
                            />
                        </div>
                        <div class="min-w-0">
                            <p class="font-bold text-postbox-navy">
                                {{ option.title }}
                            </p>
                            <p class="mt-1 text-sm text-muted-foreground">
                                {{ option.subtitle }}
                            </p>
                            <p
                                v-if="selectedBrowser === option.id"
                                class="mt-2 text-xs font-semibold tracking-wide text-postbox-red uppercase"
                            >
                                Selected
                            </p>
                        </div>
                    </div>
                </button>
            </div>
        </div>

        <div
            v-if="!selectedBrowser"
            class="rounded-xl border border-dashed border-postbox-navy/20 bg-postbox-grey/30 px-5 py-8 text-center text-sm text-muted-foreground"
        >
            Select Chrome or Firefox above to continue.
        </div>

        <div v-else class="space-y-5">
            <div class="postbox-panel p-4 sm:p-6">
                <p class="postbox-label">Step 2 · Get the extension</p>

                <template v-if="selectedBrowser === 'chrome'">
                    <p class="mt-1 text-sm text-muted-foreground">
                        Chrome users: install from the Chrome Web Store. Edge
                        and Brave can use the store listing or the zip below.
                    </p>

                    <a
                        :href="extensionDownloads.chromeWebStore"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="postbox-btn mt-5 inline-flex items-center gap-2"
                    >
                        <Chrome class="size-4" aria-hidden="true" />
                        Install from Chrome Web Store
                        <ExternalLink class="size-3.5" aria-hidden="true" />
                    </a>

                    <p class="mt-5 text-sm text-muted-foreground">
                        Prefer a zip? Download and sideload for Edge, Brave, or
                        offline installs.
                    </p>

                    <a
                        v-if="downloadUrl && downloadFilename"
                        :href="downloadUrl"
                        :download="downloadFilename"
                        class="postbox-btn-outline mt-3 inline-flex items-center gap-2"
                    >
                        <Download class="size-4" aria-hidden="true" />
                        {{ downloadLabel }}
                    </a>
                </template>

                <template v-else>
                    <p class="mt-1 text-sm text-muted-foreground">
                        Use
                        <code
                            class="bg-postbox-grey px-1 py-0.5 font-mono text-xs"
                            >autoapplycv-firefox.zip</code
                        >
                        for Firefox (and Mozilla AMO). Do not upload the Chrome
                        zip to AMO.
                    </p>

                    <a
                        v-if="downloadUrl && downloadFilename"
                        :href="downloadUrl"
                        :download="downloadFilename"
                        class="postbox-btn mt-5 inline-flex items-center gap-2"
                    >
                        <Download class="size-4" aria-hidden="true" />
                        {{ downloadLabel }}
                    </a>
                </template>
            </div>

            <div v-if="showInstructions" class="postbox-panel p-4 sm:p-6">
                <p class="postbox-label">Step 3 · Install it</p>

                <ol
                    v-if="selectedBrowser === 'chrome'"
                    class="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground"
                >
                    <li>
                        <strong>Chrome:</strong> open
                        <a
                            :href="extensionDownloads.chromeWebStore"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="postbox-link"
                        >
                            the Chrome Web Store listing
                        </a>
                        and click Add to Chrome.
                    </li>
                    <li>
                        <strong>Edge / Brave (zip):</strong> extract the
                        downloaded zip, open
                        <code
                            class="bg-postbox-grey px-1.5 py-0.5 font-mono text-xs"
                            >chrome://extensions</code
                        >
                        or
                        <code
                            class="bg-postbox-grey px-1.5 py-0.5 font-mono text-xs"
                            >edge://extensions</code
                        >, turn on Developer mode, then Load unpacked and choose
                        the extracted folder (it must contain
                        <code
                            class="bg-postbox-grey px-1 py-0.5 font-mono text-xs"
                            >manifest.json</code
                        >
                        and an
                        <code
                            class="bg-postbox-grey px-1 py-0.5 font-mono text-xs"
                            >icons/</code
                        >
                        folder at the top level).
                    </li>
                    <li>
                        Developing from source? Run
                        <code
                            class="bg-postbox-grey px-1.5 py-0.5 font-mono text-xs"
                            >npm run build:extension</code
                        >
                        and load the
                        <code
                            class="bg-postbox-grey px-1.5 py-0.5 font-mono text-xs"
                            >extension/dist</code
                        >
                        folder - not
                        <code
                            class="bg-postbox-grey px-1.5 py-0.5 font-mono text-xs"
                            >extension/</code
                        >.
                    </li>
                    <li>
                        Generate a connection in the dashboard and paste it into
                        the extension sidebar.
                    </li>
                </ol>

                <ol
                    v-else
                    class="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground"
                >
                    <li>
                        Extract the downloaded zip to a folder on your computer.
                    </li>
                    <li>
                        Open
                        <code
                            class="bg-postbox-grey px-1.5 py-0.5 font-mono text-xs"
                            >about:debugging</code
                        >
                        → This Firefox.
                    </li>
                    <li>
                        Click Load Temporary Add-on and select the extracted
                        <code
                            class="bg-postbox-grey px-1 py-0.5 font-mono text-xs"
                            >manifest.json</code
                        >.
                    </li>
                    <li>
                        Firefox removes temporary add-ons when you quit. Reload
                        the extension after each browser restart.
                    </li>
                    <li>
                        Generate a connection in the dashboard and paste it into
                        the extension sidebar.
                    </li>
                </ol>
            </div>
        </div>
    </div>
</template>
