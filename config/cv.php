<?php

return [

    /*
    |--------------------------------------------------------------------------
    | CV parsing & extraction
    |--------------------------------------------------------------------------
    */

    'min_extracted_text_length' => (int) env('CV_MIN_EXTRACTED_TEXT_LENGTH', 80),

    'max_raw_text_chars' => (int) env('CV_MAX_RAW_TEXT_CHARS', 32000),

    'vision_model' => env('NANOGPT_VISION_MODEL', 'openai/gpt-4.1-mini:speed'),

    'extraction_model' => env('NANOGPT_CV_MODEL', 'deepseek/deepseek-v4-flash:throughput'),

    'extraction_timeout' => (int) env('CV_EXTRACTION_TIMEOUT_SECONDS', 180),

    'vision_timeout' => (int) env('CV_VISION_TIMEOUT_SECONDS', 120),

    'upload_time_limit' => (int) env('CV_UPLOAD_TIME_LIMIT_SECONDS', 300),

    'ocr_enabled' => filter_var(env('CV_OCR_ENABLED', true), FILTER_VALIDATE_BOOL),

    'ocr_language' => env('CV_OCR_LANGUAGE', 'eng'),

    'ocr_psm' => (int) env('CV_OCR_PSM', 3),

    'ocr_dpi' => (int) env('CV_OCR_DPI', 200),

    'ocr_max_pdf_pages' => (int) env('CV_OCR_MAX_PDF_PAGES', 10),

    'ocr_timeout' => (int) env('CV_OCR_TIMEOUT_SECONDS', 120),

    'ocr_use_vision_fallback' => filter_var(env('CV_OCR_USE_VISION_FALLBACK', true), FILTER_VALIDATE_BOOL),

    'ocr_prefer_pdf_tesseract' => filter_var(env('CV_OCR_PREFER_PDF_TESSERACT', false), FILTER_VALIDATE_BOOL),

    'allowed_mimes' => [
        'pdf',
        'doc',
        'docx',
        'png',
        'jpg',
        'jpeg',
        'webp',
    ],

    'document_allowed_mimes' => [
        'pdf',
        'doc',
        'docx',
        'png',
        'jpg',
        'jpeg',
        'webp',
    ],

    'document_max_upload_kb' => (int) env('CV_DOCUMENT_MAX_UPLOAD_KB', 10240),

    'max_profile_documents' => (int) env('CV_MAX_PROFILE_DOCUMENTS', 25),

    'extension_login_url' => env('EXTENSION_LOGIN_URL', 'https://autocvapply.com'),

    'ai_assist' => [
        'cover_letter_cost' => (int) env('CV_AI_COVER_LETTER_COST', 8),
        'ats_score_cost' => (int) env('CV_AI_ATS_SCORE_COST', 5),
        'tailored_resume_cost' => (int) env('CV_AI_TAILORED_RESUME_COST', 10),
        'draft_field_cost' => (int) env('CV_AI_DRAFT_FIELD_COST', 1),
        'chat_cost' => (int) env('CV_AI_CHAT_COST', 2),
        'draft_all_batch_size' => (int) env('CV_AI_DRAFT_ALL_BATCH_SIZE', 10),
        'draft_all_batch_cost' => (int) env('CV_AI_DRAFT_ALL_BATCH_COST', 3),
        'inventory_cost' => 1,
    ],

    'seconds_saved_per_field' => (int) env('CV_SECONDS_SAVED_PER_FIELD', 30),

    'analytics_chart_days' => 30,

];
