(function(){
  'use strict';

  function clamp(v,a,b){ return Math.max(a,Math.min(b,Number(v)||0)); }
  function distToSegment(px,pz,x1,z1,x2,z2){
    const vx=x2-x1,vz=z2-z1,wx=px-x1,wz=pz-z1,den=vx*vx+vz*vz;
    const t=den?clamp((wx*vx+wz*vz)/den,0,1):0;
    return Math.hypot(px-(x1+vx*t),pz-(z1+vz*t));
  }
  function hash32(x,z,s){
    let h=(Math.imul((x|0)^0x9e3779b1,374761393)+Math.imul((z|0)^0x85ebca6b,668265263)+(s|0))|0;
    h=Math.imul(h^(h>>>13),1274126177); return (h^(h>>>16))>>>0;
  }
  function sample(state,x,z){
    if(!state||!Array.isArray(state.entities)) return null;
    let biome=null,clearTrees=false,surface=null,city=null,heightDelta=0,weight=0;
    for(const e of state.entities){
      const d=Math.hypot(x-Number(e.x||0),z-Number(e.z||0)),r=Math.max(1,Number(e.radius)||24);
      if(d>r) continue;
      const w=1-d/r; weight=Math.max(weight,w);
      if(e.type==='forest') biome='forest';
      else if(e.type==='desert'||e.type==='volcano') biome='desert';
      else if(e.type==='snow') biome='snow';
      else if(e.type==='city'||e.type==='village'){ biome='plains'; clearTrees=true; if(!city||w>city.weight) city={entity:e,weight:w}; }
      else if(e.type==='mountains') heightDelta+=w*10;
    }
    for(const f of Array.isArray(state.features)?state.features:[]){
      const g=f.geometry||{},active=Number(f.stage||1)<=Number(state.growthStage||1);
      if(!active) continue;
      let inside=false;
      if(g.kind==='line') inside=distToSegment(x,z,Number(g.x1),Number(g.z1),Number(g.x2),Number(g.z2))<=Math.max(1,Number(g.width)||2);
      else inside=Math.hypot(x-Number(f.x||0),z-Number(f.z||0))<=Math.max(1,Number(f.radius)||4);
      if(!inside) continue;
      if(f.effect?.biome) biome=f.effect.biome;
      if(f.effect?.clearTrees) clearTrees=true;
      if(f.effect?.surface) surface=f.effect.surface;
    }
    return { biome,clearTrees,surface,city,heightDelta,weight };
  }
  function column(state,x,z,h,BLOCK){
    const p=sample(state,x,z); if(!p) return null;
    const out={clearTrees:p.clearTrees,surfaceBlock:null,blocks:[]};
    if(p.surface==='road') out.surfaceBlock=BLOCK.STONE;
    else if(p.surface==='ash') out.surfaceBlock=BLOCK.SAND;
    if(!p.city) return out;
    const e=p.city.entity,cx=Number(e.x||0),cz=Number(e.z||0);
    const gx=Math.floor(x-cx),gz=Math.floor(z-cz);
    const mx=((gx%12)+12)%12,mz=((gz%12)+12)%12;
    const road=mx<=1||mz<=1||mx>=10||mz>=10;
    if(road){out.surfaceBlock=BLOCK.STONE;out.clearTrees=true;return out;}
    const cellX=Math.floor(gx/12),cellZ=Math.floor(gz/12);
    const seed=hash32(cellX,cellZ,String(e.id||'').length*977);
    if((seed&3)===0) return out;
    const pad=3+(seed%2),inside=mx>=pad&&mx<=11-pad&&mz>=pad&&mz<=11-pad;
    if(!inside) return out;
    out.clearTrees=true;
    const bh=3+((seed>>>3)%7);
    for(let y=h+1;y<=Math.min(h+bh,95);y++){
      const top=y===h+bh,edge=mx===pad||mx===11-pad||mz===pad||mz===11-pad;
      if(top||edge){
        const window=!top&&y>h+1&&((x+z+y)&3)===0;
        out.blocks.push({y,block:window?BLOCK.GLASS:BLOCK.BRICK});
      }
    }
    return out;
  }
  window.WorldEmergenceRuntime={sample,column,distToSegment};
})();