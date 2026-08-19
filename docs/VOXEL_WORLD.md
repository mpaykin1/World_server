# Voxel World — World_server integration

## Architecture

- Browser client: Three.js/WebGL, procedural chunked voxel terrain.
- Persistent state: Supabase Postgres.
- Multiplayer movement and block events: Supabase Realtime Broadcast.
- Online roster: Supabase Presence.
- Authoritative persistence writes: `/api/voxel` Vercel Function using the existing server-side Supabase admin client.
- Catalog registration: automatic because `api/apps.js` scans `apps/*/index.html`.

## Implemented gameplay

- Infinite chunk streaming around the player.
- Deterministic terrain seed.
- Plains, forest, desert and snow biomes.
- Hills/mountains, caves, trees, coal and iron deposits.
- Water/sea level.
- Greedy chunk meshing in a Web Worker instead of one Three.js Mesh per block.
- One-draw-call 4×4 Roblox MaterialVariant texture atlas for the opaque blocks, with vertex-color fallback.
- First-person WASD/arrow/mouse controls, gravity, collision and buffered jumping.
- Sprint.
- 9-slot block hotbar.
- Break/place blocks with reach validation.
- Desktop pointer-lock controls.
- Full-canvas touch look, camera-relative virtual movement pad, immediate jump/break/place controls and a fullscreen button for mobile.
- Day/night lighting and fog.
- Supabase persistent block overrides.
- Persistent player position/orientation/selected block.
- Multiplayer avatars with Broadcast updates.
- Presence-based online player count.
- Existing shared account/chat system via AppCore.

## Texture delivery

- `/api/roblox-texture` only serves asset IDs present in `apps/voxel-world/materials-roblox.json`.
- The proxy prefers Roblox Asset Delivery and uses the public Roblox Thumbnails API when unauthenticated Asset Delivery rejects a texture.
- `ROBLOX_OPEN_CLOUD_API_KEY` is optional. When configured in Vercel, the proxy uses the authenticated Open Cloud Asset Delivery endpoint first; the key is never exposed to the browser.
- Texture responses are validated as PNG, JPEG or WebP and cached by the Vercel CDN.

## Database objects already created

- `voxel_worlds`
- `voxel_block_overrides`
- `voxel_player_states`

RLS is enabled. Direct public writes to block/player tables are revoked. The public client can only read basic world metadata. Writes use server-side credentials through `/api/voxel`.

## Open-source integration policy

This first integrated build reimplements compatible voxel-game features in the existing World_server stack instead of copying foreign repositories wholesale. That keeps architecture coherent and avoids mixing incompatible licenses/assets. Direct code or assets from another project should only be imported after per-project license/provenance review.

## Next scalable upgrades

- Normal/roughness detail atlases in addition to the current color atlas.
- Server-validated inventory/recipes/tools.
- Mobs, combat, drops, crafting and furnaces.
- Structures/villages/dungeons.
- Chunk compression and batched block-edit RPC.
- Interest-management rooms for large multiplayer worlds.
- Server-side anti-cheat movement budget and edit quotas.
