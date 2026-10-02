/** Deterministic emissive volcanic fissures in ONE dynamic-free draw call.
 * Geometry follows the front cone, with a small surface offset and hot-to-cool
 * lava colors; no GPU generation, raymarch, texture streaming or new engine.
 */
export function buildLavaRibbons({tier='balanced',volcano={x:-35,y:-13,z:-125},
  scale=1.55}={}){
  const low=tier==='low',pathCount=low?5:10,segments=low?10:17;
  const positions=[],colors=[];
  const push=(p,c)=>{positions.push(...p);colors.push(...c);};
  const quad=(a,b,c,d,hot)=>{
    const warm=[1,.12+hot*.55,.015+hot*.15],cool=[.93,.08,.016];
    const color=hot>.5?warm:cool;
    push(a,color);push(b,color);push(c,color);
    push(a,color);push(c,color);push(d,color);
  };
  for(let k=0;k<pathCount;k++){
    const phase=k*.93,angle=0.46+k*.16;
    for(let j=0;j<segments;j++){
      const pathLength=.49+(k%5)*.081;
      const t0=.92-(j/segments)*pathLength,
            t1=.92-((j+1)/segments)*pathLength;
      const at=t=>{
        const theta=angle+Math.sin(t*11+phase)*.125+
          Math.sin(t*29+phase*.78)*.033+(1-t)*(k%3-1)*.075;
        const radius=(65*Math.pow(1-t,.68)+.8)*scale+2.7;
        const y=(49*t-7)*scale+4.2;
        const width=(.14+(1-t)*.43)*scale*(.72+.28*Math.cos(k*.57));
        const x=volcano.x+Math.cos(theta)*radius,z=volcano.z+Math.sin(theta)*radius;
        return[
          [x-Math.sin(theta)*width,volcano.y+y,z+Math.cos(theta)*width],
          [x+Math.sin(theta)*width,volcano.y+y,z-Math.cos(theta)*width]
        ];
      };
      const start=at(t0),end=at(t1),hot=t0*.72+.20;
      quad(start[0],start[1],end[1],end[0],hot);
    }
  }
  return{positions:new Float32Array(positions),colors:new Float32Array(colors),
    pathCount,segments,vertexCount:positions.length/3};
}
export function mountLavaRibbons(THREE,root,options={}){
  const data=buildLavaRibbons(options);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));
  geometry.setAttribute('color',new THREE.BufferAttribute(data.colors,3));
  geometry.computeBoundingSphere();
  const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,
    opacity:.92,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,fog:true,toneMapped:false});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='VisibleCPUVolcanoFissures';
  mesh.frustumCulled=true;
  root.add(mesh);
  return {mesh,...data,dispose(){mesh.parent?.remove(mesh);
    geometry.dispose();material.dispose();}};
}
