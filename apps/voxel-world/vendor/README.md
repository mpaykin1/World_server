# Local Three.js vendor file

Production Voxel World should contain this file in the same directory:

`three.module.min.js` from official Three.js release **r165 / 0.165.0**.

The client tries this local file first. The CDN import is only a temporary fallback
so this upgrade package remains runnable before Codex vendors the dependency.
Codex must vendor the official file before marking PR #2 ready to merge.

Source repository: `mrdoob/three.js`, tag `r165`, path `build/three.module.min.js`.
License: MIT; see `THREE_LICENSE`.
