<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next';
import { computed } from 'vue';
import type { ApplicationAnswer } from '@/types/cvProfile';

const applicationAnswers = defineModel<ApplicationAnswer[]>({
    required: true,
});

const hasAnswers = computed(() => applicationAnswers.value.length > 0);

function addAnswer(): void {
    applicationAnswers.value = [
        ...applicationAnswers.value,
        {
            id: crypto.randomUUID(),
            question: '',
            answer: '',
        },
    ];
}

function removeAnswer(id: string): void {
    applicationAnswers.value = applicationAnswers.value.filter(
        (entry) => entry.id !== id,
    );
}
</script>

<template>
    <form
        autocomplete="on"
        class="postbox-panel space-y-6 p-4 sm:p-6"
        @submit.prevent
    >
        <div>
            <h2 class="postbox-label">Application Q&amp;A</h2>
            <p class="mt-1 text-sm text-muted-foreground">
                Saved answers for questions that do not fit standard profile
                fields. The extension uses these when drafting forms and when
                you choose Save &amp; fill on misc questions.
            </p>
        </div>

        <div
            v-if="!hasAnswers"
            class="postbox-panel-muted border-dashed p-8 text-center"
        >
            <p class="text-sm text-muted-foreground">
                No saved application answers yet.
            </p>
        </div>

        <div v-else class="space-y-4">
            <article
                v-for="entry in applicationAnswers"
                :key="entry.id"
                class="space-y-3 rounded-lg border border-postbox-navy/10 p-4"
            >
                <div>
                    <label
                        :for="`application-qa-question-${entry.id}`"
                        class="postbox-label"
                    >
                        Question
                    </label>
                    <input
                        :id="`application-qa-question-${entry.id}`"
                        v-model="entry.question"
                        type="text"
                        autocomplete="off"
                        class="postbox-input mt-2"
                        placeholder="e.g. Which department are you interested in?"
                    />
                </div>

                <div>
                    <label
                        :for="`application-qa-answer-${entry.id}`"
                        class="postbox-label"
                    >
                        Your answer
                    </label>
                    <textarea
                        :id="`application-qa-answer-${entry.id}`"
                        v-model="entry.answer"
                        rows="3"
                        autocomplete="off"
                        class="postbox-input mt-2 min-h-24"
                        placeholder="Your saved answer"
                    />
                </div>

                <div class="flex justify-end">
                    <button
                        type="button"
                        class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
                        @click="removeAnswer(entry.id)"
                    >
                        <Trash2 class="size-4" />
                        Remove
                    </button>
                </div>
            </article>
        </div>

        <button
            type="button"
            class="postbox-btn-outline inline-flex items-center gap-2 text-sm"
            @click="addAnswer"
        >
            <Plus class="size-4" />
            Add answer
        </button>
    </form>
</template>
