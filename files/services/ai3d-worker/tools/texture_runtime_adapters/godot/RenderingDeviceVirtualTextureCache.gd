extends RefCounted
class_name RenderingDeviceVirtualTextureCache

# V6 candidate page-cache adapter. It does not claim hardware sparse residency.
# Prefer Texture2DArray fallback when direct RenderingDevice integration is not proven on target renderer/device.

var backend := "godot-renderingdevice-page-cache"
var hardware_sparse_residency_claimed := false
var page_to_layer: Dictionary = {}
var capacity := 0

func configure(max_layers: int) -> void:
    capacity = max(1, max_layers)
    page_to_layer.clear()

func reserve_layer(page_id: String) -> int:
    if page_to_layer.has(page_id):
        return int(page_to_layer[page_id])
    if page_to_layer.size() >= capacity:
        return -1
    var layer := page_to_layer.size()
    page_to_layer[page_id] = layer
    return layer

func evict(page_id: String) -> bool:
    return page_to_layer.erase(page_id)

func status() -> Dictionary:
    return {
        "backend": backend,
        "hardwareSparseResidencyClaimed": hardware_sparse_residency_claimed,
        "residentPages": page_to_layer.size(),
        "capacity": capacity,
        "runtimeVerified": false,
    }
