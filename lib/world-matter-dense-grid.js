'use strict';

const { MATERIALS, AMBIENT_TEMPERATURE } = require('./world-matter-engine');

const MATERIAL_IDS = Object.freeze({
  air:0, stone:1, sand:2, water:3, oil:4,
  wood:5, steam:6, fire:7, lava:8, ash:9
});
const ID_TO_MATERIAL = Object.freeze(
  Object.keys(MATERIAL_IDS).sort((a,b)=>MATERIAL_IDS[a]-MATERIAL_IDS[b])
);
const FLAG_BURNING = 1;

function hash32(value) {
  let h=2166136261;
  for(const ch of String(value)){
    h^=ch.charCodeAt(0);
    h=Math.imul(h,16777619);
  }
  return h>>>0;
}

class DenseMatterGrid {
  constructor(width, height, options = {}) {
    if(width<1 || height<1) throw new Error('DenseMatterGrid needs positive size');
    this.width=width;
    this.height=height;
    this.size=width*height;
    this.seed=Number(options.seed)||1;
    this.tick=0;
    this.material=new Uint8Array(this.size);
    this.temperature=new Int16Array(this.size);
    this.fuel=new Uint8Array(this.size);
    this.life=new Uint8Array(this.size);
    this.flags=new Uint8Array(this.size);
    this.active=new Uint8Array(this.size);
    this.nextActive=new Uint8Array(this.size);
    this.activeList=[];
    this.nextList=[];
    this.stepping=false;
    this.events=[];
    this.emitMoves=Boolean(options.emitMoves);
    this.occupiedCount=0;
    this.emissiveCount=0;
    this.externalSolid=typeof options.externalSolid==='function'?options.externalSolid:null;
    this.temperature.fill(AMBIENT_TEMPERATURE);
  }

  index(x,y){ return y*this.width+x; }
  inBounds(x,y){ return x>=0&&y>=0&&x<this.width&&y<this.height; }
  setExternalSolid(fn){this.externalSolid=typeof fn==='function'?fn:null;}
  blocked(x,y){return !this.inBounds(x,y)||Boolean(this.externalSolid?.(x,y));}
  nameAt(i){ return ID_TO_MATERIAL[this.material[i]] || 'air'; }

  get(x,y){
    if(!this.inBounds(x,y)) return null;
    const i=this.index(x,y), material=this.nameAt(i);
    if(material==='air') return null;
    return {
      material,
      temperature:this.temperature[i],
      fuel:this.fuel[i],
      life:this.life[i],
      burning:Boolean(this.flags[i]&FLAG_BURNING),
      emission:MATERIALS[material]?.emission||0
    };
  }

  set(x,y,material,state={}){
    if(!this.inBounds(x,y)) return false;
    if(material!=='air'&&this.externalSolid?.(x,y)) return false;
    const i=this.index(x,y), id=MATERIAL_IDS[material];
    if(id===undefined) throw new Error(`Unknown dense material: ${material}`);
    const previous=this.nameAt(i);
    const wasOccupied=this.material[i]!==0;
    const willOccupied=id!==0;
    if(!wasOccupied&&willOccupied)this.occupiedCount++;
    if(wasOccupied&&!willOccupied)this.occupiedCount--;
    if((MATERIALS[previous]?.emission||0)>0)this.emissiveCount--;
    if((MATERIALS[material]?.emission||0)>0)this.emissiveCount++;
    this.material[i]=id;
    if(material==='air'){
      this.temperature[i]=AMBIENT_TEMPERATURE;
      this.fuel[i]=0;
      this.life[i]=0;
      this.flags[i]=0;
    }else{
      const def=MATERIALS[material]||{};
      this.temperature[i]=Number.isFinite(state.temperature)
        ? Math.round(state.temperature)
        : Math.round(def.temperature??AMBIENT_TEMPERATURE);
      this.fuel[i]=Number.isFinite(state.fuel)
        ? Math.max(0,Math.round(state.fuel)) : (def.fuel||0);
      this.life[i]=Number.isFinite(state.life)
        ? Math.max(0,Math.round(state.life)) : (def.life||0);
      this.flags[i]=(def.ignition&&state.burning)?FLAG_BURNING:0;
    }
    this.wake(x,y);
    return true;
  }

  wake(x,y){
    for(let oy=-1;oy<=1;oy++) for(let ox=-1;ox<=1;ox++){
      const nx=x+ox, ny=y+oy;
      if(!this.inBounds(nx,ny)) continue;
      const i=this.index(nx,ny);
      const target=this.stepping?this.nextActive:this.active;
      const list=this.stepping?this.nextList:this.activeList;
      if(target[i]) continue;
      target[i]=1;
      list.push(i);
    }
  }

