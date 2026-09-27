<?php

use App\Support\ProfileLocalitySanitizer;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Repair profiles where a Yes/No screening answer leaked into city
 * (e.g. "willing to relocate to another city?" mapped to city=Yes).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('cv_profiles')
            ->select(['id', 'city', 'location'])
            ->orderBy('id')
            ->chunkById(200, function ($profiles): void {
                foreach ($profiles as $profile) {
                    $city = is_string($profile->city) ? $profile->city : null;

                    if ($city === null || ! ProfileLocalitySanitizer::isBareYesNo($city)) {
                        continue;
                    }

                    $location = is_string($profile->location) ? $profile->location : null;

                    DB::table('cv_profiles')
                        ->where('id', $profile->id)
                        ->update([
                            'city' => ProfileLocalitySanitizer::sanitizeCity($city, $location),
                            'updated_at' => now(),
                        ]);
                }
            });
    }

    public function down(): void
    {
        // Irreversible data repair.
    }
};
