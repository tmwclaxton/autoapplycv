<?php

namespace Tests\Feature;

use App\Http\Middleware\ValidateSessionWithWorkOS;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;
use WorkOS\Exception\GenericException;

class WorkOsSessionValidationTest extends TestCase
{
    #[DataProvider('transientMessages')]
    public function test_classifies_transient_network_failures(string $message): void
    {
        $this->assertTrue(
            ValidateSessionWithWorkOS::isTransientNetworkFailure(new GenericException($message))
        );
    }

    public function test_does_not_classify_auth_errors_as_transient(): void
    {
        $this->assertFalse(
            ValidateSessionWithWorkOS::isTransientNetworkFailure(
                new GenericException('Invalid refresh token')
            )
        );
    }

    public function test_authenticated_routes_use_app_workos_middleware(): void
    {
        $web = file_get_contents(base_path('routes/web.php'));
        $readme = file_get_contents(base_path('routes/readme-screenshots.php'));

        $this->assertNotFalse($web);
        $this->assertNotFalse($readme);
        $this->assertStringContainsString('App\\Http\\Middleware\\ValidateSessionWithWorkOS', $web);
        $this->assertStringContainsString('App\\Http\\Middleware\\ValidateSessionWithWorkOS', $readme);
        $this->assertStringNotContainsString('Laravel\\WorkOS\\Http\\Middleware\\ValidateSessionWithWorkOS', $web);
        $this->assertStringNotContainsString('Laravel\\WorkOS\\Http\\Middleware\\ValidateSessionWithWorkOS', $readme);
    }

    public function test_transient_classifier_matches_production_log_messages(): void
    {
        $this->assertTrue(ValidateSessionWithWorkOS::isTransientNetworkFailure(
            new GenericException('Could not resolve host: api.workos.com')
        ));
        $this->assertTrue(ValidateSessionWithWorkOS::isTransientNetworkFailure(
            new GenericException('Failed to connect to api.workos.com port 443 after 3001 ms: Timeout was reached')
        ));
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function transientMessages(): array
    {
        return [
            'dns resolve' => ['Resolving timed out after 3000 milliseconds'],
            'connect timeout' => ['Failed to connect to api.workos.com port 443 after 3001 ms: Timeout was reached'],
            'could not resolve' => ['Could not resolve host: api.workos.com'],
            'network unreachable' => ['Network is unreachable'],
        ];
    }
}
