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
- Visible-face chunk meshing instead of one Three.js Mesh per block.
- First-person WASD/mouse controls, gravity, collision and jumping.
- Sprint.
- 9-slot block hotbar.
- Break/place blocks with reach validation.
- Desktop pointer-lock controls.
- Touch look, virtual movement pad, jump/break/place controls for mobile.
- Day/night lighting and fog.
- Supabase persistent block overrides.
- Persistent player position/orientation/selected block.
- Multiplayer avatars with Broadcast updates.
- Presence-based online player count.
- Existing shared account/chat system via AppCore.

## Database objects already created

- `voxel_worlds`
- `voxel_block_overrides`
- `voxel_player_states`

RLS is enabled. Direct public writes to block/player tables are revoked. The public client can only read basic world metadata. Writes use server-side credentials through `/api/voxel`.

## Open-source integration policy

This first integrated build reimplements compatible voxel-game features in the existing World_server stack instead of copying foreign repositories wholesale. That keeps architecture coherent and avoids mixing incompatible licenses/assets. Direct code or assets from another project should only be imported after per-project license/provenance review.

## Next scalable upgrades

- Greedy meshing + Web Worker chunk generation.
- Texture atlas with normal/roughness detail maps.
- Server-validated inventory/recipes/tools.
- Mobs, combat, drops, crafting and furnaces.
- Structures/villages/dungeons.
- Chunk compression and batched block-edit RPC.
- Interest-management rooms for large multiplayer worlds.
- Server-side anti-cheat movement budget and edit quotas.
