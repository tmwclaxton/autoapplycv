<?php

namespace App\Providers;

use App\Mail\PostalTransport;
use App\Services\WorkerHeartbeatService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->registerPostalMailer();
        $this->registerWorkerHeartbeatRecorder();
        $this->configureDefaults();
    }

    protected function registerWorkerHeartbeatRecorder(): void
    {
        Queue::after(function (): void {
            app(WorkerHeartbeatService::class)->record();
        });
    }

    protected function registerPostalMailer(): void
    {
        Mail::extend('postal', function () {
            return new PostalTransport(
                apiKey: (string) config('services.postal.key'),
                baseUrl: (string) config('services.postal.base_url'),
            );
        });
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        if ($this->app->isProduction()) {
            URL::forceScheme('https');
        }

        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
