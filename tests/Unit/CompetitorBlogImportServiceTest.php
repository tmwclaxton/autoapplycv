<?php

namespace Tests\Unit;

use App\Services\CompetitorBlogImportService;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CompetitorBlogImportServiceTest extends TestCase
{
    #[Test]
    public function strip_competitor_brand_preserves_markdown_newlines(): void
    {
        $importer = app(CompetitorBlogImportService::class);

        $markdown = "## TL;DR\n\n1. Upload once\n\n## Next section\n\nLazyApply is mentioned here.";

        $cleaned = $importer->stripCompetitorBrand($markdown);

        $this->assertStringContainsString("## TL;DR\n\n1. Upload once\n\n## Next section\n\n", $cleaned);
        $this->assertStringContainsString('AutoCVApply is mentioned here.', $cleaned);
        $this->assertStringNotContainsString('LazyApply', $cleaned);
        $this->assertGreaterThanOrEqual(4, substr_count($cleaned, "\n"));
    }
}
