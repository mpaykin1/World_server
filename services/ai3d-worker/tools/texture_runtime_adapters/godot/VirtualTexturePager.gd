extends RefCounted
class_name VirtualTexturePager

var capacity: int = 0
var resident: Dictionary = {}
var layers: Texture2DArray = Texture2DArray.new()
var initialized: bool = false

func initialize(images: Array[Image]) -> bool:
    if images.is_empty():
        return false
    capacity = images.size()
    var first := images[0]
    for image in images:
        if image.get_width() != first.get_width() or image.get_height() != first.get_height() or image.get_format() != first.get_format() or image.has_mipmaps() != first.has_mipmaps():
            return false
    var err := layers.create_from_images(images)
    initialized = err == OK
    if initialized:
        for i in images.size():
            resident[str(i)] = {"layer": i, "time": Time.get_ticks_msec()}
    return initialized

func upload(key: String, layer: int, image: Image) -> bool:
    if not initialized or layer < 0 or layer >= capacity:
        return false
    if image.get_width() != layers.get_width() or image.get_height() != layers.get_height() or image.get_format() != layers.get_format() or image.has_mipmaps() != layers.has_mipmaps():
        return false
    layers.update_layer(image, layer)
    resident[key] = {"layer": layer, "time": Time.get_ticks_msec()}
    return true

func evict(key: String) -> bool:
    # Removes the logical residency mapping. Call upload() to replace the physical layer.
    return resident.erase(key)

func stats() -> Dictionary:
    return {"residentPages": resident.size(), "capacity": capacity, "gpuUploadInitialized": initialized, "measuredFromRuntime": true}
