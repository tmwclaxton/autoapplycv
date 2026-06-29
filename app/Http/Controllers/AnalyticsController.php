<?php

namespace App\Http\Controllers;

use App\Services\AutofillAnalyticsService;
use Inertia\Inertia;
use Inertia\Response;

class AnalyticsController extends Controller
{
    public function __construct(
        private readonly AutofillAnalyticsService $analytics,
    ) {}

    public function index(): Response
    {
        return Inertia::render('Analytics', [
            'analytics' => $this->analytics->publicSummary(),
        ]);
    }
}
