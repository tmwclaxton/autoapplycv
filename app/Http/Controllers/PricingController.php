<?php

namespace App\Http\Controllers;

use App\Enums\SubscriptionTier;
use Inertia\Inertia;
use Inertia\Response;

class PricingController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Pricing', [
            'plans' => SubscriptionTier::marketingPlans(),
        ]);
    }
}
