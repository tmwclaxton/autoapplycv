<?php

use App\Http\Controllers\Api\ApplicationAssistantController;
use App\Http\Controllers\Api\AutofillController;
use App\Http\Controllers\Api\ExtensionCvUploadController;
use App\Http\Controllers\Api\ExtensionProfileDocumentController;
use App\Http\Controllers\Api\ExtensionTokenController;
use App\Http\Controllers\Api\ProfileController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum'])->group(function () {
    Route::get('/profile', [ProfileController::class, 'show'])->name('api.profile');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('api.profile.update');
    Route::post('/cv/upload', [ExtensionCvUploadController::class, 'store'])->name('api.cv.upload');
    Route::post('/profile/documents', [ExtensionProfileDocumentController::class, 'store'])->name('api.profile.documents.store');
    Route::delete('/profile/documents/{profileDocument}', [ExtensionProfileDocumentController::class, 'destroy'])->name('api.profile.documents.destroy');
    Route::get('/profile/documents/{profileDocument}/download', [ExtensionProfileDocumentController::class, 'download'])->name('api.profile.documents.download');
    Route::post('/autofill', [AutofillController::class, 'store'])->name('api.autofill');
    Route::post('/applications/assist/questions', [ApplicationAssistantController::class, 'answerQuestions'])->name('api.applications.assist.questions');
    Route::post('/applications/assist/inventory', [ApplicationAssistantController::class, 'inventory'])->name('api.applications.assist.inventory');
    Route::post('/applications/assist/job-context', [ApplicationAssistantController::class, 'jobContext'])->name('api.applications.assist.job-context');
    Route::post('/applications/assist/chat', [ApplicationAssistantController::class, 'chat'])->name('api.applications.assist.chat');
    Route::post('/applications/assist/chat/stream', [ApplicationAssistantController::class, 'chatStream'])->name('api.applications.assist.chat.stream');
    Route::post('/applications/assist/draft-field', [ApplicationAssistantController::class, 'draftField'])->name('api.applications.assist.draft-field');
    Route::post('/applications/assist/draft-all', [ApplicationAssistantController::class, 'draftAll'])->name('api.applications.assist.draft-all');
    Route::post('/applications/assist/cover-letter', [ApplicationAssistantController::class, 'coverLetter'])->name('api.applications.assist.cover-letter');
    Route::post('/applications/assist/tailored-resume', [ApplicationAssistantController::class, 'tailoredResume'])->name('api.applications.assist.tailored-resume');
    Route::post('/applications/assist/ats-score', [ApplicationAssistantController::class, 'atsScore'])->name('api.applications.assist.ats-score');
    Route::delete('/tokens/{token}', [ExtensionTokenController::class, 'destroy'])->name('api.tokens.destroy');
});
