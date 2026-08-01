<?php

namespace App\Http\Controllers;

use App\Support\BlogCompetitorComparisons;
use Inertia\Inertia;
use Inertia\Response;

class CompareController extends Controller
{
    public function index(): Response
    {
        $comparisons = BlogCompetitorComparisons::comparePageEntries();

        return Inertia::render('Compare', [
            'comparisons' => $comparisons,
            'comparisonCount' => count($comparisons),
        ]);
    }
}
