<?php

use App\Http\Controllers\ReadmeScreenshotController;
use App\Http\Middleware\ValidateSessionWithWorkOS;
use Illuminate\Support\Facades\Route;

Route::middleware(['web'])
    ->withoutMiddleware([ValidateSessionWithWorkOS::class])
    ->prefix('__readme')
    ->name('readme.')
    ->group(function () {
        Route::get('/demo-login', [ReadmeScreenshotController::class, 'login'])->name('demo-login');
        Route::get('/dashboard', [ReadmeScreenshotController::class, 'dashboard'])
            ->middleware('auth')
            ->name('dashboard');
    });
