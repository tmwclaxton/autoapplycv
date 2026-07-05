<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\AdminHealthService;
use App\Services\ExtensionNanoGptUsageService;
use App\Services\ExtensionPageCaptureService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AdminDashboardController extends Controller
{
    public function __construct(
        private readonly ExtensionPageCaptureService $captures,
        private readonly ExtensionNanoGptUsageService $nanoGptUsage,
        private readonly AdminHealthService $health,
    ) {}

    public function index(Request $request): Response
    {
        $tab = $request->query('tab');
        $allowedTabs = ['overview', 'captures', 'usage', 'users', 'health'];
        $queryAppends = is_string($tab) && in_array($tab, $allowedTabs, true) && $tab !== 'overview'
            ? ['tab' => $tab]
            : [];

        return Inertia::render('Admin/Dashboard', [
            ...$this->captures->adminDashboardData($queryAppends),
            ...$this->nanoGptUsage->adminDashboardData(),
            ...$this->health->adminDashboardData(),
        ]);
    }
}
