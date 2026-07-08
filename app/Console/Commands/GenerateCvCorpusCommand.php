<?php

namespace App\Console\Commands;

use App\Support\CvCorpusManifest;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use PhpOffice\PhpWord\IOFactory;
use PhpOffice\PhpWord\PhpWord;

class GenerateCvCorpusCommand extends Command
{
    protected $signature = 'cv:corpus-generate';

    protected $description = 'Generate synthetic CV corpus files (txt, docx, scanned images)';

    public function handle(): int
    {
        $root = CvCorpusManifest::corpusRoot();
        File::ensureDirectoryExists($root.'/txt');
        File::ensureDirectoryExists($root.'/pdf');
        File::ensureDirectoryExists($root.'/docx');
        File::ensureDirectoryExists($root.'/png');
        File::ensureDirectoryExists($root.'/jpg');

        $this->writeText($root.'/txt/synthetic-uk-engineer.txt', $this->ukEngineerText());
        $this->writeText($root.'/txt/synthetic-us-designer.txt', $this->usDesignerText());
        $this->writeText($root.'/txt/synthetic-marketing.txt', $this->marketingText());
        $this->writeText($root.'/txt/synthetic-teaching.txt', $this->teachingText());
        $this->writeText($root.'/txt/synthetic-legal.txt', $this->legalText());
        $this->writeText($root.'/txt/synthetic-operations.txt', $this->operationsText());

        $this->writeDocx($root.'/docx/synthetic-healthcare.docx', $this->healthcareDocx());
        $this->writeDocx($root.'/docx/synthetic-finance.docx', $this->financeDocx());
        $this->writeDocx($root.'/docx/synthetic-academic.docx', $this->academicDocx());
        $this->writeDocx($root.'/docx/synthetic-sales.docx', $this->salesDocx());
        $this->writeDocx($root.'/docx/synthetic-retail.docx', $this->retailDocx());

        $this->renderPdfFromText($root.'/txt/synthetic-uk-engineer.txt', $root.'/pdf/synthetic-uk-engineer.pdf');

        $this->renderScan($root.'/pdf/awesome-cv-latex.pdf', $root.'/png/scan-awesome-cv.png');
        $this->renderScan($root.'/pdf/jake-style-latex.pdf', $root.'/png/scan-jake-style.png');
        $this->renderScan(
            CvCorpusManifest::resolvePath('../cv/toby-claxton-cv.pdf'),
            $root.'/jpg/scan-toby-claxton.jpg',
            300,
        );

        $this->info('Generated synthetic CV corpus files.');

        return self::SUCCESS;
    }

    private function writeText(string $path, string $contents): void
    {
        file_put_contents($path, $contents);
        $this->line('  txt  '.basename($path));
    }

    /**
     * @param  callable(PhpWord): void  $builder
     */
    private function writeDocx(string $path, callable $builder): void
    {
        $phpWord = new PhpWord;
        $builder($phpWord);
        $writer = IOFactory::createWriter($phpWord, 'Word2007');
        $writer->save($path);
        $this->line('  docx '.basename($path));
    }

    private function renderPdfFromText(string $txtPath, string $pdfPath): void
    {
        $docxPath = preg_replace('/\.pdf$/', '.docx', $pdfPath);
        $lines = file($txtPath, FILE_IGNORE_NEW_LINES) ?: [];

        $this->writeDocx($docxPath, function (PhpWord $phpWord) use ($lines): void {
            $section = $phpWord->addSection();

            foreach ($lines as $line) {
                $section->addText($line === '' ? ' ' : $line);
            }
        });

        $result = Process::timeout(90)->run([
            'soffice',
            '--headless',
            '--convert-to',
            'pdf',
            '--outdir',
            dirname($pdfPath),
            $docxPath,
        ]);

        $generated = dirname($pdfPath).'/'.pathinfo($docxPath, PATHINFO_FILENAME).'.pdf';

        if ($result->successful() && is_readable($generated)) {
            if ($generated !== $pdfPath) {
                rename($generated, $pdfPath);
            }

            @unlink($docxPath);
            $this->line('  pdf  '.basename($pdfPath));

            return;
        }

        $this->warn('  pdf conversion failed for '.basename($txtPath).': '.$result->errorOutput());
    }

