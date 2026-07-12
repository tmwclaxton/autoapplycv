<?php

namespace App\Services;

class CoverLetterPdfBuilder
{
    private const PDF_WIDTH = 612;

    private const PDF_HEIGHT = 792;

    private const MARGIN_LEFT = 72;

    private const MARGIN_RIGHT = 72;

    private const MARGIN_TOP = 72;

    private const MARGIN_BOTTOM = 72;

    private const FONT_BODY = 'F3';

    private const FONT_SANS = 'F2';

    private const FONT_SANS_BOLD = 'F1';

    private const SIZE_NAME = 12;

    private const SIZE_CONTACT = 10;

    private const SIZE_META = 10.5;

    private const SIZE_BODY = 11.5;

    private const BODY_LEADING = 16;

    private const PARAGRAPH_GAP = 10;

    private const HEADER_GAP_BEFORE_BODY = 22;

    /**
     * @param  array<string, mixed>|null  $profile
     * @param  array<string, mixed>|null  $job
     */
    public function build(string $text, ?array $profile = null, ?array $job = null): string
    {
        $normalized = $this->normalizeUnicodeForPdf(trim($text));

        if ($normalized === '') {
            throw new \InvalidArgumentException('Nothing to save yet.');
        }

        $pageItems = $this->paginateLayoutItems($this->buildStyledLayoutItems($normalized, $profile, $job));
        $pageContents = array_map(fn (array $items): string => $this->buildPageContentStream($items), $pageItems);

        return $this->renderPdf($pageContents);
    }

    /**
     * @param  array<string, mixed>|null  $profile
     * @param  array<string, mixed>|null  $job
     * @return array<int, array<string, mixed>>
     */
    private function buildStyledLayoutItems(string $text, ?array $profile, ?array $job): array
    {
        $items = [];
        $y = self::PDF_HEIGHT - self::MARGIN_TOP;
        $contentBottom = self::MARGIN_BOTTOM;

        $pushGap = function (int $amount) use (&$y): void {
            $y -= $amount;
        };

        $ensureSpace = function (float $height) use (&$y, &$items, $contentBottom): void {
            if ($y - $height < $contentBottom) {
                $items[] = ['type' => 'page-break'];
                $y = self::PDF_HEIGHT - self::MARGIN_TOP;
            }
        };

        $pushText = function (array $config) use (&$y, &$items, $ensureSpace): void {
            $leading = (float) ($config['leading'] ?? self::BODY_LEADING);
            $ensureSpace($leading);
            $items[] = [
                'type' => 'text',
                'text' => (string) $config['text'],
                'font' => (string) ($config['font'] ?? self::FONT_BODY),
                'size' => (float) ($config['size'] ?? self::SIZE_BODY),
                'color' => $config['color'] ?? [0.102, 0.102, 0.18],
                'align' => (string) ($config['align'] ?? 'left'),
                'y' => $y,
            ];
            $y -= $leading;
        };

        $fullName = trim((string) ($profile['full_name'] ?? ''));
        $contactLine = $this->buildContactLine($profile);

        if ($fullName !== '') {
            $pushText([
                'text' => $fullName,
                'font' => self::FONT_SANS_BOLD,
                'size' => self::SIZE_NAME,
                'leading' => 16,
            ]);
        }

        if ($contactLine !== '') {
            $pushText([
                'text' => $contactLine,
                'font' => self::FONT_SANS,
                'size' => self::SIZE_CONTACT,
                'color' => [0.42, 0.42, 0.45],
                'leading' => 14,
            ]);
        }

        if ($fullName !== '' || $contactLine !== '') {
            $pushGap(10);
        }

        $pushText([
            'text' => now()->format('j F Y'),
            'font' => self::FONT_SANS,
            'size' => self::SIZE_META,
            'leading' => 14,
        ]);

        $pushGap(self::HEADER_GAP_BEFORE_BODY);

        $paragraphs = preg_split('/\n\s*\n/', str_replace("\r\n", "\n", $text)) ?: [];

        foreach ($paragraphs as $index => $paragraph) {
            $paragraph = trim((string) $paragraph);

            if ($paragraph === '') {
                continue;
            }

            foreach ($this->layoutCoverLetterLines($paragraph) as $line) {
                $pushText([
                    'text' => $line,
                    'font' => self::FONT_BODY,
                    'size' => self::SIZE_BODY,
                    'leading' => self::BODY_LEADING,
                ]);
            }

            if ($index < count($paragraphs) - 1) {
                $pushGap(self::PARAGRAPH_GAP);
            }
        }

        return $items;
    }

