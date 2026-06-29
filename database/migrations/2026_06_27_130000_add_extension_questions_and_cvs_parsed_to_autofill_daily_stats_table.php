<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('autofill_daily_stats', function (Blueprint $table) {
            $table->unsignedInteger('extension_questions_count')->default(0)->after('answers_count');
            $table->unsignedInteger('cvs_parsed_count')->default(0)->after('extension_questions_count');
        });
    }

    public function down(): void
    {
        Schema::table('autofill_daily_stats', function (Blueprint $table) {
            $table->dropColumn(['extension_questions_count', 'cvs_parsed_count']);
        });
    }
};
