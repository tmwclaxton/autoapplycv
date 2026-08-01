<?php

namespace Tests\Unit;

use App\Support\BlogTldrPlacement;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class BlogTldrPlacementTest extends TestCase
{
    #[Test]
    public function it_moves_tldr_before_faq(): void
    {
        $markdown = <<<'MD'
## Intro

Body one.

## TL;DR

1. Step one
2. Step two

## Deep dive

Body two.

## FAQ

### Q?

A.

## Get started

CTA.
MD;

        $result = BlogTldrPlacement::moveNearBottom($markdown);

        $this->assertMatchesRegularExpression(
            '/## Deep dive.*## TL;DR.*## FAQ.*## Get started/s',
            $result,
        );
        $this->assertDoesNotMatchRegularExpression(
            '/## TL;DR.*## Intro/s',
            $result,
        );
        $this->assertTrue(BlogTldrPlacement::isNearBottom($result));
        $this->assertFalse(BlogTldrPlacement::isNearBottom($markdown));
    }

    #[Test]
    public function it_is_idempotent_when_already_near_bottom(): void
    {
        $markdown = <<<'MD'
## Intro

Body.

## TL;DR

1. Done

## FAQ

### Q?

A.
MD;

        $once = BlogTldrPlacement::moveNearBottom($markdown);
        $twice = BlogTldrPlacement::moveNearBottom($once);

        $this->assertSame(trim($once), trim($twice));
        $this->assertTrue(BlogTldrPlacement::isNearBottom($markdown));
    }

    #[Test]
    public function it_leaves_bodies_without_tldr_unchanged(): void
    {
        $markdown = "## Intro\n\nNo summary here.\n\n## FAQ\n\n### Q?\n\nA.\n";

        $this->assertSame($markdown, BlogTldrPlacement::moveNearBottom($markdown));
        $this->assertTrue(BlogTldrPlacement::isNearBottom($markdown));
    }

    #[Test]
    public function it_places_tldr_before_get_started_when_faq_missing(): void
    {
        $markdown = <<<'MD'
## TL;DR

1. Step

## Body

Text.

## Get started

CTA.
MD;

        $result = BlogTldrPlacement::moveNearBottom($markdown);

        $this->assertMatchesRegularExpression(
            '/## Body.*## TL;DR.*## Get started/s',
            $result,
        );
    }
}
