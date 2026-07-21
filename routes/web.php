<?php

use App\Http\Controllers\Admin\AdminDashboardController;
use App\Http\Controllers\Admin\AdminPageCaptureController;
use App\Http\Controllers\Admin\AdminUserCreditController;
use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\Api\ExtensionTokenController;
use App\Http\Controllers\BillingController;
use App\Http\Controllers\BlogController;
use App\Http\Controllers\CvUploadController;
use App\Http\Controllers\ExtensionAuthController;
use App\Http\Controllers\GoCardlessWebhookController;
use App\Http\Controllers\OnboardingController;
use App\Http\Controllers\PricingController;
use App\Http\Controllers\ProfileDocumentController;
use App\Http\Controllers\Settings\ProfileController as SettingsProfileController;
use App\Http\Controllers\SitemapController;
use Illuminate\Support\Facades\Route;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;

Route::inertia('/', 'Welcome')->name('home');
Route::inertia('/about', 'About')->name('about');
Route::inertia('/how-to', 'HowTo')->name('how-to');
Route::get('/pricing', [PricingController::class, 'index'])->name('pricing');
Route::inertia('/contact', 'Contact')->name('contact');
Route::get('/analytics', [AnalyticsController::class, 'index'])->name('analytics');
Route::get('/analytics.json', [AnalyticsController::class, 'json'])->name('analytics.json');
Route::inertia('/terms', 'Legal/Terms')->name('terms');
Route::inertia('/privacy', 'Legal/Privacy')->name('privacy');
Route::get('/blog', [BlogController::class, 'index'])->name('blog.index');
Route::get('/blog/{blog:slug}', [BlogController::class, 'show'])->name('blog.show');
Route::get('/sitemap.xml', [SitemapController::class, 'sitemap'])->name('sitemap');
Route::get('/robots.txt', [SitemapController::class, 'robots'])->name('robots');

Route::post('/webhooks/gocardless', GoCardlessWebhookController::class)->name('webhooks.gocardless');

Route::get('/extension/login', [ExtensionAuthController::class, 'login'])->name('extension.login');

Route::middleware(['auth', ValidateSessionWithWorkOS::class])->group(function () {
    Route::get('/extension/login/complete', [ExtensionAuthController::class, 'complete'])->name('extension.login.complete');

    Route::get('/onboarding', [OnboardingController::class, 'index'])->name('onboarding');
    Route::get('/dashboard', [OnboardingController::class, 'dashboard'])->name('dashboard');

    Route::post('/cv/upload', [CvUploadController::class, 'store'])->name('cv.upload');
    Route::patch('/cv/profile', [CvUploadController::class, 'updateProfile'])->name('cv.profile.update');

    Route::post('/profile/documents', [ProfileDocumentController::class, 'store'])->name('profile.documents.store');
    Route::delete('/profile/documents/{profileDocument}', [ProfileDocumentController::class, 'destroy'])->name('profile.documents.destroy');
    Route::get('/profile/documents/{profileDocument}/preview', [ProfileDocumentController::class, 'preview'])->name('profile.documents.preview');
    Route::get('/profile/documents/{profileDocument}/download', [ProfileDocumentController::class, 'download'])->name('profile.documents.download');

    Route::post('/extension/connection', [ExtensionTokenController::class, 'store'])->name('extension.connection.store');

    Route::get('/billing', [BillingController::class, 'index'])->name('billing.index');
    Route::post('/billing/checkout', [BillingController::class, 'checkout'])->name('billing.checkout');
    Route::get('/billing/complete', [BillingController::class, 'complete'])->name('billing.complete');
    Route::post('/billing/cancel', [BillingController::class, 'cancel'])->name('billing.cancel');

    Route::get('/settings/profile', [SettingsProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/settings/profile', [SettingsProfileController::class, 'update'])->name('profile.update');
    Route::delete('/settings/profile', [SettingsProfileController::class, 'destroy'])->name('profile.destroy');
    Route::inertia('/settings/appearance', 'settings/Appearance')->name('appearance.edit');

    Route::middleware('admin')->prefix('admin')->name('admin.')->group(function () {
        Route::get('/', [AdminDashboardController::class, 'index'])->name('dashboard');
        Route::get('/users/lookup', [AdminUserCreditController::class, 'lookup'])->name('users.lookup');
        Route::post('/users/award-credits', [AdminUserCreditController::class, 'store'])->name('users.award-credits');
        Route::get('/page-captures/{extensionPageCapture}', [AdminPageCaptureController::class, 'show'])
            ->name('page-captures.show');
        Route::get('/page-captures/{extensionPageCapture}/download', [AdminPageCaptureController::class, 'download'])
            ->name('page-captures.download');
    });
});

if (app()->environment('local')) {
    require __DIR__.'/readme-screenshots.php';
}

require __DIR__.'/auth.php';
