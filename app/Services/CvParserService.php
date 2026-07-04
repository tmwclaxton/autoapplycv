<?php

namespace App\Services;

use App\Support\PdfLinkExtractor;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use PhpOffice\PhpWord\IOFactory;
use Smalot\PdfParser\Parser;

class CvParserService
{
    public function __construct(
        private readonly NanoGptService $nanoGpt,
        private readonly TesseractOcrService $tesseract,
    ) {}

    public function extractText(UploadedFile $file): string
    {
        $mimeType = $file->getMimeType() ?? '';
        $extension = strtolower($file->getClientOriginalExtension());

        if ($this->isImage($mimeType, $extension)) {
            return $this->extractFromImageUpload($file);
        }

        $text = match (true) {
            $mimeType === 'application/pdf' || $extension === 'pdf' => $this->extractFromPdfUpload($file),
            in_array($extension, ['docx', 'doc'], true) || str_contains($mimeType, 'word') => $this->extractFromWord($file->getRealPath()),
            $extension === 'txt' || $mimeType === 'text/plain' => $this->extractFromPlainText($file),
            default => '',
        };

        return trim($text);
    }

    /**
     * @return array<int, string>
     */
    public function extractHyperlinks(UploadedFile $file): array
    {
        $mimeType = $file->getMimeType() ?? '';
        $extension = strtolower($file->getClientOriginalExtension());

        if ($mimeType !== 'application/pdf' && $extension !== 'pdf') {
            return [];
        }

        $path = $file->getRealPath();

        if (! is_string($path)) {
            return [];
        }

        return PdfLinkExtractor::extract($path);
    }

    private function extractFromPdfUpload(UploadedFile $file): string
    {
        $path = $file->getRealPath();

        if (! is_string($path)) {
            return '';
        }

        $embeddedText = $this->extractFromPdf($path);
        $minimumLength = (int) config('cv.min_extracted_text_length', 80);

        if (! $this->tesseract->isAvailable()) {
            return $embeddedText;
        }

        $ocrText = $this->tesseract->extractFromPdf($path);

        return trim($this->chooseBestPdfText(
            $embeddedText,
            $ocrText,
            $minimumLength,
            $file->getClientOriginalName(),
        ));
    }

    private function chooseBestPdfText(
        string $embeddedText,
        ?string $ocrText,
        int $minimumLength,
        string $filename,
    ): string {
        if ($ocrText === null || trim($ocrText) === '') {
            return $embeddedText;
        }

        $ocrText = trim($ocrText);

        if ($embeddedText === '' || mb_strlen($embeddedText) < $minimumLength) {
            Log::info('CvParserService: using Tesseract OCR for PDF.', [
                'filename' => $filename,
                'embedded_chars' => mb_strlen($embeddedText),
                'ocr_chars' => mb_strlen($ocrText),
            ]);

            return $ocrText;
        }

        if ((bool) config('cv.ocr_prefer_pdf_tesseract', false)) {
            Log::info('CvParserService: preferring Tesseract OCR text for PDF.', [
                'filename' => $filename,
                'embedded_chars' => mb_strlen($embeddedText),
                'ocr_chars' => mb_strlen($ocrText),
            ]);

            return $ocrText;
        }

        if (mb_strlen($ocrText) > mb_strlen($embeddedText) * 1.2) {
            Log::info('CvParserService: Tesseract OCR produced richer PDF text.', [
                'filename' => $filename,
                'embedded_chars' => mb_strlen($embeddedText),
                'ocr_chars' => mb_strlen($ocrText),
            ]);

            return $ocrText;
        }

        return $embeddedText;
    }

