# Optional CPU models

Базовая V4 работает без model weights.

Можно усилить CPU pipeline, положив ONNX-файлы в `models/` и указав путь в config/API:
- Depth Anything / MiDaS → `depth_model_path`;
- person/semantic segmentation wrapper → `segmentation_model_path`;
- LoFTR/LightGlue-style correspondence wrapper можно подключить через `advanced_features_cpu.OptionalCorrespondenceONNX`.

Без этих моделей используются бесплатные CPU fallbacks:
- depth heuristic + multi-view photometric fusion;
- adaptive GrabCut character segmentation;
- SIFT + Essential Matrix;
- DIS dense optical flow fallback (RAFT-like role, но не RAFT).

Не хранить большие model weights в Git без отдельной политики LFS/storage.
