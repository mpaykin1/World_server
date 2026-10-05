# Illustration Office Worker — WAVE FAILURE memory

Date: 2026-10-01

## Human review result

The current `wave` animation is rejected.

Reason: the hand moves in the wrong direction for a natural stop-like waving gesture. The motion contradicts expected human gesture behavior.

This failure applies only to the `wave` action. The worker character, idle, walk and carry remain accepted.

## Current implementation

The current wave branch changes shoulder and elbow rotations:

```js
}else if(action==='wave'){
  rightArm.pivot.rotation.z=-1.42;
  rightArm.pivot.rotation.x=-.16;
  rightArm.elbow.rotation.z=-1.05+Math.sin(timeMs*.008)*.28;
  leftArm.pivot.rotation.z=.10;
}
```

The rig has no explicit wrist joint or palm-facing rule. The hand is only a simple illustrated mass attached to the arm chain.

## Diagnosis

The animation system currently understands joint motion, but not gesture meaning.

For natural hand gestures it must also track:

- forearm direction;
- wrist orientation;
- palm facing;
- target direction of the gesture;
- allowed waving arc.

## Required improvement

Add a gesture-semantics layer:

```text
shoulder
→ elbow
→ wrist
→ palm orientation
→ gesture target
```

For a wave, the palm orientation and waving direction must remain consistent with a natural human greeting / stop-like gesture.

## Reusable lesson

Smooth animation is not enough. Human actions also need semantic validation: pose meaning, facing direction and behavioral plausibility.

## Status

**FAILURE / FIX REQUIRED.**

Do not reuse the current `wave` action as an animation reference. Keep it only as a negative example while preserving the rest of the worker as an accepted success.
