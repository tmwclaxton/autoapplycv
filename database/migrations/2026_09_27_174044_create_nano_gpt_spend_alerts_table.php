<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('nano_gpt_spend_alerts', function (Blueprint $table) {
            $table->id();
            $table->string('period', 7);
            $table->unsignedTinyInteger('threshold_percent');
            $table->timestamp('sent_at');
            $table->timestamps();

            $table->unique(['period', 'threshold_percent']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('nano_gpt_spend_alerts');
    }
};
