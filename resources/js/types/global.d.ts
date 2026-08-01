import type { Auth } from '@/types/auth';

// Extend ImportMeta interface for Vite...
declare module 'vite/client' {
    interface ImportMetaEnv {
        readonly VITE_APP_NAME: string;
        [key: string]: string | boolean | undefined;
    }

    interface ImportMeta {
        readonly env: ImportMetaEnv;
        readonly glob: <T>(pattern: string) => Record<string, () => Promise<T>>;
    }
}

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        flashDataType: {
            success?: string | null;
            error?: string | null;
            purchase_conversion?: Record<string, unknown> | null;
            sign_up_conversion?: {
                transaction_id?: string;
                method?: string;
            } | null;
            credit_award_success?: string | null;
        };
        sharedPageProps: {
            name: string;
            auth: Auth;
            sidebarOpen: boolean;
            flash: {
                success?: string | null;
                error?: string | null;
                purchase_conversion?: Record<string, unknown> | null;
                sign_up_conversion?: {
                    transaction_id?: string;
                    method?: string;
                } | null;
                credit_award_success?: string | null;
            };
            [key: string]: unknown;
        };
    }
}

declare module 'vue' {
    interface ComponentCustomProperties {
        $inertia: typeof Router;
        $page: Page;
        $headManager: ReturnType<typeof createHeadManager>;
    }
}
