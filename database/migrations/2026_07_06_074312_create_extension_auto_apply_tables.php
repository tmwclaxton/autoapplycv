<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('extension_auto_apply_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('platform', 64);
            $table->string('role_description', 512);
            $table->string('status', 32)->default('running');
            $table->unsignedSmallInteger('max_applications')->default(10);
            $table->unsignedInteger('jobs_found')->default(0);
            $table->unsignedInteger('applied_count')->default(0);
            $table->unsignedInteger('skipped_count')->default(0);
            $table->unsignedInteger('error_count')->default(0);
            $table->unsignedInteger('fields_filled_count')->default(0);
            $table->timestamp('started_at');
            $table->timestamp('stopped_at')->nullable();
            $table->string('last_error', 1024)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'started_at']);
            $table->index(['platform', 'started_at']);
            $table->index('status');
        });

        Schema::create('extension_auto_apply_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('extension_auto_apply_session_id')
                ->constrained('extension_auto_apply_sessions')
                ->cascadeOnDelete();
            $table->string('event_type', 32);
            $table->string('job_title', 512)->nullable();
            $table->string('company', 512)->nullable();
            $table->string('job_url', 2048)->nullable();
            $table->unsignedInteger('fields_filled_count')->default(0);
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['extension_auto_apply_session_id', 'created_at']);
            $table->index('event_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('extension_auto_apply_events');
        Schema::dropIfExists('extension_auto_apply_sessions');
    }
};
