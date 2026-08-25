# Optional CPU models

The system auto-detects these files and activates them without code changes:

- `depth_anything_v2.onnx` or `midas.onnx` -> depth prior
- `lightglue.onnx` or `loftr.onnx` -> pair matcher
- `raft.onnx` -> dense optical flow
- `birefnet.onnx`, `sam_encoder.onnx`, or `person_segmentation.onnx` -> segmentation / semantic mask

You can also set environment variables:

- `PIXEL3DGS_DEPTH_MODEL`
- `PIXEL3DGS_MATCHER_MODEL`
- `PIXEL3DGS_FLOW_MODEL`
- `PIXEL3DGS_SEGMENTATION_MODEL`

`configs/optional_backends.json` supports an optional `url` + `sha256` per model. If configured, run the auto-installer endpoint or CLI helper. No unverified download URL is embedded in the patch.
