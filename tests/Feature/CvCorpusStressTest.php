<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CvCorpusStressTest extends TestCase
{
    #[Test]
    #[Group('cv-corpus')]
    public function test_cv_corpus_stress_suite_passes(): void
    {
        if (! filter_var(env('CV_CORPUS_STRESS', false), FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set CV_CORPUS_STRESS=1 to run the live CV corpus stress suite.');
        }

        if (blank(config('services.nanogpt.api_key'))) {
            $this->markTestSkipped('NANOGPT_API_KEY is required for CV corpus stress tests.');
        }

        $manifest = base_path('tests/fixtures/cv-corpus/manifest.json');

        if (! is_readable($manifest)) {
            $this->markTestSkipped('Run npm run cv-corpus:fetch to build the corpus first.');
        }

        $this->artisan('cv:stress-test')
            ->assertExitCode(0);
    }
}