    private function renderScan(string $pdfPath, string $imagePath, int $dpi = 200): void
    {
        if (! is_readable($pdfPath)) {
            $this->warn('  skip scan (missing pdf): '.basename($pdfPath));

            return;
        }

        $prefix = dirname($imagePath).'/'.pathinfo($imagePath, PATHINFO_FILENAME);
        $extension = strtolower(pathinfo($imagePath, PATHINFO_EXTENSION));
        $format = $extension === 'jpg' ? 'jpeg' : $extension;

        $result = Process::timeout(60)->run([
            'pdftoppm',
            '-singlefile',
            '-f',
            '1',
            '-l',
            '1',
            '-'.$format,
            '-r',
            (string) $dpi,
            $pdfPath,
            $prefix,
        ]);

        if (! $result->successful() || ! is_readable($imagePath)) {
            $this->warn('  scan failed for '.basename($pdfPath).': '.$result->errorOutput());

            return;
        }

        $this->line('  '.$extension.'  '.basename($imagePath));
    }

    private function ukEngineerText(): string
    {
        return <<<'TEXT'
Amelia Hartley
Senior Backend Engineer | London, UK
amelia.hartley@example.co.uk | +44 7700 900456 | linkedin.com/in/ameliahartley

Summary
Backend engineer with 8 years building payments and workflow platforms in Laravel and AWS.

Experience
TechForge Ltd, London - Senior Backend Engineer (2021 - Present)
- Led migration of monolith billing module to event-driven services.
- Reduced p95 API latency by 42% through query tuning and Redis caching.
- Technologies: PHP, Laravel, PostgreSQL, Redis, Kafka.

Northline Systems, Manchester - Software Engineer (2017 - 2021)
- Built internal CRM integrations and reporting pipelines.
- Introduced PHPUnit coverage gates in CI.

Education
MSc Software Engineering, University of Manchester, 2017, Distinction
BSc Computer Science, University of Leeds, 2015, 2:1

Skills
PHP, Laravel, PostgreSQL, Redis, AWS, Docker, Kafka, TDD

Certifications
AWS Solutions Architect Associate, 2023
TEXT;
    }

    private function usDesignerText(): string
    {
        return <<<'TEXT'
Jordan Lee
Product Designer
jordan.lee.design@example.com | (415) 555-0182 | San Francisco, CA
Portfolio: jordanlee.design

Summary
Product designer focused on B2B SaaS onboarding, design systems, and accessibility.

Experience
Brightline Apps - Lead Product Designer, 2020 to Present
- Redesigned onboarding funnel and improved trial activation by 28%.
- Built Figma component library adopted by 4 product squads.

Studio North - UX Designer, 2016 to 2020
- Ran usability studies for mobile banking flows.
- Partnered with engineering on React component specs.

Education
BFA Interaction Design, California College of the Arts, 2016

Skills
Figma, FigJam, UX research, prototyping, design systems, accessibility, HTML, CSS
TEXT;
    }

    private function healthcareDocx(): callable
    {
        return function (PhpWord $phpWord): void {
            $section = $phpWord->addSection();
            $section->addTitle('Dr Priya Nair', 1);
            $section->addText('Consultant Paediatrician | Birmingham, UK');
            $section->addText('priya.nair@nhs.example.nhs.uk | +44 121 555 0101');
            $section->addTextBreak();
            $section->addTitle('Experience', 2);
            $section->addText('Birmingham Children\'s Hospital - Consultant Paediatrician (2018 - Present)');
            $section->addText('Led regional allergy clinic and trainee teaching programme.');
            $section->addText('City General Hospital - Specialist Registrar (2012 - 2018)');
            $section->addTextBreak();
            $section->addTitle('Education', 2);
            $section->addText('MRCPCH, Royal College of Paediatrics and Child Health, 2014');
            $section->addText('MBBS, University of Birmingham, 2010');
            $section->addTextBreak();
            $section->addTitle('Skills', 2);
            $section->addText('Paediatrics, allergy, clinical governance, teaching, audit, EMIS');
        };
    }

