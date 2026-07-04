<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cv_profiles', function (Blueprint $table) {
            $table->text('headline')->nullable()->change();
            $table->string('linkedin_url', 500)->nullable()->change();
            $table->string('website_url', 500)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('cv_profiles', function (Blueprint $table) {
            $table->string('headline')->nullable()->change();
            $table->string('linkedin_url')->nullable()->change();
            $table->string('website_url')->nullable()->change();
        });
    }
};
