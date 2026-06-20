<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { login, dashboard } from '@/routes';

defineProps<{
    canRegister?: boolean;
}>();
</script>

<template>
    <Head title="AutoCVApply — Apply to jobs faster with AI" />
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
        <!-- Nav -->
        <nav class="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
            <div class="flex items-center gap-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
                    <font-awesome-icon :icon="['fas', 'file-lines']" class="text-sm text-white" />
                </div>
                <span class="text-lg font-bold tracking-tight">AutoCVApply</span>
            </div>
            <div class="flex items-center gap-4">
                <Link
                    v-if="$page.props.auth.user"
                    :href="dashboard()"
                    class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium transition hover:bg-blue-500"
                >
                    Go to Dashboard
                </Link>
                <template v-else>
                    <Link
                        :href="login()"
                        class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium transition hover:bg-blue-500"
                    >
                        Get Started Free
                    </Link>
                </template>
            </div>
        </nav>

        <!-- Hero -->
        <section class="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
            <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300">
                <font-awesome-icon :icon="['fas', 'bolt']" class="text-xs" />
                <span>Powered by AI • Free to use</span>
            </div>
            <h1 class="mb-6 text-5xl font-bold leading-tight tracking-tight lg:text-6xl">
                Stop copy-pasting your CV.<br />
                <span class="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                    Let AI fill job forms for you.
                </span>
            </h1>
            <p class="mx-auto mb-10 max-w-2xl text-lg text-slate-300">
                Upload your CV once. Our browser extension auto-fills Workday, Indeed, LinkedIn, Greenhouse, and Lever application forms — instantly.
            </p>
            <div class="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link
                    :href="login()"
                    class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold shadow-lg shadow-blue-500/25 transition hover:bg-blue-500"
                >
                    <font-awesome-icon :icon="['fas', 'upload']" />
                    Upload your CV now
                </Link>
                <a
                    href="#how-it-works"
                    class="inline-flex items-center gap-2 rounded-xl border border-white/20 px-8 py-3.5 text-base font-medium transition hover:border-white/40"
                >
                    See how it works
                </a>
            </div>
        </section>

        <!-- Logos -->
        <section class="border-y border-white/10 bg-white/5 py-8">
            <div class="mx-auto max-w-4xl px-6">
                <p class="mb-6 text-center text-sm text-slate-400">Works on all major job platforms</p>
                <div class="flex flex-wrap items-center justify-center gap-8 text-slate-400">
                    <span class="text-sm font-semibold uppercase tracking-wider">Workday</span>
                    <span class="text-slate-600">•</span>
                    <span class="text-sm font-semibold uppercase tracking-wider">Indeed</span>
                    <span class="text-slate-600">•</span>
                    <span class="text-sm font-semibold uppercase tracking-wider">LinkedIn</span>
                    <span class="text-slate-600">•</span>
                    <span class="text-sm font-semibold uppercase tracking-wider">Greenhouse</span>
                    <span class="text-slate-600">•</span>
                    <span class="text-sm font-semibold uppercase tracking-wider">Lever</span>
                    <span class="text-slate-600">•</span>
                    <span class="text-sm font-semibold uppercase tracking-wider">And more</span>
                </div>
            </div>
        </section>

        <!-- How it works -->
        <section id="how-it-works" class="mx-auto max-w-6xl px-6 py-20">
            <h2 class="mb-4 text-center text-3xl font-bold">Three steps to faster applications</h2>
            <p class="mb-14 text-center text-slate-400">Set up once, apply everywhere.</p>
            <div class="grid gap-8 md:grid-cols-3">
                <div class="rounded-2xl border border-white/10 bg-white/5 p-8">
                    <div class="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold">1</div>
                    <h3 class="mb-3 text-xl font-semibold">Upload your CV</h3>
                    <p class="text-slate-400">Drop in your PDF or Word CV. Our AI reads it and extracts your details — name, experience, skills, education, everything.</p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-white/5 p-8">
                    <div class="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-600 text-xl font-bold">2</div>
                    <h3 class="mb-3 text-xl font-semibold">Review &amp; add context</h3>
                    <p class="text-slate-400">Check what was extracted, make edits, and add any extra information you want the extension to know about — career goals, cover letter style, preferences.</p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-white/5 p-8">
                    <div class="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold">3</div>
                    <h3 class="mb-3 text-xl font-semibold">Install the extension</h3>
                    <p class="text-slate-400">Add the Chrome extension. When you visit a job application, hit the button and watch it fill in your details automatically.</p>
                </div>
            </div>
        </section>

        <!-- CTA -->
        <section class="border-t border-white/10 py-20 text-center">
            <div class="mx-auto max-w-2xl px-6">
                <h2 class="mb-4 text-3xl font-bold">Ready to apply smarter?</h2>
                <p class="mb-8 text-slate-400">Free to use. No credit card required. Your data stays yours.</p>
                <Link
                    :href="login()"
                    class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold shadow-lg shadow-blue-500/25 transition hover:bg-blue-500"
                >
                    Get started free
                    <font-awesome-icon :icon="['fas', 'arrow-right']" />
                </Link>
            </div>
        </section>

        <!-- Footer -->
        <footer class="border-t border-white/10 py-8 text-center text-sm text-slate-500">
            <p>© {{ new Date().getFullYear() }} AutoCVApply. Open source under MIT License.</p>
        </footer>
    </div>
</template>
