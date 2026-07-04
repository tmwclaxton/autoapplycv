<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\CvUploadController as WebCvUploadController;
use App\Http\Requests\StoreCvUploadRequest;
use Illuminate\Http\JsonResponse;

class ExtensionCvUploadController extends Controller
{
    public function store(StoreCvUploadRequest $request, WebCvUploadController $controller): JsonResponse
    {
        return $controller->store($request);
    }
}
