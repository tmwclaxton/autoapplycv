<script setup lang="ts">
import { ClipboardList } from 'lucide-vue-next';
import { ref } from 'vue';
import { useToastStore } from '@/stores/toastStore';

export interface ApplicationArtifactRecord {
    id: number;
    type: string;
    type_label: string;
    title: string;
    content: string;
    created_at: string;
}

export interface JobApplicationRecord {
    id: number;
    title: string;
    company: string;
    link: string;
    location?: string | null;
    job_description?: string | null;
    source: string;
    status: string;
    status_label: string;
    ats_score?: number | null;
    notes?: string | null;
    applied_at: string;
    artifacts?: ApplicationArtifactRecord[];
}

export interface StatusOption {
    value: string;
    label: string;
}

const props = defineProps<{
    applications: JobApplicationRecord[];
    statusOptions: StatusOption[];
}>();

const emit = defineEmits<{
    applicationUpdated: [application: JobApplicationRecord];
}>();

const toastStore = useToastStore();
const expandedId = ref<number | null>(null);
const savingId = ref<number | null>(null);

function csrfToken(): string {
    return (
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ?? ''
    );
}

function formatDate(value: string): string {
    return new Date(value).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

async function updateStatus(application: JobApplicationRecord, status: string): Promise<void> {
    savingId.value = application.id;

    try {
        const response = await fetch(`/applications/${application.id}`, {
            method: 'PATCH',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
            },
            body: JSON.stringify({ status }),
        });

        const data = await response.json();

        if (!response.ok) {
            toastStore.error(data.message || 'Could not update application status.');

            return;
        }

        emit('applicationUpdated', data.application);
        toastStore.success('Application status updated.');
    } catch {
        toastStore.error('Could not update application status.');
    } finally {
        savingId.value = null;
    }
}

function exportCsv(): void {
    if (props.applications.length === 0) {
        return;
    }

    const headers = ['Date', 'Status', 'Job Title', 'Company', 'Source', 'ATS Score', 'Link'];
    const rows = props.applications.map((application) => [
        formatDate(application.applied_at),
        application.status_label,
        `"${application.title.replace(/"/g, '""')}"`,
        `"${application.company.replace(/"/g, '""')}"`,
        application.source,
        application.ats_score ?? '',
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
                    Track every application from the extension bots and autofill, with status
                    pipeline and saved AI documents.
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
            <p>Start the LinkedIn or Indeed bot from the extension popup.</p>
        </div>

        <div v-else class="mt-6 overflow-x-auto">
            <table class="min-w-full text-left text-sm">
                <thead class="border-b border-border text-muted-foreground">
                    <tr>
                        <th class="pb-2 pr-4 font-medium">Applied</th>
                        <th class="pb-2 pr-4 font-medium">Status</th>
                        <th class="pb-2 pr-4 font-medium">Role</th>
                        <th class="pb-2 pr-4 font-medium">Company</th>
                        <th class="pb-2 pr-4 font-medium">Source</th>
                        <th class="pb-2 pr-4 font-medium">ATS</th>
                        <th class="pb-2 font-medium">Details</th>
                    </tr>
                </thead>
                <tbody>
                    <template v-for="application in applications" :key="application.id">
                        <tr class="border-b border-border/60 last:border-0">
                            <td class="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                                {{ formatDate(application.applied_at) }}
                            </td>
                            <td class="py-3 pr-4">
                                <select
                                    class="postbox-input py-1 text-xs"
                                    :value="application.status"
                                    :disabled="savingId === application.id"
                                    @change="
                                        updateStatus(
                                            application,
                                            ($event.target as HTMLSelectElement).value,
                                        )
                                    "
                                >
                                    <option
                                        v-for="option in statusOptions"
                                        :key="option.value"
                                        :value="option.value"
                                    >
                                        {{ option.label }}
                                    </option>
                                </select>
                            </td>
                            <td class="py-3 pr-4 font-medium text-postbox-navy">
                                {{ application.title }}
                            </td>
                            <td class="py-3 pr-4">{{ application.company }}</td>
                            <td class="py-3 pr-4 capitalize">{{ application.source }}</td>
                            <td class="py-3 pr-4">
                                <span v-if="application.ats_score !== null && application.ats_score !== undefined">
                                    {{ application.ats_score }}%
                                </span>
                                <span v-else class="text-muted-foreground">—</span>
                            </td>
                            <td class="py-3">
                                <button
                                    type="button"
                                    class="postbox-link text-xs"
                                    @click="
                                        expandedId =
                                            expandedId === application.id
                                                ? null
                                                : application.id
                                    "
                                >
                                    {{ expandedId === application.id ? 'Hide' : 'View' }}
                                </button>
                                <a
                                    :href="application.link"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="postbox-link ml-3 text-xs"
                                >
                                    Open
                                </a>
                            </td>
                        </tr>
                        <tr v-if="expandedId === application.id">
                            <td colspan="7" class="pb-4">
                                <div class="rounded-xl bg-postbox-grey/50 p-4 text-sm">
                                    <p
                                        v-if="application.location"
                                        class="text-muted-foreground"
                                    >
                                        {{ application.location }}
                                    </p>
                                    <p
                                        v-if="application.job_description"
                                        class="mt-3 whitespace-pre-wrap text-postbox-navy"
                                    >
                                        {{ application.job_description.slice(0, 1200) }}
                                        <span
                                            v-if="application.job_description.length > 1200"
                                        >
                                            …
                                        </span>
                                    </p>
                                    <div
                                        v-if="application.artifacts?.length"
                                        class="mt-4 space-y-3"
                                    >
                                        <p class="font-medium text-postbox-navy">
                                            Saved documents
                                        </p>
                                        <details
                                            v-for="artifact in application.artifacts"
                                            :key="artifact.id"
                                            class="rounded-lg border border-border bg-white p-3"
                                        >
                                            <summary class="cursor-pointer font-medium">
                                                {{ artifact.type_label }} ·
                                                {{ formatDate(artifact.created_at) }}
                                            </summary>
                                            <pre
                                                class="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-postbox-navy"
                                            >{{ artifact.content }}</pre>
                                        </details>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
        </div>
    </div>
</template>
