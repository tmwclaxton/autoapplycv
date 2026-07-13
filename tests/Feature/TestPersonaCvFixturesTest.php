<?php

namespace Tests\Feature;

use App\Support\TestPersonaCvFixtures;
use Tests\TestCase;

class TestPersonaCvFixturesTest extends TestCase
{
    public function test_committed_fixture_pdfs_contain_persona_content(): void
    {
        $fixture = TestPersonaCvFixtures::loadFixture();

        foreach ($fixture['personas'] as $personaId => $persona) {
            if (! is_array($persona)) {
                continue;
            }

            $profile = is_array($persona['profile'] ?? null) ? $persona['profile'] : [];
            $cvFilename = (string) ($persona['cv_filename'] ?? '');
            $path = base_path(TestPersonaCvFixtures::CV_DIR.'/'.$cvFilename);

            $this->assertFileExists($path, "Missing CV fixture for persona {$personaId}");

            $pdf = (string) file_get_contents($path);

            $this->assertStringStartsWith('%PDF-1.4', $pdf);
            $this->assertStringContainsString((string) ($persona['name'] ?? ''), $pdf);
            $this->assertStringContainsString((string) ($profile['headline'] ?? ''), $pdf);
            $this->assertStringContainsString((string) ($profile['location'] ?? ''), $pdf);
            $this->assertStringContainsString((string) ($profile['phone'] ?? ''), $pdf);
            $this->assertStringContainsString((string) ($persona['email'] ?? ''), $pdf);
            $this->assertStringContainsString('Summary', $pdf);
            $this->assertStringContainsString('Skills', $pdf);
            $this->assertStringContainsString('Experience', $pdf);
            $this->assertStringContainsString('Education', $pdf);
        }
    }
}
