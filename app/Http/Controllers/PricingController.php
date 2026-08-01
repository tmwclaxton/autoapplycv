<?php

namespace App\Http\Controllers;

use App\Enums\SubscriptionTier;
use App\Support\AiAssistCosts;
use Inertia\Inertia;
use Inertia\Response;

class PricingController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Pricing', [
            'plans' => SubscriptionTier::marketingPlans(),
            'creditCosts' => AiAssistCosts::pricing(),
            'draftAllBatchSize' => max(1, (int) config('cv.ai_assist.draft_all_batch_size', 10)),
        ]);
    }
}
