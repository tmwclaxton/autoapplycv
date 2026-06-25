<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AppearanceTest extends TestCase
{
    use RefreshDatabase;

    #[DataProvider('appearanceCookieProvider')]
    public function test_html_class_reflects_appearance_cookie(string $cookie, bool $expectsDarkClass): void
    {
        $response = $this->withUnencryptedCookie('appearance', $cookie)
            ->get(route('home'));

        $response->assertOk();

        if ($expectsDarkClass) {
            $response->assertSee('class="dark"', false);
        } else {
            $response->assertDontSee('class="dark"', false);
        }
    }

    /**
     * @return array<string, array{0: string, 1: bool}>
     */
    public static function appearanceCookieProvider(): array
    {
        return [
            'light mode' => ['light', false],
            'dark mode' => ['dark', true],
            'system mode' => ['system', false],
        ];
    }

    public function test_html_class_defaults_without_appearance_cookie(): void
    {
        $this->get(route('home'))
            ->assertOk()
            ->assertDontSee('class="dark"', false);
    }

    public function test_appearance_settings_page_is_accessible_when_authenticated(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get(route('appearance.edit'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('settings/Appearance'));
    }
}
