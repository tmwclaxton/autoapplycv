<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MarketingPagesTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function publicPagesProvider(): array
    {
        return [
            'home' => ['home', 'Welcome'],
            'about' => ['about', 'About'],
            'how-to' => ['how-to', 'HowTo'],
            'pricing' => ['pricing', 'Pricing'],
            'analytics' => ['analytics', 'Analytics'],
            'contact' => ['contact', 'Contact'],
            'terms' => ['terms', 'Legal/Terms'],
            'privacy' => ['privacy', 'Legal/Privacy'],
            'blog' => ['blog.index', 'Blog/Index'],
        ];
    }

    #[DataProvider('publicPagesProvider')]
    public function test_marketing_pages_are_publicly_accessible(string $route, string $component): void
    {
        $this->get(route($route))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component($component));
    }
}
