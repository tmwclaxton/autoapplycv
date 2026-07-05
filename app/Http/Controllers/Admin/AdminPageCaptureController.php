<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ExtensionPageCapture;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminPageCaptureController extends Controller
{
    public function show(ExtensionPageCapture $extensionPageCapture): Response
    {
        return response($extensionPageCapture->html, 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'X-Frame-Options' => 'SAMEORIGIN',
        ]);
    }

    public function download(ExtensionPageCapture $extensionPageCapture): StreamedResponse
    {
        $filename = sprintf(
            'capture-%d-%s.html',
            $extensionPageCapture->id,
            $extensionPageCapture->created_at?->format('Y-m-d') ?? 'unknown',
        );

        return response()->streamDownload(
            static function () use ($extensionPageCapture): void {
                echo $extensionPageCapture->html;
            },
            $filename,
            ['Content-Type' => 'text/html; charset=UTF-8'],
        );
    }
}