    private function extractFromImageUpload(UploadedFile $file): string
    {
        $path = $file->getRealPath();

        if (! is_string($path)) {
            return '';
        }

        if ($this->tesseract->isAvailable()) {
            $ocrText = $this->tesseract->extractFromImage($path);

            if ($ocrText !== null && $ocrText !== '') {
                Log::info('CvParserService: using Tesseract OCR for image.', [
                    'filename' => $file->getClientOriginalName(),
                    'ocr_chars' => mb_strlen($ocrText),
                ]);

                return trim($ocrText);
            }
        }

        if ((bool) config('cv.ocr_use_vision_fallback', true)) {
            $visionText = $this->extractFromImageViaNanoGpt($file);

            if ($visionText !== null && $visionText !== '') {
                Log::info('CvParserService: using NanoGPT vision OCR fallback.', [
                    'filename' => $file->getClientOriginalName(),
                    'ocr_chars' => mb_strlen($visionText),
                ]);

                return trim($visionText);
            }
        }

        return '';
    }

    private function isImage(string $mimeType, string $extension): bool
    {
        return str_starts_with($mimeType, 'image/')
            || in_array($extension, ['png', 'jpg', 'jpeg', 'webp'], true);
    }

    private function extractFromImageViaNanoGpt(UploadedFile $file): ?string
    {
        $mimeType = $file->getMimeType() ?? 'application/octet-stream';

        if (! str_starts_with($mimeType, 'image/')) {
            $extension = strtolower($file->getClientOriginalExtension());
            $mimeType = match ($extension) {
                'png' => 'image/png',
                'jpg', 'jpeg' => 'image/jpeg',
                'webp' => 'image/webp',
                default => $mimeType,
            };
        }

        if (! str_starts_with($mimeType, 'image/')) {
            return null;
        }

        $path = $file->getRealPath();

        if (! is_string($path)) {
            return null;
        }

        return $this->nanoGpt->extractTextFromImage($path, $mimeType);
    }

    private function extractFromPdf(string $path): string
    {
        try {
            $parser = new Parser;
            $pdf = $parser->parseFile($path);

            return trim($pdf->getText());
        } catch (\Throwable $exception) {
            Log::debug('CvParserService: embedded PDF text extraction failed.', [
                'path' => $path,
                'message' => $exception->getMessage(),
            ]);

            return '';
        }
    }

    private function extractFromWord(?string $path): string
    {
        if (! is_string($path)) {
            return '';
        }

        try {
            $phpWord = IOFactory::load($path);
        } catch (\Throwable $exception) {
            Log::debug('CvParserService: Word document extraction failed.', [
                'path' => $path,
                'message' => $exception->getMessage(),
            ]);

            return '';
        }

        $text = '';

        foreach ($phpWord->getSections() as $section) {
            $text .= $this->extractTextFromWordElements($section->getElements());
        }

        return trim($text);
    }

    private function extractFromPlainText(UploadedFile $file): string
    {
        $path = $file->getRealPath();

        if (! is_string($path) || ! is_readable($path)) {
            return '';
        }

        $contents = file_get_contents($path);

        return is_string($contents) ? trim($contents) : '';
    }

    /**
     * @param  iterable<mixed>  $elements
     */
    private function extractTextFromWordElements(iterable $elements): string
    {
        $text = '';

        foreach ($elements as $element) {
            $chunk = $this->extractTextFromWordElement($element);

            if ($chunk === '') {
                continue;
            }

            $text .= $chunk."\n";
        }

        return $text;
    }

    private function extractTextFromWordElement(mixed $element): string
    {
        if (is_string($element)) {
            return $element;
        }

        if (! is_object($element)) {
            return '';
        }

        if (method_exists($element, 'getText')) {
            $value = $element->getText();

            if (is_string($value)) {
                return $value;
            }

            if (is_object($value) && method_exists($value, 'getElements')) {
                return trim($this->extractTextFromWordElements($value->getElements()));
            }

            if (is_array($value)) {
                return trim($this->extractTextFromWordElements($value));
            }
        }

        if (method_exists($element, 'getElements')) {
            return trim($this->extractTextFromWordElements($element->getElements()));
        }

        return '';
    }
}
