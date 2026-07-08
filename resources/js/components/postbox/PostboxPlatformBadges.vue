<script setup lang="ts">
import {
    AUTO_APPLY_COMING_SOON_PLATFORMS,
    PLATFORM_MARKETING_LINE,
    SUPPORTED_PLATFORMS,
} from '@/lib/site';

defineProps<{
    showAutoApplyPlatforms?: boolean;
}>();
</script>

<template>
    <section class="postbox-panel-muted p-5 sm:p-6">
        <p class="postbox-label mb-2">Autofill on major job sites</p>
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
            <span class="postbox-badge border-dashed">+ more</span>
        </div>

        <template v-if="showAutoApplyPlatforms">
            <p class="postbox-label mt-6 mb-2">Auto Apply platforms</p>
            <p class="mb-4 text-sm leading-relaxed text-muted-foreground">
                End-to-end apply from the extension sidebar. LinkedIn Easy Apply
                and Indeed Apply are supported today - more platforms coming
                soon.
            </p>
            <div class="flex flex-wrap gap-2">
                <span class="postbox-badge">LinkedIn · Supported</span>
                <span class="postbox-badge">Indeed · Supported</span>
                <span
                    v-for="platform in AUTO_APPLY_COMING_SOON_PLATFORMS"
                    :key="platform"
                    class="postbox-badge border-dashed"
                >
                    {{ platform }} · Coming soon
                </span>
            </div>
        </template>
    </section>
</template>
