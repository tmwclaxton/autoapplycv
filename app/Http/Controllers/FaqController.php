<?php

namespace App\Http\Controllers;

use App\Support\AutoCVApplyFaq;
use Inertia\Inertia;
use Inertia\Response;

class FaqController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Faq', [
            'sections' => AutoCVApplyFaq::sections(),
            'itemCount' => AutoCVApplyFaq::itemCount(),
        ]);
    }
}
