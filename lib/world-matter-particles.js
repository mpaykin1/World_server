'use strict';

function hash32(value){
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function unit(seed){return (hash32(seed)&0xffffff)/0xffffff;}

const PRESETS=Object.freeze({
  spark:{life:.42,speed:10,gravity:-5,size:.65,color:'#ffe66d',blend:'lighter'},
  ember:{life:.85,speed:5,gravity:2,size:.75,color:'#ff7a32',blend:'lighter'},
  cross:{life:1.2,speed:3,gravity:0,size:1.1,color:'#d8ff55',blend:'lighter'},
  smoke:{life:1.5,speed:1.8,gravity:1.4,size:1.5,color:'#9aa3ad',blend:'source-over'},
  steam:{life:1.1,speed:2.5,gravity:2.2,size:1.1,color:'#d9f2ff',blend:'source-over'},
  debris:{life:.9,speed:7,gravity:-16,size:.8,color:'#9b8a74',blend:'source-over'},
  droplet:{life:.75,speed:5,gravity:-12,size:.6,color:'#7cc8ff',blend:'source-over'}
});

class MatterParticleSystem{
  constructor(options={}){
    this.max=Math.max(32,Number(options.max)||1800);
    this.seed=Number(options.seed)||1;
    this.serial=0;
    this.particles=[];
  }

  _rand(tag){return unit(`${this.seed}:${this.serial}:${tag}`);}

  emit(type,x,y,count=1,options={}){
    const preset=PRESETS[type]||PRESETS.spark;
    const n=Math.min(count,Math.max(0,this.max-this.particles.length));
    for(let i=0;i<n;i++){
      this.serial++;
      const a=(this._rand('a')*2-1)*(options.spread??Math.PI);
      const speed=(options.speed??preset.speed)*(.45+this._rand('s')*.8);
      const upward=options.upward??0;
      this.particles.push({
        type,x,y,
        vx:Math.cos(a)*speed+(options.vx||0),
        vy:Math.sin(a)*speed+upward+(options.vy||0),
        life:(options.life??preset.life)*(.7+this._rand('l')*.6),
        maxLife:options.life??preset.life,
        gravity:options.gravity??preset.gravity,
        size:(options.size??preset.size)*(.7+this._rand('z')*.6),
        color:options.color||preset.color,
        blend:options.blend||preset.blend,
        rotation:this._rand('r')*Math.PI,
        spin:(this._rand('p')*2-1)*4
      });
    }
  }

  consume(events=[]){
    for(const e of events){
      const p=e.at||e.other;
      if(!p) continue;
      const [x,y]=p;
      if(e.type==='ignite'){
        this.emit('ember',x,y,5,{upward:3,spread:2.4});
        this.emit('spark',x,y,3,{upward:4});
      }else if(e.type==='reaction'&&e.reaction==='lava-water'){
        this.emit('steam',x,y,14,{upward:4,spread:1.5});
        this.emit('spark',x,y,9,{upward:5});
      }else if(e.type==='phase-change'&&e.to==='steam'){
        this.emit('steam',x,y,5,{upward:2});
      }else if(e.type==='fracture'){
        this.emit('debris',x,y,8,{upward:4});
      }else if(e.type==='detach'){
        this.emit('debris',x,y,Math.min(18,Math.max(5,e.count||5)),{upward:2});
      }else if(e.type==='cluster-shatter'){
        this.emit('debris',x,y,22,{upward:7,speed:10});
      }
    }
  }

  ambientFromMatter(source,budget=8){
    let emitted=0;
    if(!source?.forEachCell)return;
    source.forEachCell((x,y,cell)=>{
      if(emitted>=budget)return;
      if(cell.material==='fire'){
        this.emit('ember',x,y,1,{upward:2.5,spread:1});
        emitted++;
      }else if(cell.material==='lava'&&this.serial%3===0){
        this.emit('spark',x,y,1,{upward:1.5,spread:.8});
        emitted++;
      }
    });
  }

  step(dt){
    const alive=[];
    for(const p of this.particles){
      p.life-=dt;
      if(p.life<=0)continue;
      p.vy+=p.gravity*dt;
      p.x+=p.vx*dt;
      p.y+=p.vy*dt;
      p.rotation+=p.spin*dt;
      alive.push(p);
    }
    this.particles=alive;
    return alive.length;
  }

  draw(ctx,camera){
    ctx.save();
    for(const p of this.particles){
      const q=camera.worldToScreen(p.x,p.y);
      const alpha=Math.max(0,Math.min(1,p.life/Math.max(.001,p.maxLife)));
      const s=Math.max(1,p.size*camera.cellPixels());
      ctx.globalCompositeOperation=p.blend;
      ctx.globalAlpha=alpha;
      ctx.fillStyle=p.color;
      if(p.type==='cross'){
        ctx.fillRect(q.x-s*.18,q.y-s,s*.36,s*2);
        ctx.fillRect(q.x-s,q.y-s*.18,s*2,s*.36);
      }else{
        ctx.beginPath();
        ctx.arc(q.x,q.y,s*.45,0,Math.PI*2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  stats(){return{count:this.particles.length,max:this.max};}
}

module.exports={MatterParticleSystem,PRESETS};
