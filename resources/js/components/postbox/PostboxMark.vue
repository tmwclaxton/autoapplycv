<script setup lang="ts">
withDefaults(
    defineProps<{
        size?: 'sm' | 'md' | 'lg';
    }>(),
    {
        size: 'md',
    },
);

const sizeClasses = {
    sm: 'size-7 text-[10px]',
    md: 'size-9 text-xs',
    lg: 'size-12 text-sm',
};
</script>

<template>
    <div
        :class="[
            'postbox-stamp flex shrink-0 items-center justify-center font-bold uppercase tracking-tighter',
            sizeClasses[size],
        ]"
        aria-hidden="true"
    >
        CV
    </div>
</template>
