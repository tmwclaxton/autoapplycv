<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use PhpOffice\PhpWord\IOFactory;
use Smalot\PdfParser\Parser;

class CvParserService
{
    public function extractText(UploadedFile $file): string
    {
        $mimeType = $file->getMimeType();
        $extension = strtolower($file->getClientOriginalExtension());

        if ($mimeType === 'application/pdf' || $extension === 'pdf') {
            return $this->extractFromPdf($file->getRealPath());
        }

        if (in_array($extension, ['docx', 'doc']) || str_contains($mimeType ?? '', 'word')) {
            return $this->extractFromWord($file->getRealPath());
        }

        return '';
    }

    private function extractFromPdf(string $path): string
    {
        $parser = new Parser;
        $pdf = $parser->parseFile($path);

        return trim($pdf->getText());
    }

    private function extractFromWord(string $path): string
    {
        $phpWord = IOFactory::load($path);
        $text = '';

        foreach ($phpWord->getSections() as $section) {
            foreach ($section->getElements() as $element) {
                if (method_exists($element, 'getText')) {
                    $text .= $element->getText().' ';
                } elseif (method_exists($element, 'getElements')) {
                    foreach ($element->getElements() as $child) {
                        if (method_exists($child, 'getText')) {
                            $text .= $child->getText().' ';
                        }
                    }
                }
            }
        }

        return trim($text);
    }
}
