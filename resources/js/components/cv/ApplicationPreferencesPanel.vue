<script setup lang="ts">
import { computed } from 'vue';
import { computeEarliestStart } from '@/lib/notice-period';
import type { ApplicationSettings } from '@/types/cvProfile';

const applicationSettings = defineModel<ApplicationSettings>({
    required: true,
});

const computedEarliestStart = computed(() =>
    computeEarliestStart(applicationSettings.value.notice_period),
);
</script>

<template>
    <form autocomplete="on" class="postbox-panel space-y-6 p-6" @submit.prevent>
        <div>
            <h2 class="postbox-label">What you're looking for</h2>
            <p class="mt-1 text-sm text-muted-foreground">
                These answers feed the extension when it drafts application
                forms and open-ended questions. Edit your CV profile on the
                other tabs.
            </p>
        </div>

        <div>
            <label for="field-job-preferences" class="postbox-label"
                >Job preferences</label
            >
            <textarea
                id="field-job-preferences"
                v-model="applicationSettings.job_preferences"
                name="job_preferences"
                autocomplete="off"
                class="postbox-input mt-2 min-h-28"
                placeholder="Roles, locations, remote/hybrid, industries…"
            />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
            <div>
                <label for="field-notice-period" class="postbox-label"
                    >Notice period</label
                >
                <input
                    id="field-notice-period"
                    v-model="applicationSettings.notice_period"
                    name="notice_period"
                    type="text"
                    autocomplete="off"
                    class="postbox-input mt-2"
                    placeholder="e.g. 2 weeks"
                />
                <p
                    v-if="computedEarliestStart"
                    class="mt-2 text-sm text-muted-foreground"
                >
                    Earliest start (computed):
                    {{ computedEarliestStart }}
                </p>
            </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
            <div>
                <label for="field-years-of-experience" class="postbox-label"
                    >Years of experience</label
                >
                <input
                    id="field-years-of-experience"
                    v-model="applicationSettings.years_of_experience"
                    name="years_of_experience"
                    type="number"
                    min="0"
                    max="50"
                    autocomplete="off"
                    class="postbox-input mt-2"
                />
            </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
            <div>
                <label for="field-expected-salary-weekly" class="postbox-label"
                    >Expected salary — weekly (optional)</label
                >
                <input
                    id="field-expected-salary-weekly"
                    v-model="applicationSettings.expected_salary_weekly"
                    name="expected_salary_weekly"
                    type="text"
                    autocomplete="off"
                    class="postbox-input mt-2"
                    placeholder="e.g. £850"
                />
            </div>

            <div>
                <label for="field-expected-salary-monthly" class="postbox-label"
                    >Expected salary — monthly (optional)</label
                >
                <input
                    id="field-expected-salary-monthly"
                    v-model="applicationSettings.expected_salary_monthly"
                    name="expected_salary_monthly"
                    type="text"
                    autocomplete="off"
                    class="postbox-input mt-2"
                    placeholder="e.g. £3,500"
                />
            </div>

            <div>
                <label for="field-expected-salary-yearly" class="postbox-label"
                    >Expected salary — yearly (optional)</label
                >
                <input
                    id="field-expected-salary-yearly"
                    v-model="applicationSettings.expected_salary_yearly"
                    name="expected_salary_yearly"
                    type="text"
                    autocomplete="off"
                    class="postbox-input mt-2"
                    placeholder="e.g. £45,000"
                />
            </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
            <div>
                <label for="field-visa-sponsorship" class="postbox-label"
                    >Visa sponsorship needed?</label
                >
                <select
                    id="field-visa-sponsorship"
                    v-model="applicationSettings.visa_sponsorship"
                    name="visa_sponsorship"
                    autocomplete="off"
                    class="postbox-input mt-2"
                >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                </select>
            </div>

            <div>
                <label for="field-legally-authorized" class="postbox-label"
                    >Legally authorized to work?</label
                >
                <select
                    id="field-legally-authorized"
                    v-model="applicationSettings.legally_authorized"
                    name="legally_authorized"
                    autocomplete="off"
                    class="postbox-input mt-2"
                >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                </select>
            </div>

            <div>
                <label for="field-willing-to-relocate" class="postbox-label"
                    >Willing to relocate?</label
                >
                <select
                    id="field-willing-to-relocate"
                    v-model="applicationSettings.willing_to_relocate"
                    name="willing_to_relocate"
                    autocomplete="off"
                    class="postbox-input mt-2"
                >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                </select>
            </div>

            <div>
                <label for="field-drivers-license" class="postbox-label"
                    >Valid driver's license?</label
                >
                <select
                    id="field-drivers-license"
                    v-model="applicationSettings.drivers_license"
                    name="drivers_license"
                    autocomplete="off"
                    class="postbox-input mt-2"
                >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                </select>
            </div>
        </div>
    </form>
</template>
