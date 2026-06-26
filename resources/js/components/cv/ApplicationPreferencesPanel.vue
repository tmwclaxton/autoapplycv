<script setup lang="ts">
import type { ApplicationSettings } from '@/types/cvProfile';

const applicationSettings = defineModel<ApplicationSettings>({ required: true });
</script>

<template>
    <div class="postbox-panel space-y-6 p-6">
        <div>
            <h2 class="postbox-label">What you're looking for</h2>
            <p class="mt-1 text-sm text-muted-foreground">
                These answers feed the extension when it drafts application forms and open-ended
                questions. Edit your CV profile on the other tabs.
            </p>
        </div>

        <div>
            <label class="postbox-label">Job preferences</label>
            <textarea
                v-model="applicationSettings.job_preferences"
                class="postbox-input mt-2 min-h-28"
                placeholder="Roles, locations, remote/hybrid, industries, notice period…"
            />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
            <div>
                <label class="postbox-label">Phone country code</label>
                <select v-model="applicationSettings.phone_country_code" class="postbox-input mt-2">
                    <option value="+44">United Kingdom (+44)</option>
                    <option value="+1">United States / Canada (+1)</option>
                    <option value="+353">Ireland (+353)</option>
                    <option value="+33">France (+33)</option>
                    <option value="+49">Germany (+49)</option>
                    <option value="+61">Australia (+61)</option>
                </select>
            </div>

            <div>
                <label class="postbox-label">Years of experience</label>
                <input
                    v-model="applicationSettings.years_of_experience"
                    type="number"
                    min="0"
                    max="50"
                    class="postbox-input mt-2"
                />
            </div>
        </div>

        <div>
            <label class="postbox-label">Expected salary (optional)</label>
            <input
                v-model="applicationSettings.expected_salary"
                class="postbox-input mt-2"
                placeholder="e.g. £45,000"
            />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
            <div>
                <label class="postbox-label">Visa sponsorship needed?</label>
                <select v-model="applicationSettings.visa_sponsorship" class="postbox-input mt-2">
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                </select>
            </div>

            <div>
                <label class="postbox-label">Legally authorized to work?</label>
                <select v-model="applicationSettings.legally_authorized" class="postbox-input mt-2">
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                </select>
            </div>

            <div>
                <label class="postbox-label">Willing to relocate?</label>
                <select v-model="applicationSettings.willing_to_relocate" class="postbox-input mt-2">
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                </select>
            </div>

            <div>
                <label class="postbox-label">Valid driver's license?</label>
                <select v-model="applicationSettings.drivers_license" class="postbox-input mt-2">
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                </select>
            </div>
        </div>
    </div>
</template>
