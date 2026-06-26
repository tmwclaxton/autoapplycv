<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_applications', function (Blueprint $table) {
            $table->string('status')->default('applied')->after('source');
            $table->unsignedTinyInteger('ats_score')->nullable()->after('job_description');
            $table->json('ats_result')->nullable()->after('ats_score');
            $table->text('notes')->nullable()->after('ats_result');
        });
    }

    public function down(): void
    {
        Schema::table('job_applications', function (Blueprint $table) {
            $table->dropColumn(['status', 'ats_score', 'ats_result', 'notes']);
        });
    }
};
