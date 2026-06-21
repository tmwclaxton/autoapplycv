<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { ArrowRight } from 'lucide-vue-next';
import PostboxMark from '@/components/postbox/PostboxMark.vue';
import { login } from '@/routes';

withDefaults(
    defineProps<{
        title?: string;
        description?: string;
        buttonLabel?: string;
    }>(),
    {
        title: 'Ready to post?',
        description: 'Free. No card. Your CV stays yours.',
        buttonLabel: 'Start applying',
    },
);
</script>

<template>
    <section
        class="postbox-panel flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"
    >
        <div>
            <div class="mb-3 flex items-center gap-3">
                <PostboxMark size="sm" />
                <h2 class="text-xl font-bold text-postbox-navy md:text-2xl">
                    {{ title }}
                </h2>
            </div>
            <p class="text-sm text-muted-foreground">
                {{ description }}
            </p>
        </div>
        <Link :href="login()" class="postbox-btn w-full shrink-0 sm:w-auto">
            {{ buttonLabel }}
            <ArrowRight class="size-4" />
        </Link>
    </section>
</template>
