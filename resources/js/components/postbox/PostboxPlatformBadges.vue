<script setup lang="ts">
import {
    AUTO_APPLY_COMING_SOON_PLATFORMS,
    AUTO_APPLY_SUPPORTED_PLATFORMS,
    PLATFORM_MARKETING_LINE,
    SUPPORTED_PLATFORMS,
} from '@/lib/site';

defineProps<{
    showAutoApplyPlatforms?: boolean;
}>();
</script>

<template>
    <section class="postbox-panel-muted p-5 sm:p-6">
        <p class="postbox-label mb-2">Autofill on ATS and career sites</p>
        <p class="mb-4 text-sm leading-relaxed text-muted-foreground">
            {{ PLATFORM_MARKETING_LINE }}
        </p>
        <div class="flex flex-wrap gap-2">
            <span
                v-for="platform in SUPPORTED_PLATFORMS"
                :key="platform"
                class="postbox-badge"
            >
                {{ platform }}
            </span>
            <span class="postbox-badge-more">+ more</span>
        </div>

        <template v-if="showAutoApplyPlatforms">
            <p class="postbox-label mt-6 mb-2">Auto Apply platforms</p>
            <p class="mb-4 text-sm leading-relaxed text-muted-foreground">
                End-to-end apply from the extension sidebar on job boards.
                LinkedIn Easy Apply, Indeed Apply, and Totaljobs Quick Apply are
                supported today - more boards across the UK, Ireland, US,
                Canada, Australia, and New Zealand coming soon.
            </p>
            <div class="flex flex-wrap gap-2">
                <span
                    v-for="platform in AUTO_APPLY_SUPPORTED_PLATFORMS"
                    :key="platform"
                    class="postbox-badge"
                >
                    {{ platform }} · Supported
                </span>
                <span
                    v-for="platform in AUTO_APPLY_COMING_SOON_PLATFORMS"
                    :key="platform"
                    class="postbox-badge border-dashed"
                >
                    {{ platform }} · Coming soon
                </span>
                <span class="postbox-badge-more">+ more</span>
            </div>
        </template>
    </section>
</template>
