<?php

namespace App\Console\Commands;

use App\Services\CvParserService;
use App\Support\CvCorpusFixtureFile;
use App\Support\CvCorpusManifest;
use App\Support\CvExtractionSchema;
use Illuminate\Console\Command;

class AnnotateCvCorpusCommand extends Command
{
    protected $signature = 'cv:corpus-annotate';

    protected $description = 'Build manifest expectations from mechanical CV text extraction';

    public function handle(CvParserService $parser): int
    {
        ini_set('memory_limit', '512M');

        $scenarios = [];

        foreach (CvCorpusManifest::catalog() as $entry) {
            $path = CvCorpusManifest::resolvePath($entry['file']);

            if (! is_readable($path)) {
                $this->warn("Skipping missing file: {$entry['id']} ({$entry['file']})");

                continue;
            }

            $file = CvCorpusFixtureFile::uploadedFile($path);

            $extracted = $parser->extractTextWithMetadata($file);
            $urls = str_ends_with(strtolower($path), '.pdf')
                ? $parser->extractHyperlinks($file)
                : [];
            $rawText = CvExtractionSchema::appendHyperlinksToRawText($extracted['text'], $urls);

            $scenarios[] = [
                'id' => $entry['id'],
                'file' => $entry['file'],
                'format' => $entry['format'],
                'group' => $entry['group'],
                'notes' => $entry['notes'],
                'license' => $entry['license'],
                'raw_chars' => mb_strlen($rawText),
                'ocr_used' => $extracted['ocr_used'],
                'expectations' => $this->applySyntheticOverrides(
                    (string) $entry['id'],
                    CvCorpusManifest::deriveExpectations($rawText, (string) $entry['format']),
                ),
            ];

            $this->line(sprintf(
                '  %-28s %5d chars  ocr=%s',
                $entry['id'],
                mb_strlen($rawText),
                $extracted['ocr_used'] ? 'yes' : 'no',
            ));
        }

        if ($scenarios === []) {
            $this->error('No corpus files found. Run: node scripts/cv-corpus/fetch-corpus.mjs');

            return self::FAILURE;
        }

        CvCorpusManifest::save([
            'version' => 1,
            'generated_at' => now()->toIso8601String(),
            'scenarios' => $scenarios,
        ]);

        $this->info('Wrote '.count($scenarios).' scenarios to '.CvCorpusManifest::manifestPath());

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $expectations
     * @return array<string, mixed>
     */
    private function applySyntheticOverrides(string $id, array $expectations): array
    {
        $mustAppear = match ($id) {
            'synthetic-uk-engineer-txt' => ['Amelia Hartley', 'Laravel'],
            'synthetic-us-designer-txt' => ['Jordan Lee', 'Figma'],
            'synthetic-marketing-txt' => ['Sofia Alvarez', 'HubSpot'],
            'synthetic-teaching-txt' => ['Thomas Wright', 'Chemistry'],
            'synthetic-legal-txt' => ['Hannah Brooks', 'Solicitor'],
            'synthetic-operations-txt' => ['Daniel Okonkwo', 'Operations'],
            'synthetic-healthcare-docx' => ['Priya Nair', 'Paediatrician'],
            'synthetic-finance-docx' => ['Marcus Chen', 'Financial Analyst'],
            'synthetic-academic-docx' => ['Elena Vasquez', 'Computational Biology'],
            'synthetic-sales-docx' => ['Rachel Gomez', 'Enterprise'],
            'synthetic-retail-docx' => ['Nina Patel', 'Store Manager'],
            'synthetic-uk-engineer-pdf' => ['Amelia Hartley', 'Laravel'],
            'scan-toby-jpg' => ['Toby Claxton'],
            default => [],
        };

        if ($mustAppear !== []) {
            $expectations['must_appear'] = $mustAppear;
        }

        if (str_starts_with($id, 'jobhire-')) {
            $expectations['min_skills'] = 0;
            $expectations['min_experience'] = 0;
            $expectations['emails_in_raw'] = [];
        }

        if ($id === 'scan-toby-jpg') {
            $expectations['min_raw_chars'] = 200;
            $expectations['min_experience'] = 1;
            $expectations['min_education'] = 1;
        }

        return $expectations;
    }
}
