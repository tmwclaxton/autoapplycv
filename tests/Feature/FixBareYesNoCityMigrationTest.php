<?php

namespace Tests\Feature;

use App\Models\CvProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FixBareYesNoCityMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_migration_derives_city_from_location_when_city_is_yes(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'city' => 'Yes',
            'location' => 'Wycombe, England',
        ]);

        // RefreshDatabase already ran migrations; re-run the repair migration's
        // logic by invoking migrate:fresh is too heavy - call the repair via
        // a second up() by requiring the migration file.
        $migration = require database_path('migrations/2026_09_27_180000_fix_bare_yes_no_city_on_cv_profiles.php');
        $migration->up();

        $profile->refresh();

        $this->assertSame('Wycombe', $profile->city);
    }

    public function test_migration_clears_yes_city_without_usable_location(): void
    {
        $user = User::factory()->create();
        $profile = CvProfile::factory()->for($user)->create([
            'city' => 'No',
            'location' => null,
        ]);

        $migration = require database_path('migrations/2026_09_27_180000_fix_bare_yes_no_city_on_cv_profiles.php');
        $migration->up();

        $profile->refresh();

        $this->assertNull($profile->city);
    }
}
