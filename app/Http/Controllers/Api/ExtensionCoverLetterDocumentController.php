<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\CoverLetterDocumentController as WebCoverLetterDocumentController;
use App\Http\Requests\StoreCoverLetterDocumentRequest;
use Illuminate\Http\JsonResponse;

class ExtensionCoverLetterDocumentController extends Controller
{
    public function store(
        StoreCoverLetterDocumentRequest $request,
        WebCoverLetterDocumentController $controller,
    ): JsonResponse {
        return $controller->store($request);
    }
}
