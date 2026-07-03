<script setup lang="ts">
import type { ApplicationSettings } from '@/types/cvProfile';

const applicationSettings = defineModel<ApplicationSettings>({
    required: true,
});
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
                placeholder="Roles, locations, remote/hybrid, industries, notice period…"
            />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
            <div>
                <label for="field-phone-country-code" class="postbox-label"
                    >Phone country code</label
                >
                <select
                    id="field-phone-country-code"
                    v-model="applicationSettings.phone_country_code"
                    name="tel-country-code"
                    autocomplete="tel-country-code"
                    class="postbox-input mt-2"
                >
                    <option value="+44">United Kingdom (+44)</option>
                    <option value="+1">United States / Canada (+1)</option>
                    <option value="+353">Ireland (+353)</option>
                    <option value="+33">France (+33)</option>
                    <option value="+49">Germany (+49)</option>
                    <option value="+61">Australia (+61)</option>
                </select>
            </div>

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

        <div>
            <label for="field-expected-salary" class="postbox-label"
                >Expected salary (optional)</label
            >
            <input
                id="field-expected-salary"
                v-model="applicationSettings.expected_salary"
                name="expected_salary"
                type="text"
                autocomplete="off"
                class="postbox-input mt-2"
                placeholder="e.g. £45,000"
            />
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
