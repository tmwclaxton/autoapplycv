<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\AdminCreditAwardService;
use App\Services\AdminHealthService;
use App\Services\ExtensionAutoApplyAnalyticsService;
use App\Services\ExtensionNanoGptUsageService;
use App\Services\ExtensionPageCaptureService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AdminDashboardController extends Controller
{
    public function __construct(
        private readonly ExtensionPageCaptureService $captures,
        private readonly ExtensionAutoApplyAnalyticsService $autoApply,
        private readonly ExtensionNanoGptUsageService $nanoGptUsage,
        private readonly AdminHealthService $health,
        private readonly AdminCreditAwardService $creditAwards,
    ) {}

    public function index(Request $request): Response
    {
        $tab = $request->query('tab');
        $allowedTabs = ['overview', 'captures', 'auto-apply', 'usage', 'users', 'health'];
        $queryAppends = is_string($tab) && in_array($tab, $allowedTabs, true) && $tab !== 'overview'
            ? ['tab' => $tab]
            : [];

        return Inertia::render('Admin/Dashboard', [
            ...$this->captures->adminDashboardData($queryAppends),
            ...$this->autoApply->adminDashboardData($queryAppends),
            ...$this->nanoGptUsage->adminDashboardData(),
            ...$this->health->adminDashboardData(),
            'credit_packages' => config('admin.credit_packages', []),
            'credit_award_max' => (int) config('admin.credit_award_max_per_request', 50_000),
            'recent_credit_grants' => $this->creditAwards->recentGrants(
                (int) config('admin.recent_credit_grants_limit', 15),
            ),
        ]);
    }
}
