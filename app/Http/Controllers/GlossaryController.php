<?php

namespace App\Http\Controllers;

use App\Support\JobSearchGlossary;
use Inertia\Inertia;
use Inertia\Response;

class GlossaryController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Glossary', [
            'alphabet' => JobSearchGlossary::alphabet(),
            'activeLetters' => JobSearchGlossary::activeLetters(),
            'groups' => JobSearchGlossary::groupedByLetter(),
            'termCount' => count(JobSearchGlossary::terms()),
        ]);
    }
}
