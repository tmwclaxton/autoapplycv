<script setup lang="ts">
import { ClipboardList } from 'lucide-vue-next';

export interface JobApplicationRecord {
    id: number;
    title: string;
    company: string;
    link: string;
    location?: string | null;
    source: string;
    applied_at: string;
}

const props = defineProps<{
    applications: JobApplicationRecord[];
}>();

function formatDate(value: string): string {
    return new Date(value).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function exportCsv(): void {
    if (props.applications.length === 0) {
        return;
    }

    const headers = ['Date', 'Job Title', 'Company', 'Link'];
    const rows = props.applications.map((application) => [
        formatDate(application.applied_at),
        `"${application.title.replace(/"/g, '""')}"`,
        `"${application.company.replace(/"/g, '""')}"`,
        application.link,
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `autocvapply-applications-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}
</script>

<template>
    <div class="postbox-panel p-5 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h2 class="text-lg font-semibold text-postbox-navy">Applications</h2>
                <p class="mt-1 text-sm text-muted-foreground">
                    Jobs applied to via the LinkedIn Easy Apply bot in the extension.
                </p>
            </div>
            <button
                type="button"
                class="postbox-btn-outline text-sm"
                :disabled="applications.length === 0"
                @click="exportCsv"
            >
                Export CSV
            </button>
        </div>

        <div
            v-if="applications.length === 0"
            class="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-postbox-navy/15 bg-postbox-grey/40 px-6 py-10 text-center text-sm text-muted-foreground"
        >
            <ClipboardList class="size-8 text-postbox-navy/30" aria-hidden="true" />
            <p>No applications synced yet.</p>
            <p>Start the LinkedIn bot from the extension popup to track applications here.</p>
        </div>

        <div v-else class="mt-6 overflow-x-auto">
            <table class="min-w-full text-left text-sm">
                <thead class="border-b border-border text-muted-foreground">
                    <tr>
                        <th class="pb-2 pr-4 font-medium">Applied</th>
                        <th class="pb-2 pr-4 font-medium">Role</th>
                        <th class="pb-2 pr-4 font-medium">Company</th>
                        <th class="pb-2 font-medium">Link</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="application in applications"
                        :key="application.id"
                        class="border-b border-border/60 last:border-0"
                    >
                        <td class="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                            {{ formatDate(application.applied_at) }}
                        </td>
                        <td class="py-3 pr-4 font-medium text-postbox-navy">
                            {{ application.title }}
                        </td>
                        <td class="py-3 pr-4">{{ application.company }}</td>
                        <td class="py-3">
                            <a
                                :href="application.link"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="postbox-link"
                            >
                                View
                            </a>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
