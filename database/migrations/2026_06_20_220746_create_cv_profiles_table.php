<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cv_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('full_name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('location')->nullable();
            $table->string('linkedin_url')->nullable();
            $table->string('website_url')->nullable();
            $table->text('summary')->nullable();
            $table->json('skills')->nullable();
            $table->json('experience')->nullable();
            $table->json('education')->nullable();
            $table->text('extra_context')->nullable();
            $table->text('raw_cv_text')->nullable();
            $table->boolean('parsing_complete')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cv_profiles');
    }
};
