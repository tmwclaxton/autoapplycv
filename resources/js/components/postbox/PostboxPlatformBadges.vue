<script setup lang="ts">
import { PLATFORM_MARKETING_LINE, SUPPORTED_PLATFORMS } from '@/lib/site';
</script>

<template>
    <section class="postbox-panel-muted p-5 sm:p-6">
        <p class="postbox-label mb-2">Works on major ATS and career sites</p>
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
    </section>
</template>
