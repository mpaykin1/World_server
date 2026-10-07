# Meta6 — success overall, failure: English live AI was not active

**Date:** 30 September 2026  
**User verdict:** Meta6 works successfully overall; one failure remained in the English version  
**Russian version:** https://mpaykin1.github.io/meta6/  
**English version:** https://mpaykin1.github.io/meta6/en/

## 1. What the user confirmed as success

The current Meta6 direction is successful overall.

Preserve:
- mobile pan and pinch;
- fixed game viewport;
- glyph action UI;
- graphical animated objects;
- small glyph above each object;
- visible object-to-object relations;
- continuous five-slot action deck;
- logical successor replacement;
- local report;
- prepared fallback when AI is unavailable;
- Russian live AI path.

These are proven strengths and must not be rewritten while fixing the English AI issue.

## 2. The one confirmed failure

The Russian build receives live AI forecasts.

The English build did not.

The English client showed fallback/error behavior instead of a live provider response.

This was not a Meta6 graphics/input/relation failure. It was a backend deployment/version-parity failure.

## 3. Root cause — confirmed

The English client correctly sent:

    mode: predict_action
    language: en

and intentionally required:

    data.language === "en"

However, production World Server was still running backend logic from `master` that did **not** contain English locale support.

At diagnosis time:

- PR #382 containing English AI locale support was still **open**;
- `master/chain-ai-interpreter.mjs` did not contain `ACTION_PREDICTION_PROMPT_EN`;
- master did not read `body.language === "en"`;
- master did not contain `normalizePredictionEn`;
- Russian requests continued to work because Russian remained the only supported/default prediction language.

Therefore the asymmetry was expected:

    Russian client
    -> existing production backend contract
    -> live AI works

    English client
    -> requests language=en
    -> production backend has no English locale contract
    -> client rejects non-English/no-language response
    -> prepared fallback

## 4. Why PR #382 was not enough

PR #382 itself had successful CI checks, but it remained unmerged.

An attempted manual merge was blocked by protected-branch rules reporting required checks as expected against the current branch state.

The important lesson:

> A green historical PR is not proof that production contains the feature.

For a backend feature to be considered live:

    code exists
    -> current-master-compatible PR
    -> required checks
    -> merge to master
    -> production Worker deploy
    -> production endpoint smoke test
    -> client proof

## 5. Repair strategy

A fresh branch from current master was created:

`fix/meta6-en-live-ai-production`

The English locale change was reapplied on top of current master instead of forcing the stale PR.

The backend repair adds:

- `ACTION_PREDICTION_PROMPT_EN`;
- `normalizePredictionEn()`;
- explicit `language: "en"` handling for `predict_action`;
- response field `language`;
- Russian default preserved when language is omitted;
- tests for English and Russian prediction contracts.

## 6. Production deployment gap

A second process weakness was found: Cloudflare exact-head preview existed, but there was no dedicated production AI deployment workflow tied to the relevant master changes.

A new workflow is added:

`.github/workflows/cloudflare-production-ai.yml`

It triggers when relevant AI/Worker files land on `master`.

It:

1. checks out exact master SHA;
2. requires Cloudflare production credentials;
3. deploys the exact SHA to the production `world-server` Worker;
4. waits for exact-head activation;
5. verifies the production stack;
6. sends a real Russian `predict_action` request;
7. sends a real English `predict_action language=en` request;
8. requires both to return `executed:false`;
9. requires Russian response language `ru`;
10. requires English response language `en`.

This turns language parity into deployment evidence, not assumption.

## 7. New multilingual acceptance rule

If a public language variant exists, its live AI path is not considered implemented until the same production endpoint passes a real request in that language.

Required matrix:

| Client | Request | Required production response |
| --- | --- | --- |
| Russian | predict_action, language omitted | `language:"ru"`, live provider, `executed:false` |
| English | predict_action, `language:"en"` | `language:"en"`, live provider, `executed:false` |

Prepared fallback remains mandatory, but it must not be confused with successful live AI localization.

## 8. What must not be changed while fixing this

Do not modify the successful Russian Meta6 client merely to solve English AI.

Do not remove prepared fallback.

Do not loosen the English client's language check to accept Russian AI text.

Do not fake English output client-side and label it live AI.

Do not make AI authoritative.

The correct fix is server capability + production deployment parity.

## 9. Regression tests required for future languages

For every new locale:

- [ ] client sends explicit locale;
- [ ] server has locale-specific prompt;
- [ ] server normalizer accepts that locale;
- [ ] response echoes effective locale;
- [ ] fallback is localized;
- [ ] live production smoke succeeds;
- [ ] unsupported locale fails over safely;
- [ ] default locale remains backward-compatible;
- [ ] old language client still works;
- [ ] deployment workflow verifies both old and new locale.

## 10. Main lesson

The failure was not:

> English AI is impossible.

The failure was:

> the English client moved ahead of the production backend.

New rule:

**client locale + backend locale + production deployment must advance as one tested release unit.**
