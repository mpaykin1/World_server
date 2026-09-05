# Godot bridge

Use `world_vfx_contract.gd` as the single parser for Web ⇄ Godot VFX recipes. Do not synchronize individual particles. Synchronize the canonical event + seed, then render locally. Desktop AI must map all five types to Godot GPU particles/shaders and compare deterministic event hashes against the Web replay fixture before marking parity PASS.
