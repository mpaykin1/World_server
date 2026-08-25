'use strict';
const SIMD_TEST=Uint8Array.from([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,23,1,21,0,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,26,11]);
function detectWasmSimd(){try{return {wasm:typeof WebAssembly!=='undefined',simd:typeof WebAssembly!=='undefined'&&WebAssembly.validate(SIMD_TEST),fallback:'scalar-cpu'};}catch{return {wasm:false,simd:false,fallback:'scalar-cpu'};}}
module.exports={detectWasmSimd,SIMD_TEST};
