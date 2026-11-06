<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}"  @class(['dark' => ($appearance ?? 'system') == 'dark'])>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        {{-- Inline script to detect system dark mode preference and apply it immediately --}}
        <script>
            (function() {
                const appearance = '{{ $appearance ?? "system" }}';

                if (appearance === 'system') {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

                    if (prefersDark) {
                        document.documentElement.classList.add('dark');
                    }
                }
            })();
        </script>

        {{-- Inline style to set the HTML background color based on our theme in app.css --}}
        <style>
            html {
                background-color: #fafaf8;
            }

            html.dark {
                background-color: #0f1219;
            }
        </style>

        <link rel="icon" href="{{ asset('favicon.ico') }}?v=2" sizes="any">
        <link rel="icon" href="{{ asset('favicon.svg') }}?v=2" type="image/svg+xml">
        <link rel="apple-touch-icon" href="{{ asset('apple-touch-icon.png') }}?v=2">

        @fonts

        @vite(['resources/css/app.css', 'resources/js/app.ts', "resources/js/pages/{$page['component']}.vue"])
        <x-inertia::head>
            <title>{{ config('app.name', 'Laravel') }}</title>
        </x-inertia::head>

        @php($googleAnalyticsId = config('analytics.google_analytics_id'))
        @php($googleAdsId = config('analytics.google_ads_id'))
        @php($googleAdsConversions = config('analytics.google_ads_conversions', []))
        @php($gtagBootstrapId = filled($googleAnalyticsId) ? $googleAnalyticsId : $googleAdsId)
        @if (filled($gtagBootstrapId))
            <!-- Google tag (gtag.js) + Consent Mode defaults (updated from CookieConsent Pinia store) -->
            {{-- Bootstrap gtag.js with GA or AW so Ads conversions still load if GA is unset. --}}
            <script async src="https://www.googletagmanager.com/gtag/js?id={{ $gtagBootstrapId }}"></script>
            <script>
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('consent', 'default', {
                    ad_storage: 'denied',
                    ad_user_data: 'denied',
                    ad_personalization: 'denied',
                    analytics_storage: 'denied',
                    wait_for_update: 500
                });
                gtag('js', new Date());
                {{-- send_page_view false: Inertia SPA pageviews are sent from resources/js/lib/googleAnalytics.ts on router navigate (including initial load), only after analytics consent. --}}
                @if (filled($googleAnalyticsId))
                gtag('config', @json($googleAnalyticsId), { send_page_view: false });
                @endif
                @if (filled($googleAdsId))
                gtag('config', @json($googleAdsId));
                window.__autocvapplyGoogleAdsConversions = @json($googleAdsConversions);
                @endif
            </script>
        @endif
    </head>
    <body class="font-sans antialiased">
        <x-inertia::app />
    </body>
</html>
