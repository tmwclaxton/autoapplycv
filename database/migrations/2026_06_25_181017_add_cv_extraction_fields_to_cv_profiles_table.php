<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cv_profiles', function (Blueprint $table) {
            $table->longText('formatted_cv_text')->nullable()->after('raw_cv_text');
            $table->json('structured_data')->nullable()->after('formatted_cv_text');
            $table->string('headline')->nullable()->after('full_name');
            $table->string('city')->nullable()->after('location');
            $table->string('postcode')->nullable()->after('city');
            $table->string('country')->nullable()->after('postcode');
        });
    }

    public function down(): void
    {
        Schema::table('cv_profiles', function (Blueprint $table) {
            $table->dropColumn([
                'formatted_cv_text',
                'structured_data',
                'headline',
                'city',
                'postcode',
                'country',
            ]);
        });
    }
};
