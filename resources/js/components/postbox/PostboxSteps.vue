<script setup lang="ts">
import { SETUP_STEPS } from '@/lib/site';

withDefaults(
    defineProps<{
        title?: string | null;
        description?: string | null;
    }>(),
    {
        title: null,
        description: null,
    },
);
</script>

<template>
    <section>
        <h2
            v-if="title"
            class="text-2xl font-bold text-postbox-navy sm:text-3xl"
        >
            {{ title }}
        </h2>
        <p v-if="description" class="mt-2 text-muted-foreground">
            {{ description }}
        </p>

        <ol
            class="grid gap-4 md:grid-cols-3"
            :class="title || description ? 'mt-8' : ''"
        >
            <li
                v-for="step in SETUP_STEPS"
                :key="step.number"
                class="postbox-panel p-5"
            >
                <p class="text-sm font-bold text-postbox-red">
                    {{ step.number }}
                </p>
                <h3 class="mt-2 text-lg font-bold text-postbox-navy">
                    {{ step.title }}
                </h3>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {{ step.description }}
                </p>
            </li>
        </ol>
    </section>
</template>
