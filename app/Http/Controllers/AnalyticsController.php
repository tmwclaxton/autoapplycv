<?php

namespace App\Http\Controllers;

use App\Http\Requests\AnalyticsPeriodRequest;
use App\Services\AutofillAnalyticsService;
use Illuminate\Http\JsonResponse;
use Inertia\Inertia;
use Inertia\Response;

class AnalyticsController extends Controller
{
    public function __construct(
        private readonly AutofillAnalyticsService $analytics,
    ) {}

    public function index(AnalyticsPeriodRequest $request): Response
    {
        return Inertia::render('Analytics', [
            'analytics' => $this->analytics->publicSummary($request->dateRange()),
        ]);
    }

    /**
     * Public JSON for README badges (shields.io) and other read-only consumers.
     * Same payload as the /analytics Inertia page (real + synthetic totals).
     */
    public function json(AnalyticsPeriodRequest $request): JsonResponse
    {
        return response()
            ->json($this->analytics->publicSummary($request->dateRange()))
            ->header('Cache-Control', 'public, max-age=300');
    }
}
