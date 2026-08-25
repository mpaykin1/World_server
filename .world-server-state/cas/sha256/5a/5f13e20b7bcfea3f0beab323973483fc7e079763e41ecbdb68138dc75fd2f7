# Capture / generation guide for maximum geometry consistency

1. Keep camera height, lens/equirectangular projection, lighting and scene identity fixed.
2. Move the camera 0.5–1.5 m between panoramas for interiors, 1–2 m for streets.
3. Keep at least 70% of architectural content visible in the next panorama.
4. Never regenerate buildings independently between views: windows, doors, signs, roofs and lanterns must remain the same objects.
5. If exact camera positions are known, save them as `capture.json`. The system uses them instead of guessing poses.
6. Run the capture-quality gate before reconstruction. A score below 70 should trigger recapture/regeneration rather than adding more random views.
7. For long streets, create overlapping zones and connect zones with 2–4 shared panoramas.
