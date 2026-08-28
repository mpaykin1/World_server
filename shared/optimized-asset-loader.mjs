import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
export class OptimizedAssetLoader{
  constructor(renderer){this.renderer=renderer;this.ktx2=new KTX2Loader().setTranscoderPath('/shared/vendor/three/examples/jsm/libs/basis/').detectSupport(renderer);this.loader=new GLTFLoader();this.loader.setKTX2Loader(this.ktx2);this.ready=this.#meshopt();}
  async #meshopt(){try{const mod=await import('/shared/vendor/meshoptimizer/meshoptimizer.bundle.mjs');const d=mod.MeshoptDecoder||mod.default?.MeshoptDecoder;await d?.ready;this.loader.setMeshoptDecoder(d);return true;}catch(e){console.warn('[OptimizedAssetLoader] meshopt unavailable',e);return false;}}
  async load(url){await this.ready;return await this.loader.loadAsync(url)}
  dispose(){this.ktx2.dispose();}
}
