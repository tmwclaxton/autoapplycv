<script setup lang="ts">
import { Form, Head, usePage } from '@inertiajs/vue3';
import { setLayoutProps } from '@inertiajs/vue3';
import { computed } from 'vue';
import DeleteUser from '@/components/DeleteUser.vue';
import InputError from '@/components/InputError.vue';
import ProfileController from '@/actions/App/Http/Controllers/Settings/ProfileController';

setLayoutProps({
    tagline: 'Your account, your control.',
});

type Props = {
    status?: string;
};

defineProps<Props>();

const page = usePage();
const user = computed(() => page.props.auth.user);
</script>

<template>
    <Head title="Profile settings" />

    <h1 class="sr-only">Profile settings</h1>

    <div class="space-y-8">
        <div>
            <h2 class="text-lg font-bold text-postbox-navy">
                Profile information
            </h2>
            <p class="mt-1 text-sm text-muted-foreground">
                Update your name and email address.
            </p>
        </div>

        <Form
            v-bind="ProfileController.update.form()"
            class="space-y-6"
            v-slot="{ errors, processing }"
        >
            <div>
                <label for="name" class="postbox-label">Name</label>
                <input
                    id="name"
                    class="postbox-input mt-1"
                    name="name"
                    :default-value="user.name"
                    required
                    autocomplete="name"
                    placeholder="Full name"
                />
                <InputError class="mt-2" :message="errors.name" />
            </div>

            <div>
                <label for="email" class="postbox-label">Email address</label>
                <input
                    id="email"
                    type="email"
                    class="postbox-input mt-1 opacity-70"
                    name="email"
                    :default-value="user.email"
                    required
                    autocomplete="username"
                    placeholder="Email address"
                    disabled
                />
                <InputError class="mt-2" :message="errors.email" />
            </div>

            <div class="flex items-center gap-4">
                <button
                    type="submit"
                    class="postbox-btn"
                    :disabled="processing"
                    data-test="update-profile-button"
                >
                    Save changes
                </button>
            </div>
        </Form>

        <DeleteUser />
    </div>
</template>
