<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('nano_gpt_spend_entries', function (Blueprint $table) {
            $table->id();
            $table->string('period', 7)->index();
            $table->string('endpoint', 32)->default('chat');
            $table->string('model', 128)->nullable();
            $table->unsignedInteger('prompt_tokens')->default(0);
            $table->unsignedInteger('completion_tokens')->default(0);
            $table->unsignedInteger('total_tokens')->default(0);
            $table->decimal('cost_usd', 12, 8);
            $table->decimal('cost_gbp', 12, 8);
            $table->string('cost_source', 16);
            $table->decimal('remaining_balance_usd', 12, 6)->nullable();
            $table->timestamps();

            $table->index(['period', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('nano_gpt_spend_entries');
    }
};