    /**
     * @param  array<string, mixed>|null  $profile
     */
    private function buildContactLine(?array $profile): string
    {
        if ($profile === null) {
            return '';
        }

        $parts = array_values(array_filter([
            trim((string) ($profile['email'] ?? '')),
            trim((string) ($profile['phone'] ?? '')),
            trim((string) ($profile['city'] ?? '')),
        ], fn (string $value): bool => $value !== ''));

        return implode(' | ', $parts);
    }

    /**
     * @return array<int, string>
     */
    private function layoutCoverLetterLines(string $text, int $maxChars = 78): array
    {
        $lines = [];

        foreach (explode("\n", str_replace("\r\n", "\n", $text)) as $paragraph) {
            if (trim($paragraph) === '') {
                $lines[] = '';

                continue;
            }

            foreach ($this->wrapParagraphLine($paragraph, $maxChars) as $wrapped) {
                $lines[] = $wrapped;
            }
        }

        return $lines;
    }

    /**
     * @return array<int, string>
     */
    private function wrapParagraphLine(string $line, int $maxChars): array
    {
        if (strlen($line) <= $maxChars) {
            return [$line];
        }

        $words = preg_split('/\s+/', $line) ?: [];
        $lines = [];
        $current = '';

        foreach ($words as $word) {
            $candidate = $current !== '' ? "{$current} {$word}" : $word;

            if (strlen($candidate) <= $maxChars) {
                $current = $candidate;

                continue;
            }

            if ($current !== '') {
                $lines[] = $current;
            }

            if (strlen($word) > $maxChars) {
                for ($index = 0; $index < strlen($word); $index += $maxChars) {
                    $lines[] = substr($word, $index, $maxChars);
                }

                $current = '';

                continue;
            }

            $current = $word;
        }

        if ($current !== '') {
            $lines[] = $current;
        }

        return $lines;
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array<int, array<int, array<string, mixed>>>
     */
    private function paginateLayoutItems(array $items): array
    {
        $pages = [[]];

        foreach ($items as $item) {
            if (($item['type'] ?? '') === 'page-break') {
                $pages[] = [];

                continue;
            }

            $pages[array_key_last($pages)][] = $item;
        }

        return array_values(array_filter($pages, fn (array $page): bool => $page !== []));
    }

    /**
     * @param  array<int, array<string, mixed>>  $pageItems
     */
    private function buildPageContentStream(array $pageItems): string
    {
        $parts = [];

        foreach ($pageItems as $item) {
            if (($item['type'] ?? '') !== 'text') {
                continue;
            }

            [$red, $green, $blue] = $item['color'];
            $x = self::MARGIN_LEFT;

            if (($item['align'] ?? 'left') === 'right') {
                $x = self::PDF_WIDTH - self::MARGIN_RIGHT - (strlen((string) $item['text']) * $item['size'] * 0.48);
            }

            $parts[] = 'BT';
            $parts[] = "{$red} {$green} {$blue} rg";
            $parts[] = "{$item['font']} {$item['size']} Tf";
            $parts[] = "{$x} {$item['y']} Td";
            $parts[] = '('.$this->escapePdfString((string) $item['text']).') Tj';
            $parts[] = 'ET';
        }

        return implode("\n", $parts);
    }

    /**
     * @param  array<int, string>  $pageContents
     */
    private function renderPdf(array $pageContents): string
    {
        $chunks = ["%PDF-1.4\n"];
        $offsets = [0];

        $addObject = function (int $objectNumber, string $body) use (&$chunks, &$offsets): void {
            $offsets[$objectNumber] = strlen(implode('', $chunks));
            $chunks[] = "{$objectNumber} 0 obj\n{$body}\nendobj\n";
        };

        $fontObjects = [
            self::FONT_SANS_BOLD => 3,
            self::FONT_SANS => 4,
            self::FONT_BODY => 5,
        ];
        $firstPageObjectNumber = 6;
        $pageObjectNumbers = array_map(
            fn (int $index): int => $firstPageObjectNumber + ($index * 2),
            array_keys($pageContents),
        );
        $streamObjectNumbers = array_map(
            fn (int $index): int => $firstPageObjectNumber + 1 + ($index * 2),
            array_keys($pageContents),
        );
        $lastObjectNumber = $streamObjectNumbers !== [] ? end($streamObjectNumbers) : $fontObjects[self::FONT_BODY];

        $addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
        $addObject(
            2,
            '<< /Type /Pages /Kids ['.implode(' ', array_map(fn (int $n): string => "{$n} 0 R", $pageObjectNumbers)).'] /Count '.count($pageContents).' >>',
        );
        $addObject(
            $fontObjects[self::FONT_SANS_BOLD],
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
        );
        $addObject(
            $fontObjects[self::FONT_SANS],
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        );
        $addObject(
            $fontObjects[self::FONT_BODY],
            '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>',
        );

        foreach ($pageContents as $index => $content) {
            $streamObjectNumber = $streamObjectNumbers[$index];
            $pageObjectNumber = $pageObjectNumbers[$index];

            $addObject(
                $streamObjectNumber,
                '<< /Length '.strlen($content)." >>\nstream\n{$content}\nendstream",
            );
            $addObject(
                $pageObjectNumber,
                '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '.self::PDF_WIDTH.' '.self::PDF_HEIGHT.'] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents '.$streamObjectNumber.' 0 R >>',
            );
        }

        $pdfBody = implode('', $chunks);
        $xrefOffset = strlen($pdfBody);
        $xref = "xref\n0 ".($lastObjectNumber + 1)."\n";
        $xref .= "0000000000 65535 f \n";

        for ($objectNumber = 1; $objectNumber <= $lastObjectNumber; $objectNumber++) {
            $xref .= str_pad((string) $offsets[$objectNumber], 10, '0', STR_PAD_LEFT)." 00000 n \n";
        }

        $pdfBody .= $xref;
        $pdfBody .= "trailer\n<< /Size ".($lastObjectNumber + 1)." /Root 1 0 R >>\nstartxref\n{$xrefOffset}\n%%EOF\n";

        return $pdfBody;
    }

    private function normalizeUnicodeForPdf(string $text): string
    {
        $text = str_replace(["\u{2014}", "\u{2013}"], '-', $text);
        $text = str_replace(["\u{2018}", "\u{2019}"], "'", $text);
        $text = str_replace(["\u{201C}", "\u{201D}"], '"', $text);
        $text = str_replace("\u{2026}", '...', $text);
        $text = str_replace("\u{00A0}", ' ', $text);

        return $text;
    }

    private function encodeForWinAnsiPdf(string $text): string
    {
        if ($text === '') {
            return '';
        }

        $result = '';

        foreach (preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) as $char) {
            $code = mb_ord($char, 'UTF-8');

            if ($code <= 0x7F) {
                $result .= $char;

                continue;
            }

            if ($code >= 0xA0 && $code <= 0xFF) {
                $result .= chr($code);

                continue;
            }

            $mapped = self::unicodeToWin1252($code);
            $result .= $mapped !== null ? chr($mapped) : '?';
        }

        return $result;
    }

