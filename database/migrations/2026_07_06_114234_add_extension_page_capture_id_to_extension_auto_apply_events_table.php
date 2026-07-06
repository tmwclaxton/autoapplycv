<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('extension_auto_apply_events', function (Blueprint $table) {
            $table->foreignId('extension_page_capture_id')
                ->nullable()
                ->after('metadata')
                ->constrained('extension_page_captures')
                ->nullOnDelete();

            $table->index('extension_page_capture_id');
        });
    }

    public function down(): void
    {
        Schema::table('extension_auto_apply_events', function (Blueprint $table) {
            $table->dropConstrainedForeignId('extension_page_capture_id');
        });
    }
};
