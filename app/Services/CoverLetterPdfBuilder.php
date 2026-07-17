<?php

namespace App\Services;

use App\Support\CoverLetterBodyText;
use App\Support\CoverLetterContactHtml;
use App\Support\CoverLetterDesignSettings;
use App\Support\CoverLetterPdfFontMetrics;

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

    private const SIZE_NAME = 18;

    private const SIZE_CONTACT = 10;

    private const SIZE_META = 10.5;

    private const SIZE_BODY = 11.5;

    private const BODY_LEADING = 16;

    private const PARAGRAPH_GAP = 10;

    private const HEADER_GAP_BEFORE_BODY = 22;

    /**
     * @param  array<string, mixed>|null  $profile
     * @param  array<string, mixed>|null  $job
     * @param  array<string, mixed>  $options
     */
    public function build(string $text, ?array $profile = null, ?array $job = null, array $options = []): string
    {
        $normalized = $this->normalizeUnicodeForPdf(trim($text));

        if ($normalized === '') {
            throw new \InvalidArgumentException('Nothing to save yet.');
        }

        $normalized = CoverLetterBodyText::stripLeadingLetterhead($normalized, $profile);

        if ($normalized === '') {
            throw new \InvalidArgumentException('Nothing to save yet.');
        }

        $resolved = CoverLetterDesignSettings::resolveForGeneration(
            isset($options['design']) ? (string) $options['design'] : null,
            isset($options['font']) ? (string) $options['font'] : null,
        );
        $serif = CoverLetterDesignSettings::fontDefinition($resolved['cover_letter_font'])['pdf_base'] === 'times';
        $accent = CoverLetterDesignSettings::accentRgb($resolved['cover_letter_design']);

        $pageItems = $this->paginateLayoutItems($this->buildStyledLayoutItems(
            $normalized,
            $profile,
            $job,
            $options,
            $resolved['cover_letter_design'],
            $accent,
            $serif,
        ));
        $pagePayloads = array_map(
            fn (array $items): array => $this->buildPageContentStream($items),
            $pageItems,
        );

        return $this->renderPdf($pagePayloads, $serif, $resolved);
    }

    /**
     * @param  array<string, mixed>|null  $profile
     * @param  array<string, mixed>|null  $job
     * @param  array<string, mixed>  $options
     * @param  array{0: float, 1: float, 2: float}  $accent
     * @return array<int, array<string, mixed>>
     */
    private function buildStyledLayoutItems(
        string $text,
        ?array $profile,
        ?array $job,
        array $options,
        string $design,
        array $accent,
        bool $serif,
    ): array {
        $includeDate = (bool) ($options['include_date'] ?? true);
        $items = [];
        $marginLeft = self::MARGIN_LEFT;
        $contentWidth = self::PDF_WIDTH - self::MARGIN_LEFT - self::MARGIN_RIGHT;
        $y = self::PDF_HEIGHT - self::MARGIN_TOP;
        $contentBottom = self::MARGIN_BOTTOM;
        $ink = [0.102, 0.102, 0.18];
        $muted = [0.42, 0.42, 0.45];
        $onAccent = [1.0, 1.0, 1.0];
        $nameFont = self::FONT_SANS_BOLD;
        $metaFont = self::FONT_SANS;
        $bodyFont = $serif ? self::FONT_BODY : self::FONT_SANS;

        $pushGap = function (int $amount) use (&$y): void {
            $y -= $amount;
        };

        $ensureSpace = function (float $height) use (&$y, &$items, $contentBottom): void {
            if ($y - $height < $contentBottom) {
                $items[] = ['type' => 'page-break'];
                $y = self::PDF_HEIGHT - self::MARGIN_TOP;
            }
        };

        $pushText = function (array $config) use (&$y, &$items, $ensureSpace, &$marginLeft, &$contentWidth, $serif): void {
            $leading = (float) ($config['leading'] ?? self::BODY_LEADING);
            $font = (string) ($config['font'] ?? self::FONT_BODY);
            $size = (float) ($config['size'] ?? self::SIZE_BODY);
            $widthLimit = isset($config['maxWidth']) ? (float) $config['maxWidth'] : $contentWidth;
            $metricsKey = $this->metricsKeyForPdfFont($font, $serif);
            $wrap = (bool) ($config['wrap'] ?? true);
            $justify = (bool) ($config['justify'] ?? false);
            $align = (string) ($config['align'] ?? 'left');
            $x = (float) ($config['x'] ?? $marginLeft);
            $color = $config['color'] ?? [0.102, 0.102, 0.18];
            $providedLinks = $config['linkMatches'] ?? null;
            $text = (string) ($config['text'] ?? '');
            $wrapped = $wrap
                ? CoverLetterPdfFontMetrics::wrapToWidth($text, $widthLimit, $size, $metricsKey)
                : [$text];

            foreach ($wrapped as $lineIndex => $line) {
                $isLastLine = $lineIndex === count($wrapped) - 1;
                $lineAlign = $justify && ! $isLastLine && str_contains($line, ' ')
                    ? 'justify'
                    : ($align === 'justify' ? 'left' : $align);
                $ensureSpace($leading);
                $matches = is_array($providedLinks) && count($wrapped) === 1
                    ? $providedLinks
                    : CoverLetterContactHtml::findLinkMatches($line);

                $items[] = [
                    'type' => 'text',
                    'text' => $line,
                    'font' => $font,
                    'size' => $size,
                    'color' => $color,
                    'align' => $lineAlign,
                    'x' => $x,
                    'y' => $y,
                    'maxWidth' => $widthLimit,
                    'metricsKey' => $metricsKey,
                    'linkMatches' => $matches,
                ];
                $y -= $leading;
            }
        };

        $fullName = trim((string) ($profile['full_name'] ?? ''));
        $headline = trim((string) ($profile['headline'] ?? ''));
        $contactParts = CoverLetterContactHtml::contactParts($profile);
        $contactLine = implode(' | ', array_map(
            fn (array $part): string => $part['value'],
            $contactParts,
        ));
        $contactLinks = $this->contactLineLinkMatches($contactParts);
        $bandDesigns = ['teal-masthead', 'mono-bold', 'ocean-wash', 'slate-bands'];

        if ($design === 'ink-sidebar') {
            $rail = 150.0;
            $sideX = 18.0;
            $sideWidth = $rail - ($sideX * 2);
            $items[] = [
                'type' => 'rect',
                'x' => 0,
                'y' => 0,
                'w' => $rail,
                'h' => self::PDF_HEIGHT,
                'color' => $accent,
            ];
            $marginLeft = $rail + 28;
            $contentWidth = self::PDF_WIDTH - $marginLeft - self::MARGIN_RIGHT;
            $sideY = self::PDF_HEIGHT - 56;

            $pushSidebarText = function (
                string $text,
                string $font,
                float $size,
                array $color,
                float $leading,
                ?string $href = null,
            ) use (&$items, &$sideY, $sideX, $sideWidth, $serif): void {
                $metricsKey = $this->metricsKeyForPdfFont($font, $serif);

                foreach (CoverLetterPdfFontMetrics::wrapToWidth($text, $sideWidth, $size, $metricsKey) as $line) {
                    $items[] = [
                        'type' => 'text',
                        'text' => $line,
                        'font' => $font,
                        'size' => $size,
                        'color' => $color,
                        'align' => 'left',
                        'x' => $sideX,
                        'y' => $sideY,
                        'maxWidth' => $sideWidth,
                        'metricsKey' => $metricsKey,
                        'linkMatches' => $href !== null
                            ? [['start' => 0, 'end' => strlen($line), 'href' => $href]]
                            : [],
                    ];
                    $sideY -= $leading;
                }
            };

            if ($fullName !== '') {
                $pushSidebarText($fullName, $nameFont, 14, $onAccent, 16);
                $sideY -= 2;
            }

            if ($headline !== '') {
                $pushSidebarText($headline, $metaFont, 9, [0.85, 0.85, 0.88], 12);
                $sideY -= 4;
            }

            foreach ($contactParts as $part) {
                $pushSidebarText(
                    $part['value'],
                    $metaFont,
                    8.5,
                    [0.82, 0.82, 0.86],
                    11,
                    $part['href'],
                );
                $sideY -= 2;
            }

            $y = self::PDF_HEIGHT - 56;
            $fullName = '';
            $headline = '';
            $contactLine = '';
            $contactLinks = [];
        } elseif ($design === 'forest-rail') {
            $items[] = [
                'type' => 'rect',
                'x' => 0,
                'y' => 0,
                'w' => 12,
                'h' => self::PDF_HEIGHT,
                'color' => $accent,
            ];
            $marginLeft = 56;
            $contentWidth = self::PDF_WIDTH - $marginLeft - self::MARGIN_RIGHT;
        } elseif ($design === 'geometric-mark' && $fullName !== '') {
            $mark = $this->monogram($fullName);
            $items[] = [
                'type' => 'rect',
                'x' => $marginLeft,
                'y' => self::PDF_HEIGHT - self::MARGIN_TOP - 36,
                'w' => 40,
                'h' => 40,
                'color' => $accent,
                'stroke' => true,
            ];
            $items[] = [
                'type' => 'text',
                'text' => $mark,
                'font' => $nameFont,
                'size' => 14,
                'color' => $accent,
                'align' => 'left',
                'x' => $marginLeft + 8,
                'y' => self::PDF_HEIGHT - self::MARGIN_TOP - 12,
                'maxWidth' => 36.0,
                'metricsKey' => $this->metricsKeyForPdfFont($nameFont, $serif),
            ];
            $marginLeft += 52;
            $contentWidth = self::PDF_WIDTH - $marginLeft - self::MARGIN_RIGHT;
        } elseif (in_array($design, $bandDesigns, true)) {
            $bandHeight = $design === 'slate-bands' ? 96.0 : 108.0;
            $items[] = [
                'type' => 'rect',
                'x' => 0,
                'y' => self::PDF_HEIGHT - $bandHeight,
                'w' => self::PDF_WIDTH,
                'h' => $bandHeight,
                'color' => $design === 'slate-bands' ? [0.886, 0.910, 0.941] : $accent,
            ];
            $y = self::PDF_HEIGHT - 34;
            $nameColor = $design === 'slate-bands' ? $ink : $onAccent;
            $metaColor = $design === 'slate-bands' ? $muted : [0.92, 0.92, 0.94];

            if ($fullName !== '') {
                $pushText([
                    'text' => $fullName,
                    'font' => $nameFont,
                    'size' => self::SIZE_NAME,
                    'color' => $nameColor,
                    'leading' => 22,
                    'x' => $marginLeft,
                ]);
            }

            if ($headline !== '') {
                $pushText([
                    'text' => $headline,
                    'font' => $metaFont,
                    'size' => self::SIZE_CONTACT,
                    'color' => $metaColor,
                    'leading' => 14,
                    'x' => $marginLeft,
                ]);
            }

            if ($contactLine !== '') {
                $pushText([
                    'text' => $contactLine,
                    'font' => $metaFont,
                    'size' => 9,
                    'color' => $metaColor,
                    'leading' => 12,
                    'x' => $marginLeft,
                    'linkMatches' => $contactLinks,
                ]);
            }

            $y = self::PDF_HEIGHT - $bandHeight - 24;
            $fullName = '';
            $headline = '';
            $contactLine = '';
            $contactLinks = [];
        } elseif ($design === 'asymmetric-split') {
            $items[] = [
                'type' => 'rect',
                'x' => $marginLeft,
                'y' => self::PDF_HEIGHT - self::MARGIN_TOP - 52,
                'w' => $contentWidth,
                'h' => 2.5,
                'color' => $accent,
            ];
        } elseif ($design === 'swiss-rules') {
            $items[] = [
                'type' => 'rect',
                'x' => $marginLeft,
                'y' => self::PDF_HEIGHT - self::MARGIN_TOP - 58,
                'w' => $contentWidth,
                'h' => 0.8,
                'color' => $accent,
            ];
        } elseif ($design === 'coral-timeline') {
            $items[] = [
                'type' => 'rect',
                'x' => $marginLeft - 18,
                'y' => self::MARGIN_BOTTOM,
                'w' => 2,
                'h' => self::PDF_HEIGHT - self::MARGIN_TOP - self::MARGIN_BOTTOM,
                'color' => [0.94, 0.82, 0.78],
            ];
        }

        if ($fullName !== '') {
            $pushText([
                'text' => $fullName,
                'font' => $nameFont,
                'size' => $design === 'swiss-rules' ? 22 : self::SIZE_NAME,
                'color' => $design === 'forest-rail' ? $accent : $ink,
                'leading' => 22,
                'x' => $marginLeft,
            ]);
        }

        if ($headline !== '') {
            $pushText([
                'text' => $headline,
                'font' => $metaFont,
                'size' => self::SIZE_CONTACT,
                'color' => in_array($design, ['coral-timeline', 'asymmetric-split'], true) ? $accent : $muted,
                'leading' => 14,
                'x' => $marginLeft,
            ]);
        }

        if ($contactLine !== '') {
            $pushText([
                'text' => $contactLine,
                'font' => $metaFont,
                'size' => self::SIZE_CONTACT,
                'color' => $muted,
                'leading' => 14,
                'x' => $marginLeft,
                'linkMatches' => $contactLinks,
            ]);
        }

        if ($fullName !== '' || $headline !== '' || $contactLine !== '') {
            $pushGap(10);
        }

        $jobTitle = trim((string) ($job['title'] ?? ''));
        $company = trim((string) ($job['company'] ?? ''));

        if ($jobTitle !== '' || $company !== '') {
            $meta = trim(implode(' · ', array_filter([$jobTitle, $company])));
            $pushText([
                'text' => strtoupper($meta),
                'font' => $metaFont,
                'size' => 9,
                'color' => $muted,
                'leading' => 12,
                'x' => $marginLeft,
            ]);
            $pushGap(6);
        }

        if ($includeDate) {
            $dateColor = $design === 'coral-timeline' ? $accent : $ink;

            if ($design === 'coral-timeline') {
                $items[] = [
                    'type' => 'rect',
                    'x' => $marginLeft - 22,
                    'y' => $y - 3,
                    'w' => 8,
                    'h' => 8,
                    'color' => $accent,
                ];
            }

            $pushText([
                'text' => now()->format('j F Y'),
                'font' => $metaFont,
                'size' => self::SIZE_META,
                'color' => $dateColor,
                'leading' => 14,
                'x' => $marginLeft,
            ]);

            $pushGap(self::HEADER_GAP_BEFORE_BODY);
        } elseif ($fullName !== '' || $headline !== '' || $contactLine !== '') {
            $pushGap(self::HEADER_GAP_BEFORE_BODY - 10);
        }

        $paragraphs = preg_split('/\n\s*\n/', str_replace("\r\n", "\n", $text)) ?: [];

        foreach ($paragraphs as $index => $paragraph) {
            $paragraph = trim((string) $paragraph);

            if ($paragraph === '') {
                continue;
            }

            $pushText([
                'text' => $paragraph,
                'font' => $bodyFont,
                'size' => self::SIZE_BODY,
                'color' => $ink,
                'leading' => self::BODY_LEADING,
                'x' => $marginLeft,
                'maxWidth' => $contentWidth,
                'justify' => $this->isJustifiableBodyParagraph($paragraph),
            ]);

            if ($index < count($paragraphs) - 1) {
                $pushGap(self::PARAGRAPH_GAP);
            }
        }

        return $items;
    }

    private function metricsKeyForPdfFont(string $pdfFont, bool $serif): string
    {
        if ($pdfFont === self::FONT_SANS_BOLD) {
            return $serif ? 'times-bold' : 'helvetica-bold';
        }

        return $serif ? 'times-roman' : 'helvetica';
    }

    private function monogram(string $fullName): string
    {
        $parts = preg_split('/\s+/', trim($fullName)) ?: [];
        $letters = '';

        foreach (array_slice($parts, 0, 2) as $part) {
            $letters .= strtoupper(substr((string) $part, 0, 1));
        }

        return $letters !== '' ? $letters : 'CL';
    }

    private function looksLikeGreeting(string $line): bool
    {
        return (bool) preg_match('/^(dear\b|to whom it may concern\b|hi\b|hello\b)/i', trim($line));
    }

    private function looksLikeSignOff(string $line): bool
    {
        return (bool) preg_match(
            '/^\s*(yours\s+(sincerely|faithfully)|kind\s+regards|best\s+regards|warm\s+regards|regards|sincerely)\s*,?\s*$/i',
            trim($line),
        );
    }

    private function isJustifiableBodyParagraph(string $paragraph): bool
    {
        $firstLine = trim(explode("\n", $paragraph)[0] ?? '');

        if ($firstLine === '' || $this->looksLikeGreeting($firstLine) || $this->looksLikeSignOff($firstLine)) {
            return false;
        }

        return true;
    }

    /**
     * @param  list<array{label: string, value: string, href: string|null}>  $parts
     * @return list<array{start: int, end: int, href: string}>
     */
    private function contactLineLinkMatches(array $parts): array
    {
        $matches = [];
        $offset = 0;
        $sep = ' | ';

        foreach ($parts as $index => $part) {
            $value = $part['value'];

            if (is_string($part['href']) && $part['href'] !== '') {
                $matches[] = [
                    'start' => $offset,
                    'end' => $offset + strlen($value),
                    'href' => $part['href'],
                ];
            }

            $offset += strlen($value);

            if ($index < count($parts) - 1) {
                $offset += strlen($sep);
            }
        }

        return $matches;
    }

    private function estimateTextWidth(string $text, float $fontSize, string $metricsKey = 'helvetica'): float
    {
        return CoverLetterPdfFontMetrics::measureWidth($text, $fontSize, $metricsKey);
    }

    private function estimateRenderedWidth(
        string $text,
        float $fontSize,
        string $metricsKey = 'helvetica',
        float $wordSpacing = 0.0,
    ): float {
        return CoverLetterPdfFontMetrics::measureRenderedWidth($text, $fontSize, $metricsKey, $wordSpacing);
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
     * @return array{content: string, annots: list<array{rect: array{0: float, 1: float, 2: float, 3: float}, uri: string}>}
     */
    private function buildPageContentStream(array $pageItems): array
    {
        $parts = [];
        $annots = [];

        foreach ($pageItems as $item) {
            $type = (string) ($item['type'] ?? '');

            if ($type === 'rect') {
                [$red, $green, $blue] = $item['color'];
                $x = (float) $item['x'];
                $y = (float) $item['y'];
                $w = (float) $item['w'];
                $h = (float) $item['h'];

                if (! empty($item['stroke'])) {
                    $parts[] = "{$red} {$green} {$blue} RG";
                    $parts[] = '2 w';
                    $parts[] = "{$x} {$y} {$w} {$h} re S";
                } else {
                    $parts[] = "{$red} {$green} {$blue} rg";
                    $parts[] = "{$x} {$y} {$w} {$h} re f";
                }

                continue;
            }

            if ($type !== 'text') {
                continue;
            }

            [$red, $green, $blue] = $item['color'];
            $x = (float) ($item['x'] ?? self::MARGIN_LEFT);
            $text = (string) $item['text'];
            $size = (float) $item['size'];
            $metricsKey = (string) ($item['metricsKey'] ?? $this->metricsKeyForPdfFont((string) $item['font'], false));
            $wordSpacing = 0.0;

            if (($item['align'] ?? 'left') === 'right') {
                $x = self::PDF_WIDTH - self::MARGIN_RIGHT - $this->estimateTextWidth($text, $size, $metricsKey);
            } elseif (($item['align'] ?? 'left') === 'justify') {
                $spaces = substr_count($text, ' ');
                $maxWidth = (float) ($item['maxWidth'] ?? 0);

                if ($spaces > 0 && $maxWidth > 0) {
                    $naturalWidth = $this->estimateTextWidth($text, $size, $metricsKey);
                    $wordSpacing = max(0.0, ($maxWidth - $naturalWidth) / $spaces);
                }
            }

            if ($wordSpacing > 0) {
                $parts[] = number_format($wordSpacing, 3, '.', '').' Tw';
            }

            $parts[] = 'BT';
            $parts[] = "{$red} {$green} {$blue} rg";
            $parts[] = "{$item['font']} {$size} Tf";
            $parts[] = "{$x} {$item['y']} Td";
            $parts[] = '('.$this->escapePdfString($text).') Tj';
            $parts[] = 'ET';

            if ($wordSpacing > 0) {
                $parts[] = '0 Tw';
            }

            foreach ($item['linkMatches'] ?? [] as $match) {
                $start = (int) ($match['start'] ?? 0);
                $end = (int) ($match['end'] ?? 0);
                $href = (string) ($match['href'] ?? '');

                if ($href === '' || $end <= $start) {
                    continue;
                }

                $prefix = substr($text, 0, $start);
                $token = substr($text, $start, $end - $start);
                $llx = $x + $this->estimateRenderedWidth($prefix, $size, $metricsKey, $wordSpacing);
                $linkWidth = max(
                    $this->estimateRenderedWidth($token, $size, $metricsKey, $wordSpacing),
                    $size * 0.25,
                );
                $lly = (float) $item['y'] - ($size * 0.2);
                $ury = (float) $item['y'] + ($size * 0.8);

                $annots[] = [
                    'rect' => [$llx, $lly, $llx + $linkWidth, $ury],
                    'uri' => $href,
                ];
            }
        }

        return [
            'content' => implode("\n", $parts),
            'annots' => $annots,
        ];
    }

    /**
     * @param  list<array{content: string, annots: list<array{rect: array{0: float, 1: float, 2: float, 3: float}, uri: string}>}>  $pagePayloads
     * @param  array{cover_letter_design: string, cover_letter_font: string, design_preference: string, font_preference: string}  $resolved
     */
    private function renderPdf(array $pagePayloads, bool $serif, array $resolved): string
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

        $nextObjectNumber = 6;
        $pageAllocations = [];

        foreach ($pagePayloads as $payload) {
            $streamObjectNumber = $nextObjectNumber++;
            $annotObjectNumbers = [];

            foreach ($payload['annots'] as $unused) {
                $annotObjectNumbers[] = $nextObjectNumber++;
            }

            $pageObjectNumber = $nextObjectNumber++;
            $pageAllocations[] = [
                'payload' => $payload,
                'streamObjectNumber' => $streamObjectNumber,
                'annotObjectNumbers' => $annotObjectNumbers,
                'pageObjectNumber' => $pageObjectNumber,
            ];
        }

        $pageObjectNumbers = array_map(
            fn (array $allocation): int => $allocation['pageObjectNumber'],
            $pageAllocations,
        );
        $lastObjectNumber = $nextObjectNumber - 1;

        $addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
        $addObject(
            2,
            '<< /Type /Pages /Kids ['.implode(' ', array_map(fn (int $n): string => "{$n} 0 R", $pageObjectNumbers)).'] /Count '.count($pagePayloads).' >>',
        );
        $addObject(
            $fontObjects[self::FONT_SANS_BOLD],
            '<< /Type /Font /Subtype /Type1 /BaseFont /'.($serif ? 'Times-Bold' : 'Helvetica-Bold').' /Encoding /WinAnsiEncoding >>',
        );
        $addObject(
            $fontObjects[self::FONT_SANS],
            '<< /Type /Font /Subtype /Type1 /BaseFont /'.($serif ? 'Times-Roman' : 'Helvetica').' /Encoding /WinAnsiEncoding >>',
        );
        $addObject(
            $fontObjects[self::FONT_BODY],
            '<< /Type /Font /Subtype /Type1 /BaseFont /'.($serif ? 'Times-Roman' : 'Helvetica').' /Encoding /WinAnsiEncoding >>',
        );

        foreach ($pageAllocations as $allocation) {
            $payload = $allocation['payload'];
            $content = $payload['content'];
            $streamObjectNumber = $allocation['streamObjectNumber'];
            $annotObjectNumbers = $allocation['annotObjectNumbers'];
            $pageObjectNumber = $allocation['pageObjectNumber'];

            $addObject(
                $streamObjectNumber,
                '<< /Length '.strlen($content)." >>\nstream\n{$content}\nendstream",
            );

            foreach ($payload['annots'] as $annotIndex => $annot) {
                [$llx, $lly, $urx, $ury] = $annot['rect'];
                $rect = implode(' ', array_map(
                    fn (float $value): string => number_format($value, 2, '.', ''),
                    [$llx, $lly, $urx, $ury],
                ));
                $addObject(
                    $annotObjectNumbers[$annotIndex],
                    '<< /Type /Annot /Subtype /Link /Rect ['.$rect.'] /Border [0 0 0] /A << /S /URI /URI ('.$this->escapePdfString($annot['uri']).') >> >>',
                );
            }

            $annotsRef = $annotObjectNumbers !== []
                ? ' /Annots ['.implode(' ', array_map(fn (int $n): string => "{$n} 0 R", $annotObjectNumbers)).']'
                : '';

            $addObject(
                $pageObjectNumber,
                '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '.self::PDF_WIDTH.' '.self::PDF_HEIGHT.'] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents '.$streamObjectNumber.' 0 R'.$annotsRef.' >>',
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
        $pdfBody .= "trailer\n<< /Size ".($lastObjectNumber + 1).' /Root 1 0 R /Info << /CoverLetterDesign ('.$this->escapePdfString($resolved['cover_letter_design']).') /CoverLetterFont ('.$this->escapePdfString($resolved['cover_letter_font']).") >> >>\nstartxref\n{$xrefOffset}\n%%EOF\n";

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
