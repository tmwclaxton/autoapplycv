<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cv_profiles', function (Blueprint $table) {
            $table->string('cover_letter_design', 64)->default('teal-masthead')->after('application_answers');
            $table->string('cover_letter_font', 64)->default('clash-display')->after('cover_letter_design');
        });
    }

    public function down(): void
    {
        Schema::table('cv_profiles', function (Blueprint $table) {
            $table->dropColumn(['cover_letter_design', 'cover_letter_font']);
        });
    }
};
