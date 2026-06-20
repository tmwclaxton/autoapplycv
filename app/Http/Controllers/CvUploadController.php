<?php

namespace App\Http\Controllers;

use App\Models\CvProfile;
use App\Models\CvUpload;
use App\Services\CvParserService;
use App\Services\NanoGptService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\File;

class CvUploadController extends Controller
{
    public function __construct(
        private readonly CvParserService $cvParser,
        private readonly NanoGptService $nanoGpt,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'cv' => [
                'required',
                File::types(['pdf', 'doc', 'docx'])
                    ->max('10mb'),
            ],
        ]);

        $file = $request->file('cv');
        $user = $request->user();

        $rawText = $this->cvParser->extractText($file);

        $storedPath = $file->store("cv-uploads/{$user->id}", 'local');

        CvUpload::create([
            'user_id' => $user->id,
            'original_filename' => $file->getClientOriginalName(),
            'stored_path' => $storedPath,
            'mime_type' => $file->getMimeType(),
            'file_size' => $file->getSize(),
        ]);

        $parsed = $this->parseWithAi($rawText);

        $profile = CvProfile::updateOrCreate(
            ['user_id' => $user->id],
            array_merge($parsed ?? [], [
                'raw_cv_text' => $rawText,
                'parsing_complete' => $parsed !== null,
            ])
        );

        return response()->json([
            'success' => true,
            'profile' => $profile,
        ]);
    }

    public function updateProfile(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'full_name' => 'nullable|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'location' => 'nullable|string|max:255',
            'linkedin_url' => 'nullable|url|max:500',
            'website_url' => 'nullable|url|max:500',
            'summary' => 'nullable|string',
            'skills' => 'nullable|array',
            'experience' => 'nullable|array',
            'education' => 'nullable|array',
            'extra_context' => 'nullable|string',
        ]);

        $profile = CvProfile::updateOrCreate(
            ['user_id' => $request->user()->id],
            array_merge($validated, ['parsing_complete' => true])
        );

        return redirect()->route('dashboard')->with('success', 'Profile saved.');
    }

    /**
     * @return array<string, mixed>|null
     */
    private function parseWithAi(string $rawText): ?array
    {
        if (empty(trim($rawText))) {
            return null;
        }

        $truncated = mb_substr($rawText, 0, 8000);

        $result = $this->nanoGpt->chatJson([
            [
                'role' => 'system',
                'content' => 'You are a CV/resume parser. Extract structured data from the provided CV text and return valid JSON only.',
            ],
            [
                'role' => 'user',
                'content' => <<<PROMPT
                Parse this CV and return a JSON object with these exact keys:
                - full_name (string)
                - email (string)
                - phone (string)
                - location (string, city/country)
                - linkedin_url (string or null)
                - website_url (string or null)
                - summary (string, 2-3 sentence professional summary)
                - skills (array of strings)
                - experience (array of objects with: title, company, location, start_date, end_date, description)
                - education (array of objects with: degree, institution, location, start_date, end_date)

                CV text:
                {$truncated}
                PROMPT,
            ],
        ]);

        return $result;
    }
}
