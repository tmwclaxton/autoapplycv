# Answer format guardrails curation

Persona: `senior_laravel_dev` (James Mitchell, Bristol, Laravel/Vue/PostgreSQL).

## Source of truth

Hand-authored / curated static JSON:

- `scripts/extension-benchmark/answer-format-guardrails/scenarios/*.json` (shards)
- Merged file: `scripts/extension-benchmark/answer-format-guardrails-scenarios.json`

Scripts may **merge, validate, audit, or score** only. Do not invent question text with template loops.

## Review standard

- Realistic UK/US ATS or job-board wording
- Clear `answer_shape` and `brevity`
- `ideal_answer` / notes grounded in the persona (reference meaning, not exact-match)
- Honest `No` / `0` when the persona lacks evidence
- No duplicate labels, no filler variants
