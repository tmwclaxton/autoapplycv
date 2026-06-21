<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('subscription_tier')->default('free')->after('avatar');
            $table->string('subscription_status')->default('active')->after('subscription_tier');
            $table->unsignedInteger('ai_tokens_used')->default(0)->after('subscription_status');
            $table->timestamp('ai_tokens_period_start')->nullable()->after('ai_tokens_used');
            $table->string('gocardless_mandate_id')->nullable()->after('ai_tokens_period_start');
            $table->string('gocardless_subscription_id')->nullable()->after('gocardless_mandate_id');
            $table->string('gocardless_billing_request_id')->nullable()->after('gocardless_subscription_id');
            $table->string('pending_subscription_tier')->nullable()->after('gocardless_billing_request_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'subscription_tier',
                'subscription_status',
                'ai_tokens_used',
                'ai_tokens_period_start',
                'gocardless_mandate_id',
                'gocardless_subscription_id',
                'gocardless_billing_request_id',
                'pending_subscription_tier',
            ]);
        });
    }
};
