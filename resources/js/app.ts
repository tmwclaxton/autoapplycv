import { library } from '@fortawesome/fontawesome-svg-core';
import { fab } from '@fortawesome/free-brands-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { createInertiaApp } from '@inertiajs/vue3';
import { createPinia } from 'pinia';
import { createApp, h } from 'vue';
import { initializeTheme } from '@/composables/useAppearance';
import PostboxAppLayout from '@/layouts/PostboxAppLayout.vue';
import SettingsLayout from '@/layouts/settings/Layout.vue';
import { initializeFlashToast } from '@/lib/flashToast';
import { initializeGoogleAnalytics } from '@/lib/googleAnalytics';

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
        createApp({ render: () => h(App, props) })
            .use(plugin)
            .use(createPinia())
            .component('font-awesome-icon', FontAwesomeIcon)
            .mount(el);
    },
});

// This will set light / dark mode on page load...
initializeTheme();

// This will listen for flash toast data from the server...
initializeFlashToast();

// GA4 pageviews on Inertia navigations (tag is injected in app.blade.php)...
initializeGoogleAnalytics();
