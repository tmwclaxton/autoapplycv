<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_applications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('company');
            $table->string('link', 2048);
            $table->string('location')->nullable();
            $table->string('source', 32)->default('linkedin');
            $table->timestamp('applied_at');
            $table->timestamps();

            $table->unique(['user_id', 'link']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_applications');
    }
};
