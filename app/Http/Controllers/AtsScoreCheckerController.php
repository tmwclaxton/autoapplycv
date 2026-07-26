<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

class AtsScoreCheckerController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Tools/AtsScoreChecker');
    }
}
