from dataclasses import dataclass

@dataclass
class BackendStatus:
    name: str
    configured: bool
    mode: str

def detect_optional_backends(cfg):
    return {
        "segmentation": BackendStatus("SAM2/external segmentation", bool(cfg.get("person",{}).get("external_segmentation_command")), "external_adapter"),
        "depth": BackendStatus("Depth Anything/MiDaS external depth", bool(cfg.get("depth",{}).get("external_depth_command")), "external_adapter"),
        "smplx": BackendStatus("SMPL-X external fitting", bool(cfg.get("avatar",{}).get("external_smplx_command")), "external_adapter"),
        "gpu_reconstruction": BackendStatus("remote GPU reconstruction", bool(cfg.get("scene",{}).get("external_gpu_command")), "external_adapter"),
    }
