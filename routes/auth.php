<?php

use Illuminate\Support\Facades\Route;
use Laravel\WorkOS\Http\Requests\AuthKitAuthenticationRequest;
use Laravel\WorkOS\Http\Requests\AuthKitLoginRequest;
use Laravel\WorkOS\Http\Requests\AuthKitLogoutRequest;

Route::middleware(['guest'])->group(function () {
    Route::get('login', fn (AuthKitLoginRequest $request) => $request->redirect())->name('login');

    Route::get('register', fn (AuthKitLoginRequest $request) => $request->redirect([
        'screenHint' => 'sign-up',
    ]))->name('register');

    Route::get('authenticate', function (AuthKitAuthenticationRequest $request) {
        $request->authenticate();

        return redirect()->intended(route('dashboard'));
    })->name('authenticate');
});

Route::post('logout', fn (AuthKitLogoutRequest $request) => $request->logout(route('home')))
    ->middleware(['auth'])->name('logout');
