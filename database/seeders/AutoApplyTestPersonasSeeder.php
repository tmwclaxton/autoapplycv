<?php

namespace Database\Seeders;

use App\Enums\ProfileDocumentCategory;
use App\Models\CreditGrant;
use App\Models\CvProfile;
use App\Models\ProfileDocument;
use App\Models\User;
use App\Services\CoverLetterPdfBuilder;
use App\Services\ExtensionConnectionService;
use App\Support\ApplicationSettings;
use App\Support\TestPersonaCvFixtures;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AutoApplyTestPersonasSeeder extends Seeder
{
    private const FIXTURE_PATH = 'tests/fixtures/auto-apply/test-personas.json';

    private const CV_DIR = 'tests/fixtures/test-personas/cvs';

    private const CONNECTIONS_PATH = 'testing/test-persona-connections.json';

    /**
     * @return array<string, mixed>
     */
    public function loadFixture(): array
    {
        $path = base_path(self::FIXTURE_PATH);
        $decoded = json_decode((string) file_get_contents($path), true);

        if (! is_array($decoded) || ! isset($decoded['personas']) || ! is_array($decoded['personas'])) {
            throw new \RuntimeException('Invalid test personas fixture.');
        }

        return $decoded;
    }

    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new \RuntimeException('Auto Apply test personas may only be seeded in local or testing environments.');
        }

        $fixture = $this->loadFixture();
        $domain = (string) ($fixture['domain'] ?? '@autocvapply.test');
        $creditGrant = max(0, (int) ($fixture['credit_grant'] ?? 50_000));
        /** @var CoverLetterPdfBuilder $pdfBuilder */
        $pdfBuilder = app(CoverLetterPdfBuilder::class);
        /** @var ExtensionConnectionService $connections */
        $connections = app(ExtensionConnectionService::class);

        $connectionManifest = [];
        $admin = User::query()->first();

        foreach ($fixture['personas'] as $personaId => $persona) {
            if (! is_array($persona)) {
                continue;
            }

            $email = (string) ($persona['email'] ?? '');

            if ($email === '' || ! str_ends_with($email, $domain)) {
                throw new \RuntimeException("Persona {$personaId} must use {$domain} email.");
            }

            $profileData = is_array($persona['profile'] ?? null) ? $persona['profile'] : [];

            $user = User::query()->updateOrCreate(
                ['email' => $email],
                [
                    'name' => (string) ($persona['name'] ?? $profileData['full_name'] ?? $personaId),
                    'workos_id' => 'test-persona-'.$personaId.'-'.Str::uuid(),
                    'email_verified_at' => now(),
                    'avatar' => '',
                    'subscription_tier' => 'pro',
                    'subscription_status' => 'active',
                    'ai_tokens_used' => 0,
                    'ai_tokens_period_start' => now()->startOfMonth(),
                    'bonus_autofills' => $creditGrant,
                ],
            );

            CvProfile::query()->updateOrCreate(
                ['user_id' => $user->id],
                [
                    'full_name' => (string) ($profileData['full_name'] ?? $user->name),
                    'headline' => (string) ($profileData['headline'] ?? ''),
                    'email' => $email,
                    'phone' => (string) ($profileData['phone'] ?? ''),
                    'location' => (string) ($profileData['location'] ?? ''),
                    'city' => (string) ($profileData['city'] ?? ''),
                    'postcode' => (string) ($profileData['postcode'] ?? ''),
                    'country' => (string) ($profileData['country'] ?? ''),
                    'linkedin_url' => $profileData['linkedin_url'] ?? null,
                    'website_url' => $profileData['website_url'] ?? null,
                    'summary' => (string) ($profileData['summary'] ?? ''),
                    'skills' => $profileData['skills'] ?? [],
                    'experience' => $profileData['experience'] ?? [],
                    'education' => $profileData['education'] ?? [],
                    'structured_data' => $profileData['structured_data'] ?? [],
                    'application_settings' => ApplicationSettings::merge($profileData['application_settings'] ?? []),
                    'raw_cv_text' => (string) ($profileData['raw_cv_text'] ?? ''),
                    'formatted_cv_text' => (string) ($profileData['formatted_cv_text'] ?? ''),
                    'parsing_complete' => true,
                ],
            );

            $this->ensureCreditGrantRecord($user, $admin, $creditGrant);
            $this->ensureCvDocument($user, $persona, $profileData, $pdfBuilder);

            $connectionManifest[] = array_merge(
                ['persona_id' => (string) $personaId],
                $connections->mintFor($user),
                ['email' => $email],
            );
        }

        $this->writeConnectionManifest($connectionManifest);
    }

    private function ensureCreditGrantRecord(User $user, ?User $admin, int $amount): void
    {
        $existing = CreditGrant::query()
            ->where('user_id', $user->id)
            ->where('note', 'auto-apply-test-persona')
            ->exists();

        if ($existing) {
            return;
        }

        CreditGrant::query()->create([
            'user_id' => $user->id,
            'awarded_by_user_id' => $admin?->id ?? $user->id,
            'amount' => $amount,
            'note' => 'auto-apply-test-persona',
        ]);
    }

    /**
     * @param  array<string, mixed>  $persona
     * @param  array<string, mixed>  $profileData
     */
    private function ensureCvDocument(
        User $user,
        array $persona,
        array $profileData,
        CoverLetterPdfBuilder $pdfBuilder,
    ): void {
        $cvFilename = (string) ($persona['cv_filename'] ?? 'cv.pdf');
        $fixturePdfPath = base_path(self::CV_DIR.'/'.$cvFilename);

        if (! is_file($fixturePdfPath)) {
            TestPersonaCvFixtures::writePdf($persona, $profileData, $pdfBuilder);
        }

        $storedPath = 'profile-documents/'.$user->id.'/'.$cvFilename;

        if (! Storage::disk('local')->exists($storedPath)) {
            Storage::disk('local')->put($storedPath, (string) file_get_contents($fixturePdfPath));
        }

        ProfileDocument::query()->updateOrCreate(
            [
                'user_id' => $user->id,
                'category' => ProfileDocumentCategory::Cv,
            ],
            [
                'title' => pathinfo($cvFilename, PATHINFO_FILENAME) ?: 'CV',
                'original_filename' => $cvFilename,
                'stored_path' => $storedPath,
                'mime_type' => 'application/pdf',
                'file_size' => (int) Storage::disk('local')->size($storedPath),
            ],
        );
    }

    /**
     * @param  array<int, array<string, mixed>>  $connectionManifest
     */
    private function writeConnectionManifest(array $connectionManifest): void
    {
        $payload = [
            'generated_at' => now()->toIso8601String(),
            'connections' => $connectionManifest,
        ];

        $directory = storage_path('app/testing');

        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        file_put_contents(
            $directory.'/test-persona-connections.json',
            json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n",
        );
    }
}
