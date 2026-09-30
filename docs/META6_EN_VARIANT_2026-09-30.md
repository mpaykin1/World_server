# Meta6 EN — separate English version

**Date:** 30 September 2026  
**Status:** separate English variant; Russian Meta6 remains untouched  
**English page:** https://mpaykin1.github.io/meta6/en/  
**Russian baseline:** https://mpaykin1.github.io/meta6/  
**English page commit:** `aeb25223a2922f9eb762bf75ad607f413b2b30c7`

## Preservation rule

The existing Russian Meta6 root page is intentionally unchanged.

Verified root content SHA remained:

`e87a643c330054125ad8ef11939ec99e89484eff`

The English version lives only at:

`meta6/en/index.html`

This avoids risking the working Russian MVP.

## What is translated

The English variant translates:

- page title and accessibility labels;
- HUD;
- statistics;
- report UI;
- action names;
- chapters;
- interaction labels;
- action-selection messages;
- AI loading/error UI;
- forecast headings;
- local report;
- relation labels;
- successor messages.

The glyph system remains unchanged.

## Live AI language

The English client sends:

    mode: predict_action
    language: en

World Server adds an optional English lane while preserving Russian as the default for clients that omit `language`.

The English server lane uses:

- a dedicated English prediction prompt;
- an English qualitative normalizer;
- the same provider/fallback routing;
- the same `executed:false` safety contract.

The Russian Meta5/Meta6 behavior remains unchanged because the default stays `ru`.

## No accidental Russian fallback in the EN UI

The English client requires:

    data.language === "en"

If the production backend has not yet activated the English locale, the client shows an English retry/error state rather than displaying a Russian AI response.

This prevents mixed-language UX during deployment.

## Static verification

The English page was checked for:

- valid JavaScript syntax;
- `<html lang="en">`;
- `language:'en'` in the AI request;
- no remaining Cyrillic UI strings;
- English relation labels;
- continuous per-slot action deck;
- separate `Meta6EnDebug` test surface.

## English AI server tests

World Server tests cover:

1. explicit English `predict_action`;
2. English prompt selection;
3. English response normalization;
4. `language:"en"` in response;
5. Russian remaining the default when language is omitted.

## Invariants unchanged from Meta6

The English variant preserves:

- fixed viewport;
- pan/pinch;
- exact world-space placement;
- five live action slots;
- logical successor replacement;
- procedural graphical objects;
- small glyph labels;
- visible relation engine;
- viewport-local report;
- live AI prediction-only gate;
- NO = zero mutation;
- YES = one primary object.

The English version is localization, not a gameplay fork.
