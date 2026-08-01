<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\View\View;

class AdminGaConversionTestController extends Controller
{
    /**
     * Self-contained gtag conversion probe (admin only).
     * Opens with ?gclid=... and auto-fires purchase + sign-up events.
     */
    public function __invoke(Request $request): View
    {
        $gclid = trim((string) $request->query('gclid', ''));
        $count = max(1, min(10, (int) $request->query('count', 3)));

        return view('admin.ga-conversion-test', [
            'googleAnalyticsId' => (string) config('analytics.google_analytics_id'),
            'googleAdsId' => (string) config('analytics.google_ads_id'),
            'googleAdsConversions' => config('analytics.google_ads_conversions', []),
            'gclid' => $gclid,
            'count' => $count,
            'autoFire' => $request->boolean('auto', true),
        ]);
    }
}
