# Graphics Quality Governor MVP — success record (2026-09-30)

Status: **MVP SUCCESS / LIVE VERIFIED**  
Scope: the reusable quality-governor proof, not full canonical .kkrieger visual fidelity.

## Public proof

Stable route:

https://mpaykin1.github.io/scratch-chain-reaction/graphics-quality-governor/

Published scratch merge SHA:

`f7328000c7517432986a745e8c4be61c27e56187`

Source World Server implementation commit:

`cba839abb92857e2145d592a1aab5975dd5a6f3e`

World Server PR:

https://github.com/mpaykin1/World_server/pull/368

Scratch publication PR:

https://github.com/mpaykin1/scratch-chain-reaction/pull/54

## Fresh live verification

Exact public URL was verified in a real headless Chromium browser after publication.

Verification timestamp:

`2026-09-30T03:42:47.418Z`

Portrait-mobile proof:
- HTTP 200;
- viewport 390x844;
- CSS canvas coverage 390x844;
- page/console errors: 0;
- A/B noticeability: 100/100;
- primitive framebuffer hash: `7d4e067b`;
- enhanced framebuffer hash: `fd1f9c5e`;
- same internal framebuffer resolution for A and B: 320x636.

Desktop proof:
- HTTP 200;
- viewport 1280x800;
- CSS canvas coverage 1280x800;
- page/console errors: 0;
- A/B noticeability: 100/100;
- primitive framebuffer hash: `80a35fe4`;
- enhanced framebuffer hash: `321b73fa`;
- same internal framebuffer resolution for A and B: 973x608.

The browser regression proved that the A/B buttons change real WebGL framebuffer pixels, not only text labels.

## Why this MVP succeeded

The useful breakthrough was not “a prettier room”. It was introducing non-compensating quality structure around generation:

1. **Same semantic recipe for A and B.** Seed, camera, FOV and semantic intent stay fixed, so the quality change cannot be hidden inside a different scene.
2. **Four hard gates.** Near-object, material, lighting and environment failures cannot be averaged away.
3. **Semantic detail instead of triangle worship.** Macro/meso/micro structure and functional components count; triangle inflation alone is explicitly regression-tested and still fails.
4. **Style-aware thresholds.** Voxel, watercolor, Living Ink and intentional minimalism are not incorrectly punished for avoiding PBR, while semantic execution remains required.
5. **Primitive Graphics Detector.** Giant flat surfaces, primitive fallback dominance, weak material variation and shallow composition are named failure modes.
6. **Real framebuffer evidence.** Browser tests verify that visual state changes in the WebGL buffer itself.
7. **Portrait is first-class.** The proof fills the actual 390x844 gameplay viewport instead of relying on CSS declarations alone.
8. **Krieger archaeology informed the rules.** The Level Lab v1 failure was traced to primitive cube authoring, survival materials, missing native scene/effect structure and render-pass mistakes; those lessons became permanent release protection.

## Important boundary

The enhanced candidate passes the **configured structural Governor gates**. This does **not** prove full canonical Krieger visual fidelity.

The reference visual gate is still IN_PROGRESS for:
- geometry density;
- material richness;
- lighting/contact-shadow depth;
- near-camera hero detail;
- microdetail.

Physical iPhone 11 performance/fidelity is still **USER VERIFICATION REQUIRED**.

Therefore the reusable success is:

> World Server now has a first working universal mechanism that rejects the old primitive-graphics failure class and explains why.

The remaining task is to strengthen render-derived/reference-derived quality evidence until the enhanced candidate itself reaches the desired canonical visual class.
