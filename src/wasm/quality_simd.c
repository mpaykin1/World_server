#include <stdint.h>
#include <wasm_simd128.h>

__attribute__((export_name("dequant_u16_to_f32")))
void dequant_u16_to_f32(uint16_t *src, float *dst, uint32_t count, float scale, float bias) {
    uint32_t i = 0;
    v128_t vscale = wasm_f32x4_splat(scale);
    v128_t vbias = wasm_f32x4_splat(bias);
    for (; i + 8 <= count; i += 8) {
        v128_t q = wasm_v128_load(src + i);
        v128_t lo32 = wasm_u32x4_extend_low_u16x8(q);
        v128_t hi32 = wasm_u32x4_extend_high_u16x8(q);
        v128_t flo = wasm_f32x4_convert_u32x4(lo32);
        v128_t fhi = wasm_f32x4_convert_u32x4(hi32);
        flo = wasm_f32x4_add(wasm_f32x4_mul(flo, vscale), vbias);
        fhi = wasm_f32x4_add(wasm_f32x4_mul(fhi, vscale), vbias);
        wasm_v128_store(dst + i, flo);
        wasm_v128_store(dst + i + 4, fhi);
    }
    for (; i < count; i++) dst[i] = ((float)src[i]) * scale + bias;
}

__attribute__((export_name("scale_bias_f32")))
void scale_bias_f32(float *data, uint32_t count, float scale, float bias) {
    uint32_t i = 0;
    v128_t vscale = wasm_f32x4_splat(scale);
    v128_t vbias = wasm_f32x4_splat(bias);
    for (; i + 4 <= count; i += 4) {
        v128_t x = wasm_v128_load(data + i);
        x = wasm_f32x4_add(wasm_f32x4_mul(x, vscale), vbias);
        wasm_v128_store(data + i, x);
    }
    for (; i < count; i++) data[i] = data[i] * scale + bias;
}

__attribute__((export_name("copy_u8")))
void copy_u8(uint8_t *src, uint8_t *dst, uint32_t count) {
    uint32_t i = 0;
    for (; i + 16 <= count; i += 16) wasm_v128_store(dst + i, wasm_v128_load(src + i));
    for (; i < count; i++) dst[i] = src[i];
}
