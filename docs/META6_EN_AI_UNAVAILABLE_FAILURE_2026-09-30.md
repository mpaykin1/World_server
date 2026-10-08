# Meta6 EN — failure: live AI unavailable created a dead-end

**Date:** 30 September 2026  
**Affected build:** English Meta6  
**User evidence:** physical iPhone screenshot  
**Symptom:** forecast modal displayed `AI ERROR · English AI locale is not active yet`; `Yes, change the world` was disabled.

## What failed

The English client treated live AI as a required dependency.

Old failure path:

    choose action
    -> choose world position
    -> live AI request
    -> AI unavailable / English locale unavailable / timeout
    -> error screen
    -> YES disabled
    -> player cannot continue

This is a gameplay architecture failure.

A network/provider/localization outage must not stop a single-player world-building loop.

## User requirement after the failure

If live AI cannot be used, the game must show:

1. a **prepared forecast**;
2. **prepared development ideas**;
3. a clearly labelled fallback state;
4. an enabled YES path so gameplay continues;
5. an optional Retry Live AI action.

The fallback must never pretend to be live AI.

## New canonical resilience model

    prepared forecast is always available
    +
    live AI is an enhancement

New flow:

    choose action
    -> choose position
    -> immediately show prepared forecast + prepared ideas
    -> YES is already available
    -> request live AI in parallel
       -> success: replace prepared text with LIVE AI prediction
       -> failure: keep prepared forecast, show PREPARED FALLBACK, allow Retry
    -> YES continues the game in either case

This removes AI as a single point of failure.

## Implementation

English Meta6 now contains 25 prepared forecasts — one for every current action:

- city
- forest
- volcano
- energy
- idea
- water
- mountain
- farm
- road
- school
- market
- rain
- workshop
- medicine
- wind
- bridge
- night
- sun
- river
- home
- garden
- tower
- cloud
- fire
- community

Each prepared entry includes:

- summary;
- immediate consequences;
- later possibilities;
- risks;
- one unexpected chain.

Prepared development ideas reuse the deterministic logical successor map and show the first three relevant next actions.

The reusable data is stored in World Server:

`data/chain-reaction-prepared-fallback-en.json`

## UI rules

When live AI is being attempted:

    PREPARED FORECAST · checking live AI…

When live AI fails:

    PREPARED FALLBACK · live AI unavailable · safe to continue

The player sees:

    Prepared Development Ideas:
    • glyph + action
    • glyph + action
    • glyph + action

YES remains enabled.

Retry is labelled:

    Retry Live AI

## Truthfulness rule

Never label prepared content as AI.

Allowed labels:
- LIVE AI
- PREPARED FORECAST
- PREPARED FALLBACK

Forbidden:
- showing prepared text under a provider name;
- inventing an AI response after timeout;
- silently switching sources.

## Latency rule

Do not make the player wait through a long blank modal.

Prepared content is shown immediately.

Live AI gets a bounded background attempt; current client timeout is 7 seconds.

If it succeeds, it upgrades the forecast.
If it fails, the game remains fully playable.

## Race-condition rule

The live request has a request id.

If the player presses YES/NO or opens another forecast before the request returns, the stale response must not overwrite the new/closed modal.

This avoids a delayed live response corrupting UI state after fallback was already used.

## Mutation invariant

Prepared fallback changes only the source of forecast text.

It does **not** change the core safety rule:

    before YES -> 0 world mutations
    NO -> 0 world mutations
    YES -> exactly one primary action

AI and fallback both remain advisory.

## Main lesson

The correct architecture is not:

    AI works -> game works

It is:

    game always works
    + AI makes it richer when available

Live AI is an optional intelligence layer, not an availability dependency.
