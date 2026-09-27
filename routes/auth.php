<?php

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Laravel\WorkOS\Http\Requests\AuthKitAuthenticationRequest;
use Laravel\WorkOS\Http\Requests\AuthKitLoginRequest;
use Laravel\WorkOS\Http\Requests\AuthKitLogoutRequest;
use Symfony\Component\HttpKernel\Exception\HttpException;

Route::middleware(['guest'])->group(function () {
    Route::get('login', fn (AuthKitLoginRequest $request) => $request->redirect())->name('login');

    Route::get('register', fn (AuthKitLoginRequest $request) => $request->redirect([
        'screenHint' => 'sign-up',
    ]))->name('register');
});

// Outside guest so a completed magic-code sign-in that is hit twice (or with a
// stale OAuth state) never shows a raw WorkOS abort(403) page when the session
// was already established by the first callback.
Route::get('authenticate', function (AuthKitAuthenticationRequest $request) {
    $code = $request->query('code');

    if (! is_string($code) || $code === '') {
        return Auth::check()
            ? redirect()->intended(route('dashboard'))
            : redirect()->route('login');
    }

    if (Auth::check()) {
        return redirect()->intended(route('dashboard'));
    }

    try {
        $user = $request->authenticate();
    } catch (HttpException $exception) {
        if ($exception->getStatusCode() !== 403) {
            throw $exception;
        }

        // WorkOS AuthKitAuthenticationRequest::ensureStateIsValid aborts 403 on
        // state mismatch (double callback, back-button, or host/cookie split).
        return Auth::check()
            ? redirect()->intended(route('dashboard'))
            : redirect()->route('login');
    }

    // WorkOS AuthKitAuthenticationRequest already dispatches Registered for
    // newly created users - do not dispatch it again here.
    if ($user->wasRecentlyCreated) {
        session()->flash('sign_up_conversion', [
            'transaction_id' => 'signup_'.$user->id.'_'.now()->timestamp,
            'method' => 'WorkOS',
        ]);
    }

    return redirect()->intended(route('dashboard'));
})->name('authenticate');

Route::post('logout', fn (AuthKitLogoutRequest $request) => $request->logout(route('home')))
    ->middleware(['auth'])->name('logout');
