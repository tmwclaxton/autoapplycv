<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('extension_page_captures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('url', 2048);
            $table->string('page_title', 512)->default('');
            $table->string('domain', 255)->default('');
            $table->string('platform', 64)->nullable();
            $table->longText('html');
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index('domain');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('extension_page_captures');
    }
};
