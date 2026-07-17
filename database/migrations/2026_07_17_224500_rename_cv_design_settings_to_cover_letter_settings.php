<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('cv_profiles', 'cv_design')) {
            return;
        }

        Schema::table('cv_profiles', function (Blueprint $table) {
            if (Schema::hasColumn('cv_profiles', 'cover_letter_design')) {
                $table->dropColumn(['cover_letter_design', 'cover_letter_font']);
            }
        });

        Schema::table('cv_profiles', function (Blueprint $table) {
            $table->renameColumn('cv_design', 'cover_letter_design');
            $table->renameColumn('cv_font', 'cover_letter_font');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('cv_profiles', 'cover_letter_design')) {
            return;
        }

        if (Schema::hasColumn('cv_profiles', 'cv_design')) {
            return;
        }

        Schema::table('cv_profiles', function (Blueprint $table) {
            $table->renameColumn('cover_letter_design', 'cv_design');
            $table->renameColumn('cover_letter_font', 'cv_font');
        });
    }
};