    private static function unicodeToWin1252(int $code): ?int
    {
        return match ($code) {
            0x20AC => 0x80,
            0x201A => 0x82,
            0x0192 => 0x83,
            0x201E => 0x84,
            0x2026 => 0x85,
            0x2020 => 0x86,
            0x2021 => 0x87,
            0x02C6 => 0x88,
            0x2030 => 0x89,
            0x0160 => 0x8A,
            0x2039 => 0x8B,
            0x0152 => 0x8C,
            0x017D => 0x8E,
            0x2018 => 0x91,
            0x2019 => 0x92,
            0x201C => 0x93,
            0x201D => 0x94,
            0x2022 => 0x95,
            0x2013 => 0x96,
            0x2014 => 0x97,
            0x02DC => 0x98,
            0x2122 => 0x99,
            0x0161 => 0x9A,
            0x203A => 0x9B,
            0x0153 => 0x9C,
            0x017E => 0x9E,
            0x0178 => 0x9F,
            default => null,
        };
    }

    private function escapePdfString(string $value): string
    {
        $value = $this->encodeForWinAnsiPdf($this->normalizeUnicodeForPdf($value));

        return str_replace(
            ['\\', '(', ')', "\r"],
            ['\\\\', '\\(', '\\)', ''],
            $value,
        );
    }
}
