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

    /*
    | Recommended NANOGPT_CV_MODEL values (optional override via .env):
    | - google/gemini-3.1-flash-lite:ttfs        fast default for clean PDF/Word text
    | - deepseek/deepseek-v4-flash:throughput    best for OCR / garbled extracts (NANOGPT_CV_OCR_MODEL)
    | Avoid qwen3.7-max for uploads - high quality but 10x+ slower on full CV output.
    */
    'extraction_model' => env('NANOGPT_CV_MODEL') ?: 'google/gemini-3.1-flash-lite:ttfs',

    'extraction_model_ocr' => env('NANOGPT_CV_OCR_MODEL') ?: 'deepseek/deepseek-v4-flash:throughput',

    /*
     * Absolute NanoGPT model ids tried after services.nanogpt.fallback_models
     * when the requested model still fails with provider 503 / all_fallbacks_failed.
     * Applied centrally by NanoGptService for ATS score, cover letter, draft-all, etc.
     */
    'extraction_model_fallbacks' => [
        'google/gemini-3.1-flash-lite:throughput',
        'deepseek/deepseek-v4-flash:throughput',
    ],

    'inventory_model' => 'google/gemini-3.1-flash-lite:throughput',

    'form_corpus_ai_model' => 'deepseek/deepseek-v4-flash',

    'form_corpus_firecrawl_scrutiny_model' => 'google/gemini-3.1-flash-lite:throughput',

    'form_corpus_firecrawl_scrutiny_timeout' => 60,

    'form_corpus_firecrawl_scrutiny_html_chars' => 12000,

    'form_corpus_inventory_oracle_model' => 'google/gemini-3.1-flash-lite:throughput',

    'form_corpus_inventory_oracle_timeout' => 60,

    'form_corpus_inventory_oracle_html_chars' => 40000,

    'job_context_model' => 'google/gemini-3.1-flash-lite:ttfs',

    'extraction_timeout' => 45,

    'extraction_cache_ttl' => 86400,

    'vision_timeout' => 45,

    'upload_time_limit' => 180,

    'ocr_enabled' => filter_var(env('CV_OCR_ENABLED', true), FILTER_VALIDATE_BOOL),

    'ocr_language' => env('CV_OCR_LANGUAGE', 'eng'),

    'ocr_psm' => (int) env('CV_OCR_PSM', 3),

    'ocr_dpi' => (int) env('CV_OCR_DPI', 200),

    'ocr_max_pdf_pages' => (int) env('CV_OCR_MAX_PDF_PAGES', 10),

    'ocr_timeout' => (int) env('CV_OCR_TIMEOUT_SECONDS', 120),

    'ocr_use_vision_fallback' => filter_var(env('CV_OCR_USE_VISION_FALLBACK', true), FILTER_VALIDATE_BOOL),

    'ocr_prefer_pdf_tesseract' => filter_var(env('CV_OCR_PREFER_PDF_TESSERACT', false), FILTER_VALIDATE_BOOL),

    'cv_upload_mimes' => [
        'pdf',
        'doc',
        'docx',
        'txt',
        'png',
        'jpg',
        'jpeg',
        'webp',
    ],

    'cv_upload_max_kb' => 10240,

    'document_upload_mimes' => [
        'pdf',
        'doc',
        'docx',
        'txt',
        'png',
        'jpg',
        'jpeg',
        'webp',
        'gif',
        'xls',
        'xlsx',
    ],

    'document_max_upload_kb' => (int) env('CV_DOCUMENT_MAX_UPLOAD_KB', 10240),

    'max_profile_documents' => (int) env('CV_MAX_PROFILE_DOCUMENTS', 25),

    'extension_login_url' => env('EXTENSION_LOGIN_URL', 'https://autocvapply.com'),

    'ai_assist' => [
        'cover_letter_cost' => (int) env('CV_AI_COVER_LETTER_COST', 5),
        'ats_score_cost' => (int) env('CV_AI_ATS_SCORE_COST', 5),
        'chat_cost' => (int) env('CV_AI_CHAT_COST', 1),
        'question_cost' => 1,
        'draft_all_batch_size' => (int) env('CV_AI_DRAFT_ALL_BATCH_SIZE', 10),
    ],

    'seconds_saved_per_field' => (int) env('CV_SECONDS_SAVED_PER_FIELD', 30),

    'analytics_chart_days' => 30,

];
