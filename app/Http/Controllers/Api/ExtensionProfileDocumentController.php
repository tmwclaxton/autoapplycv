<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\ProfileDocumentController as WebProfileDocumentController;
use App\Http\Requests\StoreProfileDocumentRequest;
use App\Models\ProfileDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ExtensionProfileDocumentController extends Controller
{
    public function store(StoreProfileDocumentRequest $request, WebProfileDocumentController $controller): JsonResponse
    {
        return $controller->store($request);
    }

    public function destroy(Request $request, ProfileDocument $profileDocument, WebProfileDocumentController $controller): JsonResponse
    {
        return $controller->destroy($request, $profileDocument);
    }

    public function download(Request $request, ProfileDocument $profileDocument, WebProfileDocumentController $controller): StreamedResponse
    {
        return $controller->download($request, $profileDocument);
    }
}
