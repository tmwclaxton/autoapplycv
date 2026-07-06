<?php

namespace Tests\Unit;

use App\Models\CvProfile;
use App\Models\User;
use App\Services\ExtensionPageCaptureRedactionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExtensionPageCaptureRedactionServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_redacts_user_profile_pii_from_html(): void
    {
        $user = User::factory()->create([
            'name' => 'Toby Claxton',
            'email' => 'tmwclaxton@gmail.com',
        ]);

        CvProfile::factory()->for($user)->create([
            'full_name' => 'Toby Claxton',
            'email' => 'tmwclaxton@gmail.com',
            'phone' => '+44 7700 900456',
        ]);

        $service = app(ExtensionPageCaptureRedactionService::class);

        $redacted = $service->redactForUser($user, <<<'HTML'
<html>
<body>
<p>Toby Claxton</p>
<p>tmwclaxton@gmail.com</p>
<p>+44 7700 900456</p>
<p>other@company.com</p>
</body>
</html>
HTML);

        $this->assertStringNotContainsString('Toby Claxton', $redacted);
        $this->assertStringNotContainsString('tmwclaxton@gmail.com', $redacted);
        $this->assertStringNotContainsString('+44 7700 900456', $redacted);
        $this->assertStringNotContainsString('other@company.com', $redacted);
        $this->assertStringContainsString('Alex Candidate', $redacted);
        $this->assertStringContainsString('candidate@example.com', $redacted);
    }
}
