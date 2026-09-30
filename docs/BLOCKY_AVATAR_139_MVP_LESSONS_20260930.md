# Blocky Avatar 139 MVP — lessons (2026-09-30)

## Goal

Create one self-contained HTML character for World Server ports that looks much closer to a Minecraft-style block avatar while preserving the richest already-vendored free animation runtime: KayKit Rig_Medium with 139 compatible clips.

## Final architecture

- Keep the canonical KayKit Rig_Medium skeleton and animation clips as the hidden animation driver.
- Hide the original Knight meshes.
- Render an original World Server block skin on top of the moving bones:
  - cube head with pixel face;
  - rectangular torso;
  - rigid rectangular upper/lower arms;
  - rigid rectangular upper/lower legs and feet.
- Limb blocks are not pre-authored per animation. Each frame they are reconstructed between the animated joint positions, so all 139 clips can reuse one blocky visual skin.
- The final HTML embeds Three.js, GLTFLoader, the model skeleton and all eight Rig_Medium animation groups. No adjacent GLB/JS files are required at runtime.

## Failures found while building the MVP

### Failure 1 — verifier syntax generated a literal `\n`

A scripted patch inserted the two characters backslash+n into a JavaScript assertion instead of a real newline. The build itself succeeded, but the verification script could not execute.

**Lesson:** generated test code must be executed in CI before any delivery claim. Do not trust text replacement merely because GitHub accepted the commit.

### Failure 2 — direct bone lookup failed

The glTF JSON contains names such as `upperarm.l`, but GLTFLoader sanitizes object names for Three.js. A direct `getObjectByName("upperarm.l")` therefore returned nothing in the browser.

**Fix:** build a normalized runtime bone index that lowercases names and removes punctuation, then match `upperarm.l` and `upperarm_l` by the same normalized key.

**Lesson:** animation/rig integrations must resolve runtime node names, not assume source-file names survive loaders byte-for-byte.

## Successful evidence

Build/verification run: 36673098183.

- 139 animation clips loaded and selectable.
- Desktop Chromium: PASS.
- iPhone-size WebKit: PASS.
- Desktop projected avatar height: 95.685% of the viewport.
- iPhone projected avatar height: 95.721% of the viewport.
- No browser/page errors in the verification run.
- Generated autonomous HTML size: 11,158,792 bytes.
- Visual proof screenshots were captured for desktop and iPhone.

## Reusable pattern

For future Roblox-to-World-Server character ports, do not require every visual style to own a new animation set. Preserve one validated humanoid driver rig and generate/attach alternate visual skins from its moving bones. This separates:

`animation semantics -> canonical rig -> visual skin`

That makes it possible to swap between blocky, voxel, stylized, office, fantasy or other avatars without throwing away the shared movement/combat/tool animation library.
