/**
 * Seam-consistent sculpted basalt terrain, authored on CPU into one indexed
 * PBR mesh. No extra shader / second renderer / per-frame terrain updates.
 * Elevation, rock strata and the real vertical lava-bank skirts are geometric.
 */
const tiers=Object.freeze({low:2,balanced:3,high:4,ultra:4});
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function hash(x,z,seed){
 let n=(Math.imul(x,374761393)+Math.imul(z,668265263)+Math.imul(seed,2246822519))|0;
 n=Math.imul(n^(n>>>13),1274126177);
 return((n^(n>>>16))>>>0)/4294967295;
}
function smooth(t){return t*t*(3-2*t);}
function noise(x,z,seed){
 const ix=Math.floor(x),iz=Math.floor(z),u=smooth(x-ix),v=smooth(z-iz);
 const a=hash(ix,iz,seed)*(1-u)+hash(ix+1,iz,seed)*u;
 const b=hash(ix,iz+1,seed)*(1-u)+hash(ix+1,iz+1,seed)*u;
 return a*(1-v)+b*v;
}
function elevation(x,z,seed){
 const low=noise(x*.031,z*.031,seed),med=noise(x*.13,z*.13,seed+37),
   grain=noise(x*.38,z*.38,seed+13);
 return -2.06+(low-.5)*.43+(med-.5)*.33+(grain-.5)*.065;
}
function key(x,z){return Math.round(x*100)+':'+Math.round(z*100);}
export function sculptBasaltGeometry(layout,tier='balanced',seed=20260925){
 if(!layout?.tiles||!layout?.lava||!layout.step)throw Error('missing terrain layout');
 const subdivisions=tiers[tier]||tiers.balanced;
 const step=layout.step,vertices=[],normals=[],colors=[],uvs=[],indices=[];
 const molten=new Set(layout.lava.map(t=>key(t.x,t.z)));
 let triangles=0,cliffSegments=0,sculptedTiles=0;
 const addVertex=(x,y,z,u,v,light)=>{
  vertices.push(x,y,z);uvs.push(u,v);
  const h=.19,nx=elevation(x-h,z,seed)-elevation(x+h,z,seed),
    nz=elevation(x,z-h,seed)-elevation(x,z+h,seed),norm=Math.hypot(nx,.38,nz);
  normals.push(nx/norm,.38/norm,nz/norm);
  colors.push(light,light*.98,light*.99);
  return vertices.length/3-1;
 };
 const addTri=(a,b,c)=>{indices.push(a,b,c);triangles++;};
 for(const tile of layout.tiles){
  if(tile.style!=='basalt')continue;
  sculptedTiles++;
  // Exact edge-to-edge surfaces: no accidental checkerboard of glowing magma.
  const ix=[],radius=step*.5;
  const shade=.88+noise(tile.x*.07,tile.z*.07,seed+1)*.12;
  for(let j=0;j<=subdivisions;j++){
   const row=[];
   for(let i=0;i<=subdivisions;i++){
    const u=i/subdivisions,v=j/subdivisions;
    const x=tile.x+(u-.5)*radius*2,z=tile.z+(v-.5)*radius*2;
    // World-space UVs prevent a conspicuous repeated 1-texture-per-tile grid.
    row.push(addVertex(x,elevation(x,z,seed),z,x*.039,z*.039,shade));
   }
   ix.push(row);
  }
  for(let j=0;j<subdivisions;j++)for(let i=0;i<subdivisions;i++){
   const a=ix[j][i],b=ix[j][i+1],c=ix[j+1][i],e=ix[j+1][i+1];
   addTri(a,b,c);addTri(b,e,c);
  }
  // Extrude one jagged rock face for every basalt tile bordering molten lava.
  // Skirts continue to y=-5.75. World-coordinate samples share the same
  // height function as neighbouring top meshes to prevent floating edges.
  for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){
   if(!molten.has(key(tile.x+dx*step,tile.z+dz*step)))continue;
   const a=[];
   for(let i=0;i<=subdivisions;i++){
    const t=i/subdivisions,xx=tile.x+dx*radius+(dz?(t-.5)*radius*2:0);
    const zz=tile.z+dz*radius+(dx?(t-.5)*radius*2:0);
    const top=elevation(xx,zz,seed);
    const dark=clamp(.49+noise(xx*.11,zz*.11,seed+67)*.26,.46,.77);
    const upper=addVertex(xx,top-.16,zz,t,0,dark);
    const lower=addVertex(xx,-5.55,zz,t,1,dark*.61);
    // Vertical rock walls should not inherit surface slope normals.
    const direction=normals.length;
    normals[upper*3]=dx;normals[upper*3+1]=.1;normals[upper*3+2]=dz;
    normals[lower*3]=dx;normals[lower*3+1]=.1;normals[lower*3+2]=dz;
    a.push([upper,lower]);
   }
   for(let i=0;i<subdivisions;i++){
    const [u0,l0]=a[i],[u1,l1]=a[i+1];
    addTri(u0,l0,u1);addTri(l0,l1,u1);
   }
   cliffSegments++;
  }
 }
 if(vertices.length/3>125000||triangles>175000)throw Error('basalt geometry CPU budget exceeded');
 return{positions:new Float32Array(vertices),normals:new Float32Array(normals),
   uv:new Float32Array(uvs),colors:new Float32Array(colors),
   indices:new Uint32Array(indices),
   stats:{triangles,vertices:vertices.length/3,sculptedTiles,cliffSegments,
     subdivision:subdivisions,separateDrawCalls:1}};
}
export function mountSculptedBasalt(THREE,parent,layout,basaltPbr,tier='balanced'){
 const source=sculptBasaltGeometry(layout,tier,layout.seed);
 const geo=new THREE.BufferGeometry();
 geo.setIndex(new THREE.BufferAttribute(source.indices,1));
 geo.setAttribute('position',new THREE.BufferAttribute(source.positions,3));
 geo.setAttribute('normal',new THREE.BufferAttribute(source.normals,3));
 const uv=new THREE.BufferAttribute(source.uv,2);
 geo.setAttribute('uv',uv);geo.setAttribute('uv2',new THREE.BufferAttribute(source.uv.slice(),2));
 geo.setAttribute('color',new THREE.BufferAttribute(source.colors,3));
 geo.computeBoundingSphere();
 const material=basaltPbr.clone();material.vertexColors=true;
 material.emissive.setHex(0x363a42);
 material.emissiveIntensity=.4;
 material.side=THREE.DoubleSide;
 const mesh=new THREE.Mesh(geo,material);
 mesh.name='SculptedCrackedBasaltPbrTerrain';mesh.receiveShadow=false;
 parent.add(mesh);
 return{mesh,stats:()=>({...source.stats,usesExistingPbrMaps:true,
   realGeometricRelief:true,lavaBankSkirts:source.stats.cliffSegments}),
   dispose(){mesh.parent?.remove(mesh);geo.dispose();material.dispose();}};
}
