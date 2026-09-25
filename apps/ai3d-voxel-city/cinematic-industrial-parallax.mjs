/**
 * CPU-rasterized distant industrial city impostors behind genuine 3D assets.
 * Per-layer pixels drawn once; runtime updates only 2-3 transforms per frame.
 * Reuses existing Three.js renderer and fog; no separate engine.
 */
const PRESETS=Object.freeze({
  low:{width:352,height:160,layers:2,buildings:16},
  balanced:{width:640,height:256,layers:3,buildings:29},
  high:{width:768,height:288,layers:3,buildings:36},
  ultra:{width:896,height:320,layers:3,buildings:42}
});
export function industryBudget(tier){return PRESETS[tier]||PRESETS.balanced;}
function rng(seed){
  let state=seed>>>0;
  return()=>{
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return(state>>>0)/4294967296;
  };
}
export function drawIndustrialLayer(ctx,width,height,seed=17,detail=30){
  if(width<128||width>1024||height<80||height>512||detail>48)throw Error('industrial art budget exceeded');
  const rand=rng(seed),horizon=height*.69;
  ctx.clearRect(0,0,width,height);
  const haze=ctx.createLinearGradient(0,0,0,height);
  haze.addColorStop(0,'rgba(14,22,31,0)');
  haze.addColorStop(.54,'rgba(30,41,53,0.025)');
  haze.addColorStop(1,'rgba(35,39,43,0.22)');
  ctx.fillStyle=haze;ctx.fillRect(0,0,width,height);
  let buildingCount=0,windows=0,pipes=0,beacons=0;
  const unit=width/Math.max(8,detail);
  // Imperfect staggered silhouette: identifiable buildings, tanks and stacks.
  for(let index=0;index<detail;index++){
    const bx=Math.floor(index*unit+(rand()-.5)*unit*.35);
    const bw=Math.max(6,Math.round(unit*(.65+rand()*.86)));
    const bh=height*(.12+rand()*.34);
    const by=horizon-bh;
    const shade=Math.floor(17+rand()*15);
    ctx.fillStyle='rgb('+shade+','+(shade+5)+','+(shade+8)+')';
    ctx.fillRect(bx,by,bw,bh+height*.17);
    ctx.fillStyle='rgba(60,77,82,0.56)';
    ctx.fillRect(bx-1,by-1,bw+2,1);
    buildingCount++;
    if(index%3===0){
      const sx=bx+bw*.7,sh=height*(.22+rand()*.33);
      ctx.fillStyle='rgba(29,41,47,0.98)';
      ctx.fillRect(sx,by-sh*.69,Math.max(2,bw*.1),sh*.72);
      ctx.fillStyle='rgba(255,114,50,0.89)';
      ctx.fillRect(sx-2,by-sh*.69-2,5,2);
      beacons++;
    }
    if(index%4===0){
      const cx=bx+bw*.53,cy=by+bh*.29;
      ctx.strokeStyle='rgba(77,92,94,.36)';
      ctx.lineWidth=Math.max(1,width/700);
      ctx.beginPath();ctx.moveTo(cx,cy);
      ctx.lineTo(cx+unit*2.7,cy);ctx.stroke();pipes++;
    }
    // Limit city light density by device tier, not hundreds of GPU draw calls.
    const cols=Math.floor(bw/10),rows=Math.min(6,Math.floor(bh/10));
    for(let yi=0;yi<rows;yi++)for(let xi=0;xi<cols;xi++){
      if(rand()>.47)continue;
      const xx=bx+4+xi*10,yy=by+4+yi*10;
      if(xx>width-4||yy>height-3)continue;
      ctx.fillStyle=rand()>.16?'rgba(255,189,112,.81)':'rgba(165,214,213,.48)';
      ctx.fillRect(xx,yy,2+(rand()>.8?1:0),2);
      windows++;
    }
  }
  // Layered catwalks, trusses and pipes; alpha remains transparent to actual 3D.
  for(let i=0;i<Math.floor(detail*.23);i++){
    const y=horizon+6+i*height*.018;
    const x=Math.floor(rand()*width*.65),length=width*(.09+rand()*.22);
    ctx.strokeStyle='rgba(57,73,73,.56)';
    ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);
    ctx.lineTo(x+length,y);ctx.lineTo(x+length,y+4);ctx.stroke();
    for(let j=0;j<5;j++){
      const px=x+(length/5)*j;
      ctx.beginPath();ctx.moveTo(px,y);
      ctx.lineTo(px+length/5,y+4);ctx.stroke();
    }
  }
  // Mist fades hard geometry into low-cost fog and preserves the focal distance.
  const bottom=ctx.createLinearGradient(0,horizon,0,height);
  bottom.addColorStop(0,'rgba(65,78,89,0)');
  bottom.addColorStop(.65,'rgba(73,89,101,.27)');
  bottom.addColorStop(1,'rgba(83,100,110,.52)');
  ctx.fillStyle=bottom;ctx.fillRect(0,horizon,width,height-horizon);
  return {buildings:buildingCount,windows,pipes,beacons,width,height,seed};
}
export function mountIndustrialParallax(THREE,root,tier='balanced'){
  const budget=industryBudget(tier),group=new THREE.Group();
  group.name='CPUIndustrialParallaxVisualOnly';root.add(group);
  const layers=[],positions=[
    [83,15,-75,165,50,.89],
    [-81,28,-126,210,62,.7],
    [-69,31,-189,244,65,.44]
  ];
  for(let index=0;index<budget.layers;index++){
    const canvas=document.createElement('canvas');
    canvas.width=budget.width;canvas.height=budget.height;
    const count=Math.max(8,budget.buildings-index*6);
    const stats=drawIndustrialLayer(canvas.getContext('2d'),
      canvas.width,canvas.height,20260925+index*101,count);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.generateMipmaps=false;
    texture.minFilter=THREE.LinearFilter;
    const [x,y,z,width,height,opacity]=positions[index];
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),
      new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity,
        depthWrite:false,depthTest:true,side:THREE.DoubleSide,fog:true}));
    mesh.name='IndustrialParallaxLayer-'+index;
    mesh.position.set(x,y,z);
    group.add(mesh);
    layers.push({mesh,texture,stats});
  }
  return{
    group,layers,
    update(camera){
      if(!camera)return;
      for(const layer of layers)layer.mesh.quaternion.copy(camera.quaternion);
    },
    stats(){
      return{layerCount:layers.length,pixelBytes:budget.width*budget.height*4*layers.length,
        silhouettes:layers.reduce((sum,l)=>sum+l.stats.buildings,0),
        paintedWindows:layers.reduce((sum,l)=>sum+l.stats.windows,0),
        frameCpuRasterized:false};
    },
    dispose(){
      group.parent?.remove(group);
      for(const {mesh,texture} of layers){
        mesh.geometry.dispose();mesh.material.dispose();texture.dispose();
      }
    }
  };
}
