extends RefCounted
class_name TextureGpuCapabilityProbe

static func probe() -> Dictionary:
    var renderer := RenderingServer.get_current_rendering_method()
    var device_name := RenderingServer.get_video_adapter_name()
    var vendor := RenderingServer.get_video_adapter_vendor()
    return {
        "platform": "godot",
        "renderingMethod": renderer,
        "adapterName": device_name,
        "adapterVendor": vendor,
        "measuredFromRuntime": true,
        "formatSupportRequiresImportProbe": true,
        "note": "Do not infer BC/ASTC support solely from vendor name. Run an import/sampling gate."
    }
