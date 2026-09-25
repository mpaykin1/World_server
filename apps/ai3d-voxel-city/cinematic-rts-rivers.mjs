/**
 * CPU-generated contiguous lava channels plus ash substrate.
 * Replaces the former full-square magma plane that flooded the RTS preview.
 * One indexed lava draw + one indexed outer basalt draw in existing Three.js.
 */
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
function hash(x,z,seed){
 let n=(Math.imul(x,374761393)+Math.imul(z,668265263)+Math.imul(seed,2246822519))|0;
 n=Math.imul(n^(n>>>13),1274126177);
 return ((n^(n>>>16))>>>0)/4294967295;
}
export function buildLavaChannelGeometry(layout){
 if(!layout?.lava?.length||!layout.step||!layout.span)
  throw Error('missing molten terrain layout');
 const positions=[],uv=[],indices=[],span=layout.span*2+layout.step;
 for(const tile of layout.lava){
  const h=layout.step*.5,x=tile.x,z=tile.z;
  const corners=[[x-h,z-h],[x+h,z-h],[x-h,z+h],[x+h,z+h]];
  const base=positions.length/3;
  for(const [px,pz] of corners){
   positions.push(px,-5.9,pz);
   uv.push(px/span+.5,pz/span+.5);
  }
  indices.push(base,base+2,base+1,base+2,base+3,base+1);
 }
 if(positions.length/3>25000)throw Error('lava tile geometry budget exceeded');
 return{positions:new Float32Array(positions),uv:new Float32Array(uv),
  indices:new Uint32Array(indices),stats:{
   lavaPatches:layout.lava.length,triangles:indices.length/3,
   vertices:positions.length/3,drawBatches:1,seamFreeWorldUV:true
  }};
}
export function buildAshSubstrate(size=520,grid=42,seed=20260925){
 if(!Number.isInteger(grid)||grid<4||grid>64||size<240||size>850)
  throw Error('outer ash terrain budget exceeded');
 const positions=[],colors=[],uv=[],indices=[],rows=grid+1;
 for(let row=0;row<=grid;row++)for(let col=0;col<=grid;col++){
  const x=(col/grid-.5)*size,z=(row/grid-.5)*size;
  const coarse=hash(Math.floor(x*.07),Math.floor(z*.07),seed);
  const fine=hash(col,row,seed+23);
  const height=-7.52+coarse*.4+fine*.16;
  positions.push(x,height,z);
  const shade=clamp(.47+(coarse-.5)*.17+(fine-.5)*.13,.32,.65);
  colors.push(shade*.95,shade*.91,shade*.9);
  uv.push(col/grid*4,row/grid*4);
 }
 for(let row=0;row<grid;row++)for(let col=0;col<grid;col++){
  const a=row*rows+col,b=a+1,c=a+rows,d=c+1;
  indices.push(a,c,b,c,d,b);
 }
 return{positions:new Float32Array(positions),
  uv:new Float32Array(uv),colors:new Float32Array(colors),
  indices:new Uint32Array(indices),stats:{
   triangles:indices.length/3,drawBatches:1,
   minHeight:-7.52,maxHeight:-6.96
  }};
}
export function mountOuterAshSubstrate(THREE,parent,layout,tier='balanced'){
 const grid=tier==='low'?22:tier==='balanced'?36:48;
 const source=buildAshSubstrate(
  Math.max(520,layout.span*2+220),grid,layout.seed+103);
 const geo=new THREE.BufferGeometry();
 geo.setIndex(new THREE.BufferAttribute(source.indices,1));
 geo.setAttribute('position',new THREE.BufferAttribute(source.positions,3));
 geo.setAttribute('color',new THREE.BufferAttribute(source.colors,3));
 geo.setAttribute('uv',new THREE.BufferAttribute(source.uv,2));
 geo.computeVertexNormals();geo.computeBoundingSphere();
 const material=new THREE.MeshStandardMaterial({
  color:0x5c575b,vertexColors:true,metalness:0,roughness:1,
  flatShading:true,side:THREE.DoubleSide
 });
 const mesh=new THREE.Mesh(geo,material);
 mesh.name='OuterAshBasaltStage';
 mesh.castShadow=false;mesh.receiveShadow=false;
 parent.add(mesh);
 return{mesh,stats:()=>source.stats,
  dispose(){mesh.parent?.remove(mesh);geo.dispose();material.dispose();}
 };
}
export function makeLavaChannelMesh(THREE,parent,layout,material){
 const source=buildLavaChannelGeometry(layout);
 const geo=new THREE.BufferGeometry();
 geo.setIndex(new THREE.BufferAttribute(source.indices,1));
 geo.setAttribute('position',new THREE.BufferAttribute(source.positions,3));
 geo.setAttribute('uv',new THREE.BufferAttribute(source.uv,2));
 geo.computeVertexNormals();geo.computeBoundingSphere();
 const mesh=new THREE.Mesh(geo,material);
 mesh.name='ProceduralCpuPaintedLavaRivers';
 mesh.castShadow=false;mesh.receiveShadow=false;
 parent.add(mesh);
 return{mesh,stats:()=>source.stats,
  dispose(){mesh.parent?.remove(mesh);geo.dispose();}
 };
}
