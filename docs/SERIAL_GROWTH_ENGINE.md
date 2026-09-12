# AKA Serial Growth Engine

## Purpose

The Serial Growth Engine turns real World_server worlds and capabilities into one continuing adventure series whose job is to attract players into the same playable worlds shown in the story.

The engine is not a generic video-idea generator. It preserves continuity, uses verified server reality, and makes every episode lead to a concrete player action.

## North star

After an episode, the viewer should think: **I want to enter that world now.**

A strong episode therefore combines:

1. a hook in the first seconds;
2. a hero with a concrete goal;
3. an obstacle;
4. one real World_server world or capability revealed as part of the story;
5. a choice or action meaningful to a player;
6. a cliffhanger;
7. a direct CTA to enter the same world;
8. 5-15 short-form cuts derived from the same episode.

## Hourly AKA cycle

Every hourly cycle uses the existing AKA/orchestration path rather than creating a second orchestration stack.

### 1. Capability Architect

Inspect the current repository, playable worlds, new capabilities, regressions, blockers and previous episode state. Choose one real item with the highest expected player-acquisition value.

### 2. Story Architect

Turn that item into the next event in the existing story. Do not reset the universe for a convenient clip. Reuse unresolved mysteries, consequences and recurring characters when they improve the episode.

### 3. Builder

When the episode promise needs a server/world change, implement the smallest bounded change that makes the promised player experience real. Planned or unavailable features may not be presented as already playable.

### 4. Fleet QA + Live Verification

Verify the exact world/capability and the action promised by the episode. Record evidence. Reject unsupported claims.

### 5. Growth Editor

Prepare the episode brief, hook, cliffhanger, CTA and 5-15 Shorts/Reels/TikTok cut ideas. The content should sell participation and curiosity rather than list technical features.

### 6. Continuity Keeper

Persist the result to `data/serial-growth-state.json`: consequences, mysteries, used hooks, visited worlds, player decisions and the seed for the next episode.

## Required episode artifact

When `currentEpisode` is populated, it must contain at minimum:

- `number`
- `hook`
- `heroGoal`
- `obstacle`
- `worldOrCapability`
- `cliffhanger`
- `enterWorldCTA`
- `shortIdeas` with 5-15 items
- `evidence.verified = true`

The validation command is:

```bash
node scripts/validate-serial-growth.mjs
```

A failed validator blocks the episode from being treated as ready.

## Truth and safety gates

- Never invent a server capability to make a better story.
- Never say a planned feature is live.
- Never use a testing link as proof by itself; verify the exact promised behavior.
- A user-facing testing link for this workflow must not be surfaced until the user-noticeability gate is at least 85%.
- A failed build, failed live check, missing world or unsupported claim is a blocker to fix, not an episode-ready state.

## Growth loop

`episode -> curiosity -> world reveal -> enter-world CTA -> player action -> player consequence -> next episode`

The best episodes let real players influence later episodes safely. This turns viewers into participants and gives the series a reason to continue beyond ordinary feature videos.

## Files

- `.ai/aka-serial-growth-engine.json` — machine-readable AKA contract.
- `data/serial-growth-state.json` — persistent series continuity and metrics.
- `scripts/validate-serial-growth.mjs` — hard validation gates.
- `docs/SERIAL_GROWTH_ENGINE.md` — this specification.
