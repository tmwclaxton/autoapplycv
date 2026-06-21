<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { ArrowRight, FileUp, Github, Stamp } from 'lucide-vue-next';
import PostboxMark from '@/components/postbox/PostboxMark.vue';
import PostboxShell from '@/components/postbox/PostboxShell.vue';
import { login, dashboard } from '@/routes';

defineProps<{
    canRegister?: boolean;
}>();

const platforms = ['Workday', 'Indeed', 'LinkedIn', 'Greenhouse', 'Lever'] as const;

const steps = [
    {
        number: '01',
        title: 'Post your CV',
        description:
            'Drop in a PDF or Word file. We read it once and pull out the useful bits.',
    },
    {
        number: '02',
        title: 'Check the details',
        description:
            'Tweak anything we missed — skills, summary, visa status, salary floor, the lot.',
    },
    {
        number: '03',
        title: 'Stamp the forms',
        description:
            'Install the extension. Hit autofill on Workday, Indeed, and the rest.',
    },
] as const;
</script>

<template>
    <Head title="AutoCVApply — Stop retyping your CV" />

    <PostboxShell tagline="Stop retyping your life story.">
        <template #nav>
            <a
                href="https://github.com/tmwclaxton/autoapplycv"
                target="_blank"
                rel="noopener noreferrer"
                class="postbox-btn-outline hidden px-3 py-2 sm:inline-flex"
            >
                <Github class="size-4" />
                GitHub
            </a>
            <Link
                v-if="$page.props.auth.user"
                :href="dashboard()"
                class="postbox-btn"
            >
                Dashboard
            </Link>
            <Link v-else :href="login()" class="postbox-btn">
                Get started
                <ArrowRight class="size-4" />
            </Link>
        </template>

        <section class="max-w-3xl">
            <span class="postbox-badge mb-5 inline-flex gap-1.5">
                <Stamp class="size-3.5" />
                Open source · Free to use
            </span>

            <h1
                class="text-3xl leading-[1.1] font-bold tracking-tight text-balance text-postbox-navy sm:text-5xl"
            >
                Upload once.<br />
                Apply everywhere.
            </h1>

            <p
                class="mt-5 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
            >
                Job forms ask the same questions again and again. AutoCVApply
                stores your CV profile and stamps answers onto Workday, Indeed,
                LinkedIn, Greenhouse, and Lever — without the copy-paste
                marathon.
            </p>

            <div class="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link :href="login()" class="postbox-btn w-full sm:w-auto">
                    <FileUp class="size-5" />
                    Upload your CV
                </Link>
                <a href="#how-it-works" class="postbox-btn-outline w-full sm:w-auto">
                    How it works
                </a>
            </div>
        </section>

        <section class="postbox-panel-muted mt-12 p-5 sm:p-6">
            <p class="postbox-label mb-4">Accepted destinations</p>
            <div class="flex flex-wrap gap-2">
                <span
                    v-for="platform in platforms"
                    :key="platform"
                    class="postbox-badge"
                >
                    {{ platform }}
                </span>
                <span class="postbox-badge border-dashed">+ more</span>
            </div>
        </section>

        <section id="how-it-works" class="mt-12">
            <h2 class="text-2xl font-bold text-postbox-navy sm:text-3xl">
                Three steps. No nonsense.
            </h2>
            <p class="mt-2 text-muted-foreground">
                Set up once. Then let the extension do the boring bit.
            </p>

            <ol class="mt-8 grid gap-4 md:grid-cols-3">
                <li
                    v-for="step in steps"
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

        <section
            class="postbox-panel mt-12 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"
        >
            <div>
                <div class="mb-3 flex items-center gap-3">
                    <PostboxMark size="sm" />
                    <h2 class="text-xl font-bold text-postbox-navy md:text-2xl">
                        Ready to post?
                    </h2>
                </div>
                <p class="text-sm text-muted-foreground">
                    Free. No card. Your CV stays yours.
                </p>
            </div>
            <Link :href="login()" class="postbox-btn w-full shrink-0 sm:w-auto">
                Start applying
                <ArrowRight class="size-4" />
            </Link>
        </section>
    </PostboxShell>
</template>
