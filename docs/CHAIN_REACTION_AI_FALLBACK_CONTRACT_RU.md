# Chain Reaction — AI resilience / prepared fallback contract

This contract applies to future Chain Reaction clients, languages and platforms.

## 1. Availability hierarchy

Preferred source order:

1. valid live AI prediction;
2. prepared deterministic forecast;
3. never a dead-end error-only modal.

## 2. Immediate player feedback

A prepared forecast must be renderable synchronously from local/static data.

Do not show an empty spinner as the only useful content.

## 3. Prepared forecast schema

Minimum:

    summary
    immediate[]
    later[]
    risks[]
    surprise
    ideas[]

Prepared forecasts should be qualitative and avoid invented exact future numbers.

## 4. Prepared ideas

Every action should have logical successor ideas independent of AI.

AI may later re-rank or explain them, but deck continuity and fallback ideas cannot depend on a provider.

## 5. Source labels

UI must expose provenance:

    LIVE AI
    PREPARED FORECAST
    PREPARED FALLBACK

This lets the player understand whether the text is generated or authored.

## 6. AI failure classes covered

Fallback must activate for:

- provider unavailable;
- server unreachable;
- timeout;
- invalid response;
- locale unsupported;
- response in wrong language;
- quota/rate limit;
- parse failure;
- safety rejection if no usable prediction is returned.

## 7. Continue-play rule

If prepared data exists, AI failure must not disable the positive confirmation button.

Retry AI is optional and non-blocking.

## 8. Safety / authority

Neither live AI nor fallback directly changes authoritative world state.

Only explicit player confirmation may execute the action.

## 9. Testing

Every release must test at least:

- live AI success;
- forced network failure;
- forced timeout;
- wrong-locale response;
- prepared fallback appears;
- prepared ideas appear;
- YES enabled in fallback;
- NO still causes zero mutations;
- YES causes exactly one primary mutation;
- stale delayed AI response cannot overwrite a newer modal.

## 10. Content ownership

Prepared forecasts are game design assets and should live in a reusable data source, not be scattered through UI event handlers.

Current English source of truth:

`data/chain-reaction-prepared-fallback-en.json`

Future localized files should use the same keys/schema.
