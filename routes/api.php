<?php

use App\Http\Controllers\Api\ApplicationAssistantController;
use App\Http\Controllers\Api\AutofillController;
use App\Http\Controllers\Api\ExtensionTokenController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\ProfileDocumentController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum'])->group(function () {
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
