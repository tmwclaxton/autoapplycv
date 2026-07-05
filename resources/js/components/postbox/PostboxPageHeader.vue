<script setup lang="ts">
defineProps<{
    title: string;
    description?: string;
    badge?: string;
}>();
</script>

<template>
    <header class="mb-8">
        <span v-if="badge" class="postbox-badge mb-4 inline-flex">
            {{ badge }}
        </span>
        <h1
            class="text-2xl font-bold tracking-tight text-balance text-postbox-navy sm:text-3xl md:text-4xl"
        >
            {{ title }}
        </h1>
        <p
            v-if="description"
            class="mt-3 text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
        >
            {{ description }}
        </p>
    </header>
</template>