    private function financeDocx(): callable
    {
        return function (PhpWord $phpWord): void {
            $section = $phpWord->addSection();
            $section->addTitle('Marcus Chen', 1);
            $section->addText('Financial Analyst | New York, NY');
            $section->addText('marcus.chen@example.com | +1 212 555 0144');
            $section->addTextBreak();
            $section->addTitle('Experience', 2);
            $section->addText('Harbor Capital - Senior Financial Analyst (2019 - Present)');
            $section->addText('Built quarterly forecasting models for $2.1B AUM portfolio.');
            $section->addText('Lexington Partners - Analyst (2016 - 2019)');
            $section->addTextBreak();
            $section->addTitle('Education', 2);
            $section->addText('MBA Finance, NYU Stern, 2016');
            $section->addText('BSc Economics, Boston University, 2014');
            $section->addTextBreak();
            $section->addTitle('Skills', 2);
            $section->addText('Excel, SQL, Python, financial modelling, valuation, Power BI');
        };
    }

    private function academicDocx(): callable
    {
        return function (PhpWord $phpWord): void {
            $section = $phpWord->addSection();
            $section->addTitle('Prof. Elena Vasquez', 1);
            $section->addText('Associate Professor of Computational Biology');
            $section->addText('e.vasquez@university.example.edu | Cambridge, UK');
            $section->addTextBreak();
            $section->addTitle('Experience', 2);
            $section->addText('University of Cambridge - Associate Professor (2017 - Present)');
            $section->addText('Principal investigator on EPSRC grant for single-cell RNA workflows.');
            $section->addText('EMBL-EBI - Postdoctoral Researcher (2014 - 2017)');
            $section->addTextBreak();
            $section->addTitle('Education', 2);
            $section->addText('PhD Computational Biology, ETH Zurich, 2014');
            $section->addText('MSc Bioinformatics, Imperial College London, 2010');
            $section->addText('BSc Biology, University of Barcelona, 2008');
            $section->addTextBreak();
            $section->addTitle('Publications', 2);
            $section->addText('Vasquez E. et al. Nature Methods, 2022');
            $section->addTextBreak();
            $section->addTitle('Skills', 2);
            $section->addText('R, Python, genomics, machine learning, teaching, grant writing');
        };
    }

    private function marketingText(): string
    {
        return <<<'TEXT'
Sofia Alvarez
Growth Marketing Manager | Austin, TX
sofia.alvarez@example.com | +1 512 555 0199

Summary
B2B SaaS marketer with 7 years running paid search, lifecycle email, and product launch campaigns.

Experience
Launchpad CRM - Growth Marketing Manager, 2021 to Present
- Increased qualified demo requests by 36% through paid search and landing page experiments.
- Built lifecycle journeys in HubSpot for trial onboarding.

Bright Metrics - Marketing Specialist, 2018 to 2021

Education
BA Marketing, University of Texas at Austin, 2018

Skills
HubSpot, Google Ads, SEO, analytics, copywriting, A/B testing, SQL
TEXT;
    }

