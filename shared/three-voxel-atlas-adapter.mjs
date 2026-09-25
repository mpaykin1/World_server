import {createProceduralAtlas} from './original-voxel-texture-atlas.mjs';

/** Opt-in adapter. Existing World Server PBR profiles and materials remain canonical.
 * Caller owns texture lifecycle and must dispose it on chunk/world teardown.
 */
export function createThreeVoxelAtlas(THREE, options={}) {
 if(!THREE||typeof THREE.DataTexture!=='function') throw new TypeError('THREE.DataTexture required');
 const atlas=createProceduralAtlas(options);
 const texture=new THREE.DataTexture(atlas.pixels,atlas.width,atlas.height,THREE.RGBAFormat);
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.magFilter=THREE.NearestFilter;
 texture.minFilter=THREE.NearestFilter;
 texture.generateMipmaps=false;
 texture.flipY=false;
 texture.needsUpdate=true;
 const uvFor=(material,pad=0.5)=>{
   const tile=atlas.tiles[material];
   if(!tile) throw new RangeError('unknown atlas material');
   if(!Number.isFinite(pad)||pad<0||pad>=Math.min(tile.width,tile.height)/2) throw new RangeError('pad');
   return {u0:(tile.x+pad)/atlas.width,v0:(tile.y+pad)/atlas.height,
     u1:(tile.x+tile.width-pad)/atlas.width,v1:(tile.y+tile.height-pad)/atlas.height};
 };
 return {texture,atlas,uvFor};
}