  emit(type,data={}){ this.events.push({type,tick:this.tick,...data}); }
  drainEvents(){ const out=this.events;this.events=[];return out; }

  _coords(i){ return [i%this.width,Math.floor(i/this.width)]; }

  _activateNext(i){
    if(i<0||i>=this.size||this.nextActive[i]) return;
    this.nextActive[i]=1;
    this.nextList.push(i);
  }

  _wakeNext(x,y){
    for(let oy=-1;oy<=1;oy++) for(let ox=-1;ox<=1;ox++){
      const nx=x+ox,ny=y+oy;
      if(this.inBounds(nx,ny)) this._activateNext(this.index(nx,ny));
    }
  }

  _copyCell(from,to){
    this.material[to]=this.material[from];
    this.temperature[to]=this.temperature[from];
    this.fuel[to]=this.fuel[from];
    this.life[to]=this.life[from];
    this.flags[to]=this.flags[from];
  }

  _clearCell(i){
    this.material[i]=0;
    this.temperature[i]=AMBIENT_TEMPERATURE;
    this.fuel[i]=0;
    this.life[i]=0;
    this.flags[i]=0;
  }

  _move(x,y,nx,ny){
    if(this.blocked(nx,ny)) return false;
    const a=this.index(x,y), b=this.index(nx,ny);
    if(!this.material[a]||this.material[b]) return false;
    const material=this.nameAt(a);
    this._copyCell(a,b);
    this._clearCell(a);
    this._wakeNext(x,y);
    this._wakeNext(nx,ny);
    if(this.emitMoves)this.emit('move',{material,from:[x,y,0],to:[nx,ny,0]});
    return true;
  }

  _swap(x,y,nx,ny){
    if(!this.inBounds(nx,ny)) return false;
    const a=this.index(x,y), b=this.index(nx,ny);
    if(!this.material[a]||!this.material[b]) return false;
    const tmp=[
      this.material[a],this.temperature[a],this.fuel[a],
      this.life[a],this.flags[a]
    ];
    this._copyCell(b,a);
    this.material[b]=tmp[0];
    this.temperature[b]=tmp[1];
    this.fuel[b]=tmp[2];
    this.life[b]=tmp[3];
    this.flags[b]=tmp[4];
    this._wakeNext(x,y);
    this._wakeNext(nx,ny);
    return true;
  }

  _canDisplace(a,b){
    const am=ID_TO_MATERIAL[this.material[a]];
    const bm=ID_TO_MATERIAL[this.material[b]];
    const ad=MATERIALS[am],bd=MATERIALS[bm];
    return ad&&bd&&['powder','liquid'].includes(ad.phase)
      &&['liquid','gas'].includes(bd.phase)&&ad.density>bd.density;
  }

  _tryMove(x,y,nx,ny){
    if(this.blocked(nx,ny)) return false;
    const a=this.index(x,y),b=this.index(nx,ny);
    if(!this.material[b]) return this._move(x,y,nx,ny);
    return this._canDisplace(a,b)?this._swap(x,y,nx,ny):false;
  }

  _sideOrder(x,y){
    return hash32(`${this.seed}:${this.tick}:${x}:${y}`)&1?[1,-1]:[-1,1];
  }

