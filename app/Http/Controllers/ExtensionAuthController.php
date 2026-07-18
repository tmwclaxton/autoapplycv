<?php

namespace App\Http\Controllers;

use App\Services\ExtensionConnectionService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ExtensionAuthController extends Controller
{
    public function __construct(
        private readonly ExtensionConnectionService $connections,
    ) {}

    public function login(Request $request): RedirectResponse
    {
        $extensionId = $this->validatedExtensionId($request);

        $request->session()->put('extension_auth_extension_id', $extensionId);

        $completeUrl = route('extension.login.complete', [
            'extension_id' => $extensionId,
        ]);

        if ($request->user()) {
            return redirect()->to($completeUrl);
        }

        return redirect()->guest($completeUrl);
    }

    public function complete(Request $request): Response
    {
        $extensionId = $this->validatedExtensionId($request);
        $connection = $this->connections->mintFor($request->user());

        $request->session()->forget('extension_auth_extension_id');

        return Inertia::render('Extension/Connect', [
            'extensionId' => $extensionId,
            'token' => $connection['token'],
            'apiBase' => $connection['api_base'],
        ]);
    }

    private function validatedExtensionId(Request $request): string
    {
        $extensionId = $request->string('extension_id')->trim()->toString();

        if ($extensionId === '') {
            $extensionId = (string) $request->session()->get('extension_auth_extension_id', '');
        }

        if ($extensionId === '' || ! $this->isValidExtensionId($extensionId)) {
            abort(422, 'A valid extension_id query parameter is required.');
        }

        return $extensionId;
    }

    /**
     * Chrome uses a 32-letter id; Firefox uses an email-like or UUID gecko id.
     */
    private function isValidExtensionId(string $extensionId): bool
    {
        if (preg_match('/^[a-z]{32}$/', $extensionId) === 1) {
            return true;
        }

        if (preg_match('/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i', $extensionId) === 1) {
            return true;
        }

        return preg_match('/^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i', $extensionId) === 1;
    }
}
