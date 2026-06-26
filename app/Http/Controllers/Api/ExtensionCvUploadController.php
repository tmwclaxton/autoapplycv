<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\CvUploadController as WebCvUploadController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExtensionCvUploadController extends Controller
{
    public function store(Request $request, WebCvUploadController $controller): JsonResponse
    {
        return $controller->store($request);
    }
}