  _nearMaterial(x,y,name){
    const id=MATERIAL_IDS[name];
    return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{
      const nx=x+dx,ny=y+dy;
      return this.inBounds(nx,ny)&&this.material[this.index(nx,ny)]===id;
    });
  }

  _lavaWater(x,y,i){
    if(this.material[i]!==MATERIAL_IDS.lava) return false;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy;
      if(!this.inBounds(nx,ny)) continue;
      const n=this.index(nx,ny);
      if(this.material[n]!==MATERIAL_IDS.water) continue;
      this.set(x,y,'stone',{temperature:260});
      this.set(nx,ny,'steam',{temperature:140,life:12});
      this.emit('reaction',{reaction:'lava-water',at:[x,y,0],other:[nx,ny,0]});
      return true;
    }
    return false;
  }

  _phase(x,y,i){
    const id=this.material[i];
    if(id===MATERIAL_IDS.water&&this.temperature[i]>=100){
      this.emit('phase-change',{from:'water',to:'steam',at:[x,y,0]});
      this.set(x,y,'steam',{temperature:this.temperature[i],life:12});
      return true;
    }
    if(id===MATERIAL_IDS.steam&&this.temperature[i]<=82){
      this.emit('phase-change',{from:'steam',to:'water',at:[x,y,0]});
      this.set(x,y,'water',{temperature:this.temperature[i]});
      return true;
    }
    return false;
  }

  _igniteNeighbors(x,y){
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy;
      if(!this.inBounds(nx,ny)) continue;
      const i=this.index(nx,ny), name=this.nameAt(i), def=MATERIALS[name];
      if(!def?.ignition) continue;
      if(!(this.flags[i]&FLAG_BURNING)) this.emit('ignite',{material:name,at:[nx,ny,0]});
      this.flags[i]|=FLAG_BURNING;
      this.temperature[i]=Math.max(this.temperature[i],def.ignition+120);
      this._wakeNext(nx,ny);
    }
  }

  _fire(x,y,i){
    this._igniteNeighbors(x,y);
    this.life[i]=Math.max(0,this.life[i]-1);
    if(this.life[i]===0){
      this.set(x,y,'air');
      return true;
    }
    if(this._tryMove(x,y,x,y+1)) return true;
    for(const dx of this._sideOrder(x,y)){
      if(this._tryMove(x,y,x+dx,y)) return true;
    }
    this._wakeNext(x,y);
    return true;
  }

  _combust(x,y,i){
    const name=this.nameAt(i),def=MATERIALS[name];
    if(!def?.ignition) return false;
    const hot=this._nearMaterial(x,y,'fire')||this._nearMaterial(x,y,'lava');
    if(!(this.flags[i]&FLAG_BURNING)&&(hot||this.temperature[i]>=def.ignition)){
      this.flags[i]|=FLAG_BURNING;
      this.emit('ignite',{material:name,at:[x,y,0]});
    }
    if(!(this.flags[i]&FLAG_BURNING)) return false;
    this.fuel[i]=Math.max(0,this.fuel[i]-1);
    this.temperature[i]=Math.max(this.temperature[i],500);
    if(this.inBounds(x,y+1)&&!this.material[this.index(x,y+1)]){
      this.set(x,y+1,'fire');
    }
    if(this.fuel[i]===0){
      this.set(x,y,name==='wood'?'ash':'air',{temperature:160});
      return true;
    }
    this._wakeNext(x,y);
    return true;
  }

  _mobile(x,y,i){
    const name=this.nameAt(i),phase=MATERIALS[name]?.phase;
    const sides=this._sideOrder(x,y);
    if(phase==='powder'){
      if(this._tryMove(x,y,x,y-1)) return true;
      for(const dx of sides) if(this._tryMove(x,y,x+dx,y-1)) return true;
    }else if(phase==='liquid'){
      if(this._tryMove(x,y,x,y-1)) return true;
      for(const dx of sides) if(this._tryMove(x,y,x+dx,y)) return true;
    }else if(phase==='gas'){
      if(this._tryMove(x,y,x,y+1)) return true;
      for(const dx of sides) if(this._tryMove(x,y,x+dx,y)) return true;
    }
    return false;
  }

  _cool(i,x,y){
    const name=this.nameAt(i),def=MATERIALS[name];
    if(!def) return false;
    const before=this.temperature[i];
    if(Math.abs(before-AMBIENT_TEMPERATURE)<1) return false;
    const next=before+(AMBIENT_TEMPERATURE-before)*(def.conductivity||.03)*.12;
    this.temperature[i]=Math.round(next);
    if(this.temperature[i]===before) return false;
    this._wakeNext(x,y);
    return true;
  }

  _process(i){
    if(!this.material[i]) return false;
    const [x,y]=this._coords(i);
    if(this._lavaWater(x,y,i)) return true;
    if(this._phase(x,y,i)) return true;
    if(this.material[i]===MATERIAL_IDS.fire) return this._fire(x,y,i);
    let changed=this._combust(x,y,i);
    if(!this.material[i]) return true;
    if(this._mobile(x,y,i)) return true;
    if(this._cool(i,x,y)) changed=true;
    return changed;
  }

  step(options={}){
    const maxCells=Math.max(1,Number(options.maxCells)||this.size);
    const queue=this.activeList;
    this.activeList=[];
    this.active.fill(0);
    this.stepping=true;
    this.nextList=[];
    this.nextActive.fill(0);
    let processed=0,changed=0;
    for(const i of queue){
      if(processed>=maxCells){this._activateNext(i);continue;}
      if(!this.material[i]) continue;
      processed++;
      if(this._process(i)) changed++;
    }
    this.activeList=this.nextList;
    this.active.set(this.nextActive);
    this.nextList=[];
    this.stepping=false;
    this.tick++;
    return this.stats({processed,changed});
  }

  stats(extra={}){
    return {
      tick:this.tick,width:this.width,height:this.height,
      occupied:this.occupiedCount,active:this.activeList.length,
      emissive:this.emissiveCount,...extra
    };
  }

  forEachCell(fn){
    for(let i=0;i<this.size;i++){
      if(!this.material[i]) continue;
      const [x,y]=this._coords(i);
      fn(x,y,this.get(x,y),i);
    }
  }
}

module.exports = {
  DenseMatterGrid, MATERIAL_IDS, ID_TO_MATERIAL, FLAG_BURNING
};
