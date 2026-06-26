<?php

use App\Http\Controllers\Api\ApplicationAssistantController;
use App\Http\Controllers\Api\AutofillController;
use App\Http\Controllers\Api\ExtensionTokenController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\BillingController;
use App\Http\Controllers\BlogController;
use App\Http\Controllers\CvUploadController;
use App\Http\Controllers\GoCardlessWebhookController;
use App\Http\Controllers\OnboardingController;
use App\Http\Controllers\PricingController;
use App\Http\Controllers\ProfileDocumentController;
use App\Http\Controllers\Settings\ProfileController as SettingsProfileController;
use Illuminate\Support\Facades\Route;
use Laravel\WorkOS\Http\Middleware\ValidateSessionWithWorkOS;

Route::inertia('/', 'Welcome')->name('home');
Route::inertia('/about', 'About')->name('about');
Route::inertia('/how-to', 'HowTo')->name('how-to');
Route::get('/pricing', [PricingController::class, 'index'])->name('pricing');
Route::inertia('/contact', 'Contact')->name('contact');
Route::inertia('/terms', 'Legal/Terms')->name('terms');
Route::inertia('/privacy', 'Legal/Privacy')->name('privacy');
Route::get('/blog', [BlogController::class, 'index'])->name('blog.index');
Route::get('/blog/{blog:slug}', [BlogController::class, 'show'])->name('blog.show');

Route::post('/webhooks/gocardless', GoCardlessWebhookController::class)->name('webhooks.gocardless');

Route::middleware(['auth', ValidateSessionWithWorkOS::class])->group(function () {
    Route::get('/onboarding', [OnboardingController::class, 'index'])->name('onboarding');
    Route::get('/dashboard', [OnboardingController::class, 'dashboard'])->name('dashboard');

    Route::post('/cv/upload', [CvUploadController::class, 'store'])->name('cv.upload');
    Route::patch('/cv/profile', [CvUploadController::class, 'updateProfile'])->name('cv.profile.update');

    Route::post('/profile/documents', [ProfileDocumentController::class, 'store'])->name('profile.documents.store');
    Route::delete('/profile/documents/{profileDocument}', [ProfileDocumentController::class, 'destroy'])->name('profile.documents.destroy');
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
});

Route::middleware(['auth:sanctum'])->prefix('api')->group(function () {
    Route::get('/profile', [ProfileController::class, 'show'])->name('api.profile');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('api.profile.update');
    Route::get('/profile/documents/{profileDocument}/download', [ProfileDocumentController::class, 'download'])->name('api.profile.documents.download');
    Route::post('/autofill', [AutofillController::class, 'store'])->name('api.autofill');
    Route::post('/applications/assist/questions', [ApplicationAssistantController::class, 'answerQuestions'])->name('api.applications.assist.questions');
    Route::post('/applications/assist/draft-field', [ApplicationAssistantController::class, 'draftField'])->name('api.applications.assist.draft-field');
    Route::post('/applications/assist/draft-all', [ApplicationAssistantController::class, 'draftAll'])->name('api.applications.assist.draft-all');
    Route::post('/applications/assist/cover-letter', [ApplicationAssistantController::class, 'coverLetter'])->name('api.applications.assist.cover-letter');
    Route::post('/applications/assist/tailored-resume', [ApplicationAssistantController::class, 'tailoredResume'])->name('api.applications.assist.tailored-resume');
    Route::post('/applications/assist/ats-score', [ApplicationAssistantController::class, 'atsScore'])->name('api.applications.assist.ats-score');
    Route::delete('/tokens/{token}', [ExtensionTokenController::class, 'destroy'])->name('api.tokens.destroy');
});

require __DIR__.'/auth.php';