    private function teachingText(): string
    {
        return <<<'TEXT'
Thomas Wright
Secondary Science Teacher | Leeds, UK
thomas.wright@school.example.org | +44 113 555 0177

Summary
Qualified science teacher with QTS and experience teaching GCSE and A-Level chemistry.

Experience
Meadowbank Academy, Leeds - Teacher of Science (2019 - Present)
- Raised GCSE chemistry attainment from 62% to 78% within two years.
- Science curriculum lead for Key Stage 4.

Riverside High School - Trainee Teacher (2018 - 2019)

Education
PGCE Secondary Science, University of Leeds, 2019
BSc Chemistry, University of York, 2018

Skills
Lesson planning, behaviour management, practical demonstrations, safeguarding, STEM clubs
TEXT;
    }

    private function legalText(): string
    {
        return <<<'TEXT'
Hannah Brooks
Commercial Solicitor | London, UK
hannah.brooks@law.example.com | +44 20 7946 0958

Summary
Commercial solicitor specialising in technology contracts, SaaS agreements, and data protection.

Experience
Carter & Lane LLP - Associate Solicitor (2020 - Present)
- Advised SaaS clients on enterprise MSAs and GDPR compliance programmes.
- Led due diligence workstreams on mid-market acquisitions.

Graystone Legal - Trainee Solicitor (2018 - 2020)

Education
LPC, BPP University, 2018
LLB Law, University of Bristol, 2017

Skills
Contract negotiation, GDPR, due diligence, client management, legal research
TEXT;
    }

    private function operationsText(): string
    {
        return <<<'TEXT'
Daniel Okonkwo
Operations Manager | Dublin, Ireland
daniel.okonkwo@example.ie | +353 1 555 0144

Summary
Operations manager with 9 years improving fulfilment, vendor management, and process automation.

Experience
ParcelPro Logistics - Operations Manager (2019 - Present)
- Reduced order fulfilment SLA breaches by 31% through warehouse process redesign.
- Managed team of 18 across inbound, picking, and returns.

FreshRoute Foods - Operations Supervisor (2015 - 2019)

Education
BSc Business Management, Dublin City University, 2015

Skills
Lean, vendor management, Excel, SQL, process mapping, team leadership
TEXT;
    }

    private function salesDocx(): callable
    {
        return function (PhpWord $phpWord): void {
            $section = $phpWord->addSection();
            $section->addTitle('Rachel Gomez', 1);
            $section->addText('Enterprise Account Executive | Chicago, IL');
            $section->addText('rachel.gomez@example.com | +1 312 555 0166');
            $section->addTextBreak();
            $section->addTitle('Experience', 2);
            $section->addText('Cloudline Software - Enterprise AE (2020 - Present)');
            $section->addText('Closed $4.2M ARR across manufacturing and logistics accounts.');
            $section->addText('DataCore Systems - Sales Development Rep (2018 - 2020)');
            $section->addTextBreak();
            $section->addTitle('Education', 2);
            $section->addText('BBA Sales and Marketing, University of Illinois, 2018');
            $section->addTextBreak();
            $section->addTitle('Skills', 2);
            $section->addText('Enterprise sales, discovery, Salesforce, negotiation, MEDDPICC');
        };
    }

    private function retailDocx(): callable
    {
        return function (PhpWord $phpWord): void {
            $section = $phpWord->addSection();
            $section->addTitle('Nina Patel', 1);
            $section->addText('Store Manager | Bristol, UK');
            $section->addText('nina.patel@example.co.uk | +44 117 555 0133');
            $section->addTextBreak();
            $section->addTitle('Experience', 2);
            $section->addText('Riverstone Retail - Store Manager (2019 - Present)');
            $section->addText('Increased like-for-like sales by 14% and reduced staff turnover by 22%.');
            $section->addText('City Threads - Assistant Manager (2016 - 2019)');
            $section->addTextBreak();
            $section->addTitle('Education', 2);
            $section->addText('NVQ Level 3 Retail Management, City of Bristol College, 2016');
            $section->addTextBreak();
            $section->addTitle('Skills', 2);
            $section->addText('Team leadership, stock management, visual merchandising, scheduling, KPI tracking');
        };
    }
}
