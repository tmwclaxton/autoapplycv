<script setup lang="ts">
import {
    AUTO_APPLY_COMING_SOON_PLATFORMS,
    AUTO_APPLY_MARKETING_LINE,
    AUTO_APPLY_SUPPORTED_PLATFORMS,
    PLATFORM_MARKETING_LINE,
    SUPPORTED_PLATFORMS,
    platformLogoUrl,
} from '@/lib/site';

defineProps<{
    showAutoApplyPlatforms?: boolean;
}>();

type PlatformBadge = {
    name: string;
    logoUrl: string | null;
};

function toBadges(platforms: readonly string[]): PlatformBadge[] {
    return platforms.map((name) => ({
        name,
        logoUrl: platformLogoUrl(name),
    }));
}

const atsPlatforms = toBadges(SUPPORTED_PLATFORMS);
const autoApplySupported = toBadges(AUTO_APPLY_SUPPORTED_PLATFORMS);
const autoApplyComingSoon = toBadges(AUTO_APPLY_COMING_SOON_PLATFORMS);

function onLogoError(event: Event): void {
    const img = event.target;

    if (img instanceof HTMLImageElement) {
        img.remove();
    }
}
</script>

<template>
    <section class="postbox-panel-muted p-5 sm:p-6">
        <p class="postbox-label mb-2">Autofill on ATS and career sites</p>
        <p class="mb-4 text-sm leading-relaxed text-muted-foreground">
            {{ PLATFORM_MARKETING_LINE }}
        </p>
        <div class="flex flex-wrap gap-2">
            <span
                v-for="platform in atsPlatforms"
                :key="platform.name"
                class="postbox-badge"
            >
                <img
                    v-if="platform.logoUrl"
                    :src="platform.logoUrl"
                    alt=""
                    class="postbox-badge-logo"
                    width="14"
                    height="14"
                    loading="lazy"
                    decoding="async"
                    @error="onLogoError"
                />
                {{ platform.name }}
            </span>
            <span class="postbox-badge-more">+ more</span>
        </div>

        <template v-if="showAutoApplyPlatforms">
            <p class="postbox-label mt-6 mb-2">Auto Apply platforms</p>
            <p class="mb-4 text-sm leading-relaxed text-muted-foreground">
                End-to-end apply from the extension sidebar on job boards.
                {{ AUTO_APPLY_MARKETING_LINE }} are supported today - more
                boards across the UK, Ireland, US, Canada, Australia, and New
                Zealand coming soon.
            </p>
            <div class="flex flex-wrap gap-2">
                <span
                    v-for="platform in autoApplySupported"
                    :key="platform.name"
                    class="postbox-badge-supported"
                >
                    <img
                        v-if="platform.logoUrl"
                        :src="platform.logoUrl"
                        alt=""
                        class="postbox-badge-logo postbox-badge-logo-on-supported"
                        width="14"
                        height="14"
                        loading="lazy"
                        decoding="async"
                        @error="onLogoError"
                    />
                    {{ platform.name }} · Supported
                </span>
            </div>
            <p class="postbox-label mt-4 mb-2">Platforms Coming Soon:</p>
            <div class="flex flex-wrap gap-2">
                <span
                    v-for="platform in autoApplyComingSoon"
                    :key="platform.name"
                    class="postbox-badge border-dashed"
                >
                    <img
                        v-if="platform.logoUrl"
                        :src="platform.logoUrl"
                        alt=""
                        class="postbox-badge-logo"
                        width="14"
                        height="14"
                        loading="lazy"
                        decoding="async"
                        @error="onLogoError"
                    />
                    {{ platform.name }}
                </span>
                <span class="postbox-badge-more">+ more</span>
            </div>
        </template>
    </section>
</template>
