<?php

namespace Tests\Unit\Services;

use App\Services\ProfileDirectUpdateParser;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ProfileDirectUpdateParserTest extends TestCase
{
    private ProfileDirectUpdateParser $parser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->parser = app(ProfileDirectUpdateParser::class);
    }

    public function test_parses_comma_separated_profile_updates_without_to(): void
    {
        $updates = $this->parser->parse(
            'update my profile email alex@example.com, phone +44 7700 900123, headline Senior Laravel Developer, summary Backend engineer focused on APIs and queue workers., linkedin https://linkedin.com/in/example-user, postcode ex12 4ab, country united kingdom',
        );

        $fields = collect($updates)->pluck('field')->all();

        $this->assertSame(
            ['email', 'phone', 'headline', 'summary', 'linkedin_url', 'postcode', 'country'],
            $fields,
        );
        $this->assertSame('alex@example.com', collect($updates)->firstWhere('field', 'email')['value'] ?? null);
        $this->assertSame('+44 7700 900123', collect($updates)->firstWhere('field', 'phone')['value'] ?? null);
        $this->assertSame(
            'Backend engineer focused on APIs and queue workers',
            collect($updates)->firstWhere('field', 'summary')['value'] ?? null,
        );
    }

    public function test_parses_comma_separated_profile_updates_with_to(): void
    {
        $updates = $this->parser->parse(
            'update email to alex@example.com, phone to +44 7700 900123, and country to united kingdom',
        );

        $this->assertCount(3, $updates);
        $this->assertSame('alex@example.com', collect($updates)->firstWhere('field', 'email')['value'] ?? null);
        $this->assertSame('united kingdom', collect($updates)->firstWhere('field', 'country')['value'] ?? null);
    }

    #[DataProvider('nonCommandMessagesProvider')]
    public function test_does_not_parse_non_command_messages(string $message): void
    {
        $this->assertSame([], $this->parser->parse($message));
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function nonCommandMessagesProvider(): array
    {
        return [
            'question' => ['where is the apply button?'],
            'greeting' => ['hello there'],
            'empty' => [''],
        ];
    }
}
