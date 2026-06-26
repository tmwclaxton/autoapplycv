<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('application_artifacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('job_application_id')->constrained()->cascadeOnDelete();
            $table->string('type');
            $table->string('title');
            $table->longText('content');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['job_application_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('application_artifacts');
    }
};
