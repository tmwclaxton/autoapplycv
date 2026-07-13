<?php

namespace Tests\Feature;

use App\Enums\ProfileDocumentCategory;
use App\Models\CreditGrant;
use App\Models\CvProfile;
use App\Models\ProfileDocument;
use App\Models\User;
use Database\Seeders\AutoApplyTestPersonasSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AutoApplyTestPersonasSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeder_creates_five_personas_and_is_idempotent(): void
    {
        $seeder = app(AutoApplyTestPersonasSeeder::class);

        $seeder->run();

        $this->assertSame(5, User::query()->where('email', 'like', '%@autocvapply.test')->count());
        $this->assertSame(5, CvProfile::query()->count());
        $this->assertSame(5, ProfileDocument::query()->where('category', ProfileDocumentCategory::Cv)->count());
        $this->assertSame(5, CreditGrant::query()->where('note', 'auto-apply-test-persona')->count());
        $this->assertTrue(is_file(storage_path('app/testing/test-persona-connections.json')));

        $seeder->run();

        $this->assertSame(5, User::query()->where('email', 'like', '%@autocvapply.test')->count());
        $this->assertSame(5, CvProfile::query()->count());
        $this->assertSame(5, ProfileDocument::query()->where('category', ProfileDocumentCategory::Cv)->count());
        $this->assertSame(5, CreditGrant::query()->where('note', 'auto-apply-test-persona')->count());
    }
}
