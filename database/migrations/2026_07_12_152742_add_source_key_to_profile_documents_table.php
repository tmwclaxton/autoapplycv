<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('profile_documents', function (Blueprint $table) {
            $table->string('source_key', 64)->nullable()->after('notes');
            $table->index(['user_id', 'category', 'source_key']);
        });
    }

    public function down(): void
    {
        Schema::table('profile_documents', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'category', 'source_key']);
            $table->dropColumn('source_key');
        });
    }
};
