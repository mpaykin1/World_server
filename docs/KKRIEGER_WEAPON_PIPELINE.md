# Krieger weapon pipeline — World Server control map

Status: 2026-09-30  
Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`

This is the World Server copy of the exact native weapon chain discovered during the Level Lab postmortem.

## Data-driven bindings

`Exec_KKrieger_Para` supplies player ammo, owned weapons and movement/camera parameters from operator data.

`Exec_KKrieger_Events` supplies four groups of eight KOp links:

- mode 0 -> `WeaponShot[8]`
- mode 1 -> `WeaponOptics[8]`
- mode 2 -> `WeaponExplode[0][8]`
- mode 3 -> `WeaponExplode[1][8]`

So weapon visuals and projectile/explosion effects are operator-graph resources, not standalone hard-coded meshes.

## Fire chain

```
sKEY_MOUSEL
 -> KKriegerGame::OnKey
 -> Player.FireKey
 -> OnTick gates
 -> WeaponShot[current]
 -> FireShot
 -> KKriegerShot::Event.Op
 -> AddEvents
 -> operator/effect execution
 -> Engine jobs
 -> framebuffer
```

OnTick gates include ammo, settled weapon switch, cooldown and `WeaponTimer`.

Visible first-person weapon:

```
WeaponOptics[current]
 -> WeaponEvent.Op
 -> KEnvironment::AddStaticEvent
 -> operator graph
 -> Engine
```

## Frame-order nuance

`mainplayer.cpp` runs approximately:

```
Game->OnTick
Environment->InitFrame
Document->AddEvents
Game->AddEvents
root->Exec
```

`KKriegerGame::Flush()` clears all weapon-link arrays, but `Exec_KKrieger_Events` can repopulate them when the root graph runs again.

Therefore:

- Flush is destructive and must trigger a rebind proof;
- it is not sufficient evidence by itself to claim the weapon remains permanently null;
- Level Lab v1 never tested the post-reset weapon bindings;
- the **certain rendering failure** is v1's later clearing of `MeshJobs` and `EffectJobs`, which removes native weapon/effect work before paint.

## Required Weapon Lab telemetry

Expose and assert:

- current / next weapon;
- ownership bit;
- ammo;
- `WeaponTimer`;
- cooldown;
- `FireKey`;
- non-null `WeaponOptics[current]`;
- non-null `WeaponShot[current]`;
- explosion links;
- `Shots.Count`;
- non-null shot event operator;
- visible weapon framebuffer evidence;
- visible FIRE framebuffer delta;
- collision/hit or shot expiry.

Input telemetry alone is not PASS.

## World Server architectural rule

Custom levels must replace world content at an operator/scene boundary that preserves the global player/weapon/effect graph. Do not clear the entire renderer queue to hide the original map.

Canonical detailed source note also lives in `mpaykin1/scratch-chain-reaction/KRIEGER_WEAPON_PIPELINE.md`.
