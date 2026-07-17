# CV design variants

Preview gallery of **10 stylish CV layouts** for Auto Apply / profile CV generation.

## How production CVs work today

Auto Apply attaches the user's uploaded CV document (`GET_CV_DOCUMENT`). Test-persona and some generated PDFs use `CoverLetterPdfBuilder` with Helvetica and plain text from `CvFormattedTextBuilder` (profile fields: name, headline, summary, skills, experience, education).

These HTML previews use that same field shape so a chosen design can later be wired into HTML→PDF (or an upgraded PDF builder) without inventing a parallel content model.

## How to open

From the repo root:

```bash
# Option A - open the gallery in your browser (double-click or):
open docs/cv-design-variants/index.html

# Option B - tiny local server (helps if a browser blocks CDN fonts on file://)
npx --yes serve docs/cv-design-variants
```

Then open the printed URL (usually `http://localhost:3000`) and click a variant.

## Fonts

- **Clash Display** - headings / name (Fontshare / Indian Type Foundry)
- **Satoshi** - body text (Fontshare companion pair)

Loaded via Fontshare CSS API in `shared/fonts.css`. License: ITF Free Font License (personal and commercial use; confirm at [fontshare.com/fonts/clash-display](https://www.fontshare.com/fonts/clash-display) before shipping to production).

Regenerate HTML after editing `generate-variants.mjs`:

```bash
node docs/cv-design-variants/generate-variants.mjs
```

## Variants

- **01 Teal Masthead** (`01-teal-masthead.html`) - Full-width teal header band, white Clash name, clean single-column body.
- **02 Ink Sidebar** (`02-ink-sidebar.html`) - Dark charcoal left rail for contact and skills; light main column for experience.
- **03 Swiss Rules** (`03-swiss-rules.html`) - Ultra-minimal black/white with hairline rules and oversized Clash Display name.
- **04 Forest Rail** (`04-forest-rail.html`) - Deep green left accent rail, refined single column, muted sage chips.
- **05 Coral Timeline** (`05-coral-timeline.html`) - Vertical timeline experience with coral markers and warm charcoal type.
- **06 Asymmetric Split** (`06-asymmetric-split.html`) - Wide Clash name left, stacked contact right, then two-column skills/experience.
- **07 Slate Bands** (`07-slate-bands.html`) - Soft slate section bands (not cards), strong section labels in Clash Display.
- **08 Mono Bold** (`08-mono-bold.html`) - High-contrast black and white, mega Clash type, dense modern hierarchy.
- **09 Ocean Wash** (`09-ocean-wash.html`) - Cool blue header wash into white body, airy spacing, navy accents.
- **10 Geometric Mark** (`10-geometric-mark.html`) - Large Clash monogram mark, modern portfolio layout with accent underlines.

## Next step

Tell us which number (01-10) you prefer. That design will be wired into production CV generation - these previews are not live in Auto Apply yet.
