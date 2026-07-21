<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>GA / Ads conversion test</title>
    <style>
        body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; max-width: 42rem; line-height: 1.5; }
        code { background: #f4f4f5; padding: 0.1rem 0.35rem; border-radius: 0.25rem; }
        .ok { color: #15803d; }
        .bad { color: #b91c1c; }
        pre { background: #f4f4f5; padding: 1rem; overflow: auto; }
    </style>
    @if (filled($googleAnalyticsId))
        <script async src="https://www.googletagmanager.com/gtag/js?id={{ $googleAnalyticsId }}"></script>
        <script>
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('consent', 'default', {
                ad_storage: 'granted',
                ad_user_data: 'granted',
                ad_personalization: 'granted',
                analytics_storage: 'granted',
                wait_for_update: 0
            });
            gtag('js', new Date());
            {{-- Use production page_location so GA4/Ads can match gclid clicks better than localhost/tunnel hosts. --}}
            window.__gaTestPageLocation = @json($gclid !== '' ? 'https://www.autocvapply.com/?gclid='.$gclid : 'https://www.autocvapply.com/');
            gtag('config', @json($googleAnalyticsId), {
                send_page_view: true,
                page_location: window.__gaTestPageLocation,
                page_title: 'AutoCVApply'
            });
        </script>
    @endif
</head>
<body>
    <h1>GA / Ads conversion test</h1>
    <p>Measurement ID: <code id="measurement-id">{{ $googleAnalyticsId ?: '(missing)' }}</code></p>
    <p>gclid: <code id="gclid">{{ $gclid !== '' ? $gclid : '(none - campaign attribution unlikely)' }}</code></p>
    <p>Status: <strong id="status">waiting</strong></p>
    <pre id="log"></pre>

    <script>
        (function () {
            const measurementId = @json($googleAnalyticsId);
            const gclid = @json($gclid);
            const count = @json($count);
            const autoFire = @json($autoFire);
            const statusEl = document.getElementById('status');
            const logEl = document.getElementById('log');
            const lines = [];

            function log(line) {
                lines.push(line);
                logEl.textContent = lines.join('\n');
            }

            function bindGclid() {
                if (!gclid || typeof gtag !== 'function') {
                    return false;
                }

                gtag('set', { gclid: gclid });
                const stamp = Math.floor(Date.now() / 1000);
                document.cookie = '_gcl_aw=1.' + stamp + '.' + encodeURIComponent(gclid)
                    + ';path=/;max-age=' + (90 * 24 * 60 * 60) + ';SameSite=Lax';
                log('Bound gclid + _gcl_aw cookie');
                return true;
            }

            function fireOnce(index) {
                const stamp = Date.now() + '_' + index + '_' + Math.random().toString(36).slice(2, 8);
                const purchaseParams = {
                    transaction_id: 'test_purchase_' + stamp,
                    value: index % 2 === 0 ? 7 : 17,
                    currency: 'GBP',
                    items: [{
                        item_id: index % 2 === 0 ? 'starter' : 'pro',
                        item_name: index % 2 === 0 ? 'AutoCVApply Starter (test)' : 'AutoCVApply Pro (test)',
                        price: index % 2 === 0 ? 7 : 17,
                        quantity: 1
                    }]
                };

                const common = {
                    page_location: window.__gaTestPageLocation || 'https://www.autocvapply.com/',
                    page_title: 'AutoCVApply'
                };
                gtag('event', 'purchase', Object.assign({}, purchaseParams, common));
                gtag('event', 'conversion_event_purchase', Object.assign({}, purchaseParams, common));
                gtag('event', 'sign_up', Object.assign({ method: 'test', transaction_id: 'test_sign_up_' + stamp }, common));
                gtag('event', 'ads_conversion_Sign_up_1', Object.assign({ method: 'test', transaction_id: 'test_sign_up_' + stamp }, common));
                log('fired batch ' + (index + 1) + ' transaction=' + purchaseParams.transaction_id);
            }

            function run() {
                if (!measurementId) {
                    statusEl.textContent = 'failed';
                    statusEl.className = 'bad';
                    log('No analytics.google_analytics_id configured');
                    document.documentElement.dataset.gaTest = 'failed';
                    return;
                }

                if (typeof gtag !== 'function') {
                    statusEl.textContent = 'failed';
                    statusEl.className = 'bad';
                    log('gtag not available');
                    document.documentElement.dataset.gaTest = 'failed';
                    return;
                }

                gtag('consent', 'update', {
                    ad_storage: 'granted',
                    ad_user_data: 'granted',
                    ad_personalization: 'granted',
                    analytics_storage: 'granted'
                });
                log('consent granted for ads + analytics');

                if (gclid) {
                    bindGclid();
                } else {
                    log('WARNING: no gclid - Ads campaign column will likely stay at 0');
                }

                for (let i = 0; i < count; i += 1) {
                    fireOnce(i);
                }

                statusEl.textContent = 'sent';
                statusEl.className = 'ok';
                document.documentElement.dataset.gaTest = 'sent';
                document.documentElement.dataset.gaTestCount = String(count);
                if (gclid) {
                    document.documentElement.dataset.gaTestGclid = gclid;
                }
                log('done - check GA4 Realtime; Ads may lag for hours');
            }

            if (autoFire) {
                // Give gtag.js a moment to load.
                setTimeout(run, 1200);
            } else {
                statusEl.textContent = 'idle';
                log('auto=0 - call run manually from console');
                window.__gaConversionTestRun = run;
            }
        })();
    </script>
</body>
</html>
