# Silhouette line quality — FAILURE

Date: 2026-10-02

User decision: **FAILURE** for the visual quality of the observed baseline silhouette line.

## What failed in the observed version

The 3D silhouette system works, but the visible contour that was reviewed by the user was not artistically strong enough.

Compared with the desired Living Light sketch, that line was:

- mostly uniform white;
- nearly uniform in width;
- weak in luminous falloff;
- missing a near-white hot core + warm gold + amber halo separation;
- missing convincing emitted-light bloom;
- missing subtle filament / fur-edge energy;
- reading as a technical postprocess outline rather than a living light source.

## Root cause of the failed baseline

The baseline fragment shader derived the edge with radial max samples around the binary mask and then added only:

- one white near-edge term;
- one white far-glow term.

That proved silhouette extraction, but it did not reproduce the reference-quality luminous line.

## Candidate improvement after the failure record

After the user marked the baseline line as FAILURE, a new rendering candidate was added with:

- near-white hot core;
- gold primary band;
- amber outer halo;
- multiple distance bands;
- stable spatial filament variation;
- slow low-amplitude light breathing.

This candidate is an implementation attempt only. **It does not change the product verdict.**

The line remains classified as **FAILURE until the user explicitly accepts a later visual result**.

## Reusable lesson

A technically correct silhouette edge is not the same thing as a beautiful luminous line.

**3D motion system: SUCCESS by user decision.**
**Observed baseline line quality: FAILURE by user decision.**
**New line candidate: UNACCEPTED / pending user decision.**

## Canonical replacement system

The reusable remediation path is now named **LIGHT**.

Future work should start from `shared/light/index.mjs` and `docs/LIGHT_SYSTEM.md`, rather than extending the original baseline outline shader ad hoc.

This pointer does not change the recorded FAILURE verdict for the observed baseline line.
