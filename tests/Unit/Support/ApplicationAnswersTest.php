<?php

namespace Tests\Unit\Support;

use App\Support\ApplicationAnswers;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ApplicationAnswersTest extends TestCase
{
    #[Test]
    public function it_normalizes_and_drops_empty_entries(): void
    {
        $normalized = ApplicationAnswers::normalize([
            ['question' => ' Portfolio ', 'answer' => ' https://example.com '],
            ['question' => '', 'answer' => 'ignored'],
            ['question' => 'Hours per week', 'answer' => ''],
        ]);

        $this->assertCount(1, $normalized);
        $this->assertSame('Portfolio', $normalized[0]['question']);
        $this->assertSame('https://example.com', $normalized[0]['answer']);
        $this->assertNotSame('', $normalized[0]['id']);
    }

    #[Test]
    public function it_upserts_by_normalized_question(): void
    {
        $existing = ApplicationAnswers::normalize([
            ['id' => '11111111-1111-1111-1111-111111111111', 'question' => 'Department preference', 'answer' => 'Engineering'],
        ]);

        $updated = ApplicationAnswers::upsert($existing, 'department preference', 'Product');

        $this->assertCount(1, $updated);
        $this->assertSame('11111111-1111-1111-1111-111111111111', $updated[0]['id']);
        $this->assertSame('Product', $updated[0]['answer']);
    }

    #[Test]
    public function it_removes_entries_by_id(): void
    {
        $existing = ApplicationAnswers::normalize([
            ['id' => '11111111-1111-1111-1111-111111111111', 'question' => 'One', 'answer' => 'A'],
            ['id' => '22222222-2222-2222-2222-222222222222', 'question' => 'Two', 'answer' => 'B'],
        ]);

        $remaining = ApplicationAnswers::removeById($existing, '11111111-1111-1111-1111-111111111111');

        $this->assertCount(1, $remaining);
        $this->assertSame('Two', $remaining[0]['question']);
    }
}
