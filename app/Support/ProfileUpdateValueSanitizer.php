<?php

namespace App\Support;

class ProfileUpdateValueSanitizer
{
    /**
     * @var array<int, string>
     */
    private const CONVERSATIONAL_WORDS = [
        'where',
        'what',
        'why',
        'how',
        'when',
        'who',
        'which',
        'button',
        'apply',
        'extension',
        'dashboard',
        'sidebar',
        'chat',
        'reply',
        'message',
        'missing',
        'visible',
        'see',
        'find',
        'help',
        'please',
        'testing',
        'test',
        'random',
        'values',
    ];

    public static function cleanCapturedValue(string $value): string
    {
        $value = trim($value);
        $value = (string) preg_replace('/[.!?]+$/', '', $value);
        $value = (string) preg_replace('/\s+(?:though|too|also|as well|please|thanks|thank you)\s*$/iu', '', trim($value));
        $value = (string) preg_replace('/\s+(?:instead|rather)\s*$/iu', '', trim($value));
        $value = (string) preg_replace('/\s+based on (?:your|the|my)\s+(?:address|profile)\s*$/iu', '', trim($value));

        return trim($value);
    }

    public static function isMetaFieldReference(string $value): bool
    {
        $normalized = mb_strtolower(trim($value));

        if ($normalized === '') {
            return false;
        }

        return (bool) preg_match(
            '/^(?:the\s+)?(?:profile\s+)?fields?(?:\s+(?:though|too|also|as well|please))*$/iu',
            $normalized,
        );
    }

    public static function isConversationalOrQuestionMessage(string $message): bool
    {
        $message = trim($message);

        if ($message === '') {
            return true;
        }

        if (str_contains($message, '?')) {
            return true;
        }

        $normalized = mb_strtolower($message);

        if (preg_match('/^(?:where|what|why|how|when|who|which|can you|could you|do you|is there|are there|where\'s|what\'s)\b/iu', $normalized)) {
            return true;
        }

        if (preg_match('/\b(?:apply button|where is|where\'s|can\'t see|cannot see|not seeing|don\'t see|do not see|how do i|how to)\b/iu', $normalized)) {
            return true;
        }

        foreach (self::CONVERSATIONAL_WORDS as $word) {
            if (preg_match('/\b'.preg_quote($word, '/').'\b/iu', $normalized)) {
                return true;
            }
        }

        return false;
    }

    public static function looksLikeBareNameValue(string $message): bool
    {
        $message = trim($message);

        if ($message === '' || self::isConversationalOrQuestionMessage($message)) {
            return false;
        }

        if (! preg_match('/^[\p{L}\p{M}][\p{L}\p{M}\s\'\.-]{1,80}$/u', $message)) {
            return false;
        }

        $words = preg_split('/\s+/u', $message) ?: [];

        if (count($words) < 1 || count($words) > 4) {
            return false;
        }

        foreach ($words as $word) {
            if (preg_match('/\b(?:where|what|why|how|apply|button|extension|the|is|are|my|your|please|do|it|hte)\b/iu', $word)) {
                return false;
            }
        }

        return true;
    }

    public static function looksLikeProfileUpdateCommand(string $message): bool
    {
        $message = trim($message);

        if ($message === '') {
            return false;
        }

        if (self::isConversationalOrQuestionMessage($message)
            && ! preg_match('/\b(?:update|set|change)\b.+\b(?:to|as)\s+\S/iu', $message)
            && ! preg_match('/\bno\s*,?\s*i\s+meant\b/iu', $message)) {
            return false;
        }

        return (bool) preg_match(
            '/\b(?:update|set|change|clear|blank)\b|\bno\s*,?\s*i\s+meant\b|\bdo it\b|\b(?:please\s+)?apply(?:\s+(?:it|changes?|this|them|all|below))?\b|\b(?:address|street)\s+(?:blank|clear|empty)\b|\b(?:region|state|county)\s+(?!.*\?\s*$)\S/iu',
            $message,
        );
    }

    public static function shouldRejectDirectValue(string $field, string $value): bool
    {
        if (trim($value) === '') {
            return false;
        }

        if (self::isMetaFieldReference($value)) {
            return true;
        }

        $normalized = mb_strtolower(trim($value));

        if (in_array($normalized, ['though', 'too', 'also', 'as well', 'field', 'fields'], true)) {
            return true;
        }

        if ($field === 'location' && preg_match('/^field(?:\s+(?:though|too|also|as well))?$/iu', $normalized)) {
            return true;
        }

        if (self::isConversationalOrQuestionMessage($value)) {
            return true;
        }

        if (preg_match('/\b(?:apply button|random values|profile fields)\b/iu', $normalized)) {
            return true;
        }

        return false;
    }

    public static function isLocationFieldMetaRequest(string $message): bool
    {
        return (bool) preg_match(
            '/\b(?:update|set|change)\s+(?:my\s+)?location\s+field\s+(?:though|too|also|as well)\b/iu',
            trim($message),
        );
    }
}
