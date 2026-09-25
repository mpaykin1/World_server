/**
 * Bounded atmosphere: layer-based steam, orange volcanic plume and practical
 * light halos. Reuses parent THREE.Scene/renderer; no post-process compositor.
 * Every pixel in each sprite texture is CPU-generated ONCE.
 */
import {mountLavaRibbons} from './cinematic-cpu-lava.mjs';
const MAX={low:{plume:3,halo:5,haze:3},balanced:{plume:7,halo:12,haze:7},
           high:{plume:11,halo:18,haze:10},ultra:{plume:11,halo:17,haze:9}};
export function effectBudget(tier){return MAX[tier]||MAX.balanced;}
export function radialTexture(THREE,color){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(64,64,1,64,64,62);
  g.addColorStop(0,'rgba('+color+',0.96)');
  g.addColorStop(.18,'rgba('+color+',0.46)');
  g.addColorStop(.48,'rgba('+color+',0.15)');
  g.addColorStop(1,'rgba('+color+',0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=false;
  texture.minFilter=THREE.LinearFilter;
  return texture;
}
export function createCinematicEffects(THREE,root,{tier='balanced',volcano={x:-35,y:-13,z:-125}}={}){
  const {plume,halo,haze}=effectBudget(tier);
  const steamTexture=radialTexture(THREE,'198,210,220');
  const fireTexture=radialTexture(THREE,'255,111,35');
  const warmTexture=radialTexture(THREE,'255,195,104');
  const ambient=new THREE.Group();
  ambient.name='CinematicOptInLayeredAtmosphere';root.add(ambient);
  const lavaRibbons=mountLavaRibbons(THREE,ambient,{tier,volcano});
  const emitters=[],make=(type,tex,point,size,opacity,index,options={})=>{
    const mat=new THREE.SpriteMaterial({map:tex,color:0xffffff,
      blending:options.blend===true?THREE.AdditiveBlending:THREE.NormalBlending,
      depthWrite:false,depthTest:true,transparent:true,opacity,fog:true});
    const sprite=new THREE.Sprite(mat);sprite.name=type;ambient.add(sprite);
    sprite.position.set(...point);sprite.scale.set(size,size,1);
    emitters.push({sprite,point,size,opacity,index,type});return sprite;
  };
  for(let i=0;i<plume;i++){
    const angle=i*2.39996,z=i*4.5,x=Math.sin(angle)*i*1.7;
    make('VolcanicSmoke',steamTexture,[volcano.x+x,volcano.y+83+i*3.2,
      volcano.z+Math.cos(angle)*i*1.4],13+i*2.2,.17,i);
  }
  // Each industrial light has a low-opacity shaderless halo, not a point light.
  const industrial=[[0,35,0],[17,13,-9],[-21,19,-5],[-29,29,17],
    [0,24,17],[18,13,20],[27,9,9],[8,13,10],[-11,11,9],[-7,6,-11]];
  for(let i=0;i<halo;i++){
    const p=industrial[i%industrial.length];
    const point=[p[0]+(i>=industrial.length?1:0),p[1],p[2]];
    make('IndustryLamp',warmTexture,point,tier==='low'?1.9:2.9,.55,i,{blend:true});
  }
  for(let i=0;i<haze;i++){
    const a=i*1.82,r=7+i*2.7;
    make('GroundSteam',steamTexture,[Math.cos(a)*r,1.6+i*.46,
      Math.sin(a)*r],10+i*2.4,.12,i);
  }
  const ember=make('VolcanoLavaHalo',fireTexture,[volcano.x,volcano.y+70,volcano.z],
    tier==='low'?23:36,.46,0,{blend:true});
  let eruptionTime=null;
  function update(now){
    const t=now*.001;
    for(const entry of emitters){
      const {sprite,point,size,index,type}=entry;
      if(type==='VolcanicSmoke'){
        sprite.position.set(point[0]+Math.sin(t*.19+index)*2.8,
          point[1]+Math.sin(t*.31+index)*1.7,point[2]+Math.cos(t*.13+index)*2.2);
        const pulse=.84+.16*Math.sin(t*.32+index);
        sprite.material.opacity=entry.opacity*pulse;
      }else if(type==='GroundSteam'){
        sprite.position.x=point[0]+Math.sin(t*.16+index)*.7;
        sprite.material.opacity=entry.opacity*(.73+.23*Math.sin(t*.29+index));
      }else if(type==='IndustryLamp'){
        sprite.material.opacity=entry.opacity*(.89+.1*Math.sin(t*.8+index));
      }
    }
    if(eruptionTime!==null){
      const elapsed=Math.max(0,(now-eruptionTime)*.001);
      if(elapsed>14){eruptionTime=null;}
      else{
        const strength=Math.sin(Math.PI*elapsed/14)**2;
        ember.material.opacity=.46+strength*.5;
        lavaRibbons.mesh.material.opacity=.92+strength*.08;
        ember.scale.setScalar(ember.userData.baseSize*(1+strength*.63));
        for(const e of emitters)if(e.type==='VolcanicSmoke')
          e.sprite.material.opacity=e.opacity*(1+strength*.85);
      }
    }else{
      ember.material.opacity=.46;
      lavaRibbons.mesh.material.opacity=.92;
      ember.scale.setScalar(ember.userData.baseSize);
    }
  }
  ember.userData.baseSize=ember.scale.x;
  return{group:ambient,emitters,triggerEruption(now){
    eruptionTime=Number.isFinite(now)?now:performance.now();
  },isErupting(){return eruptionTime!==null;},update,
    stats(){return{spriteCount:emitters.length,
      maximumSprites:plume+halo+haze+1,
      lavaRibbonVertices:lavaRibbons.vertexCount,lavaPaths:lavaRibbons.pathCount,
      eruptionActive:eruptionTime!==null};},
    dispose(){
      ambient.parent?.remove(ambient);
      emitters.forEach(e=>e.sprite.material.dispose());
      lavaRibbons.dispose();
      steamTexture.dispose();fireTexture.dispose();warmTexture.dispose();
    }};
}
