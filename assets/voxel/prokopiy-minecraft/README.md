# Prokopiy Minecraft curated import

This directory is a curated capability import, not a copy of the upstream repository.

Vendored now:
- 91 textured mob GLBs
- 55 textured item/tool GLBs
- 31 textured entity/vehicle/armour GLBs
- 14 unique useful Unity FBX originals with no equivalent imported GLB identity (copper tools/chests, campfire/lantern soul variants, raft)
- one 1125-layer block texture atlas plus its index
- compact semantic model metadata: mobs.json, items.json, props.json

Every GLB already embeds its texture, so duplicate exported PNGs are intentionally not vendored.
The cross-engine model identity audit accounts for 219 exact normalized logical identities: 191 imported, 10 semantically covered by imported families/compositions, and 18 Unreal-only binary identities preserved at the pinned source SHA for later use. No identity is unaccounted.

Most Unity FBX duplicates, Unreal UAssets, Blender authoring files, engine metadata, screenshots and engine-specific code remain pinned at the exact source commit and are classified in the full source inventory rather than copied blindly.

Runtime discovery: catalog.json.
Full provenance, model identity audit and the 4367-file decision inventory: data/provenance/prokopiy-minecraft/.
Attribution: cryptopiy - https://www.youtube.com/@cryptopiy_/videos; source - https://github.com/Prokopiy8247/Claude-Opus-5.5-Minecraft.
