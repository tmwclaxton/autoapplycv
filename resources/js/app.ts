import { library } from '@fortawesome/fontawesome-svg-core';
import { fab } from '@fortawesome/free-brands-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { createInertiaApp } from '@inertiajs/vue3';
import { createPinia } from 'pinia';
import { createApp, Fragment, h } from 'vue';
import CookieConsentModal from '@/components/CookieConsentModal.vue';
import { initializeTheme } from '@/composables/useAppearance';
import PostboxAppLayout from '@/layouts/PostboxAppLayout.vue';
import SettingsLayout from '@/layouts/settings/Layout.vue';
import { initializeFlashToast } from '@/lib/flashToast';
import { initializeGoogleAnalytics } from '@/lib/googleAnalytics';
import { useCookieConsentStore } from '@/stores/cookieConsentStore';

library.add(fas, far, fab);

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    layout: (name) => {
        const standalonePages = [
            'Welcome',
            'About',
            'Analytics',
            'Contact',
            'HowTo',
            'Pricing',
        ];

        switch (true) {
            case standalonePages.includes(name):
            case name.startsWith('Legal/'):
            case name.startsWith('Blog/'):
                return null;
            case name.startsWith('settings/'):
            case name.startsWith('teams/'):
                return [PostboxAppLayout, SettingsLayout];
            default:
                return PostboxAppLayout;
        }
    },
    progress: {
        color: '#c8102e',
    },
    setup({ el, App, props, plugin }) {
        const pinia = createPinia();

        // Hydrate consent before GA pageview listener can fire on navigate.
        useCookieConsentStore(pinia).hydrate();
        initializeGoogleAnalytics();

        createApp({
            render: () =>
                h(Fragment, null, [h(App, props), h(CookieConsentModal)]),
        })
            .use(plugin)
            .use(pinia)
            .component('font-awesome-icon', FontAwesomeIcon)
            .mount(el);
    },
});

// This will set light / dark mode on page load...
initializeTheme();

// This will listen for flash toast data from the server...
initializeFlashToast();
