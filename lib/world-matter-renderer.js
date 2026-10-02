'use strict';

const { MATERIALS } = require('./world-matter-engine');

const PALETTE=Object.freeze({
  stone:['#586474','#657385','#748294'],
  sand:['#d5ad55','#e7c86f','#f0d885'],
  water:['#2d79cf','#3f99ed','#67b8ff'],
  oil:['#5c4728','#765a31','#8c6b39'],
  wood:['#7b3f25','#9b5730','#b86c3b'],
  steam:['#b9cfda','#d7e9ef','#eef8fb'],
  fire:['#ff4a1f','#ff8a32','#ffe071'],
  lava:['#e83218','#ff4b24','#ff9a2b'],
  ash:['#555b62','#6b7279','#858b91']
});

function hashColorIndex(x,y,name){
  let h=(x*73856093)^(y*19349663);
  for(let i=0;i<name.length;i++)h=Math.imul(h^name.charCodeAt(i),16777619);
  return Math.abs(h)%3;
}

class MatterPixelRenderer{
  constructor(canvas,camera,options={}){
    if(!canvas)throw new Error('MatterPixelRenderer needs a canvas');
    this.canvas=canvas;
    this.ctx=canvas.getContext('2d',{alpha:false});
    this.camera=camera;
    this.background=options.background||'#07101a';
    this.lightBudget=Math.max(8,Number(options.lightBudget)||180);
    this.glowCanvas=document.createElement('canvas');
    this.glowCtx=this.glowCanvas.getContext('2d');
    this.lastStats={cells:0,emissive:0,lights:0};
    this.resize(canvas.clientWidth||canvas.width||640,canvas.clientHeight||canvas.height||360);
  }

  resize(width,height,dpr=Math.min(devicePixelRatio||1,2)){
    this.width=Math.max(1,Math.round(width));
    this.height=Math.max(1,Math.round(height));
    this.dpr=dpr;
    this.canvas.width=Math.round(this.width*dpr);
    this.canvas.height=Math.round(this.height*dpr);
    this.canvas.style.width=this.width+'px';
    this.canvas.style.height=this.height+'px';
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.glowCanvas.width=Math.round(this.width*dpr);
    this.glowCanvas.height=Math.round(this.height*dpr);
    this.glowCtx.setTransform(dpr,0,0,dpr,0,0);
    this.camera.resize(this.width,this.height);
  }

  _style(cell,x,y){
    const colors=PALETTE[cell.material]||['#fff','#ddd','#bbb'];
    return colors[hashColorIndex(x,y,cell.material)];
  }

  _drawCell(ctx,x,y,cell,alpha=1){
    const scale=this.camera.cellPixels();
    const p=this.camera.worldToScreen(x,y+1);
    const px=Math.floor(p.x),py=Math.floor(p.y);
    ctx.globalAlpha=alpha;
    ctx.fillStyle=this._style(cell,x,y);
    ctx.fillRect(px,py,Math.ceil(scale+.25),Math.ceil(scale+.25));
    ctx.globalAlpha=1;
  }

  _drawEmitter(x,y,cell,index){
    const emission=Math.max(cell.emission||0,MATERIALS[cell.material]?.emission||0);
    if(emission<=0)return 0;
    const g=this.glowCtx;
    const scale=this.camera.cellPixels();
    const p=this.camera.worldToScreen(x+.5,y+.5);
    const r=scale*(cell.material==='fire'?5.5:4.2);
    g.globalCompositeOperation='lighter';
    g.globalAlpha=Math.min(1,.22+emission*.45);
    g.fillStyle=this._style(cell,x,y);
    g.fillRect(
      Math.floor(p.x-scale*.5),Math.floor(p.y-scale*.5),
      Math.ceil(scale),Math.ceil(scale)
    );
    if(index>=this.lightBudget)return 0;
    const grad=g.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
    grad.addColorStop(0,cell.material==='fire'?'rgba(255,185,75,.26)':'rgba(255,83,25,.24)');
    grad.addColorStop(.45,cell.material==='fire'?'rgba(255,92,28,.12)':'rgba(255,62,18,.10)');
    grad.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=grad;
    g.beginPath();
    g.arc(p.x,p.y,r,0,Math.PI*2);
    g.fill();
    return 1;
  }

  _iterate(source,fn){
    if(Array.isArray(source)){
      for(const layer of source)this._iterate(layer,fn);
      return;
    }
    if(source?.forEachCell){
      source.forEachCell((x,y,cell)=>fn(x,y,cell));
      return;
    }
    if(source?.snapshot){
      for(const item of source.snapshot()){
        const [x,y,z]=item.position.split(',').map(Number);
        if(z===0)fn(x,y,item);
      }
    }
  }

  _drawRigid(rigid){
    if(!rigid?.renderSnapshot)return;
    for(const cluster of rigid.renderSnapshot()){
      for(const cell of cluster.cells){
        const fake={material:cell.material,emission:MATERIALS[cell.material]?.emission||0};
        this._drawCell(this.ctx,cell.x,cell.y,fake);
      }
    }
  }

  render(source,options={}){
    const ctx=this.ctx,g=this.glowCtx;
    ctx.imageSmoothingEnabled=false;
    ctx.fillStyle=this.background;
    ctx.fillRect(0,0,this.width,this.height);
    g.clearRect(0,0,this.width,this.height);
    let cells=0,emissive=0,lights=0;
    this._iterate(source,(x,y,cell)=>{
      const bounds=this.camera.visibleBounds(3);
      if(x<bounds.minX||x>bounds.maxX||y<bounds.minY||y>bounds.maxY)return;
      const alpha=cell.material==='steam'?.48:cell.material==='water'?.88:1;
      this._drawCell(ctx,x,y,cell,alpha);
      cells++;
      if((cell.emission||MATERIALS[cell.material]?.emission||0)>0){
        emissive++;
        lights+=this._drawEmitter(x,y,cell,lights);
      }
      if(cell.burning&&cell.material!=='fire'){
        const p=this.camera.worldToScreen(x+.5,y+1);
        ctx.fillStyle='#ffd75a';
        ctx.fillRect(
          Math.floor(p.x-this.camera.cellPixels()*.2),
          Math.floor(p.y-this.camera.cellPixels()*.35),
          Math.max(1,Math.ceil(this.camera.cellPixels()*.4)),
          Math.max(1,Math.ceil(this.camera.cellPixels()*.35))
        );
      }
    });
    this._drawRigid(options.rigid);
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.95;
    ctx.filter=`blur(${Math.max(2,this.camera.cellPixels()*1.7)}px)`;
    ctx.drawImage(this.glowCanvas,0,0,this.width,this.height);
    ctx.restore();
    if(options.particles)options.particles.draw(ctx,this.camera);
    if(Array.isArray(options.entities)){
      for(const entity of options.entities)entity.draw?.(ctx,this.camera);
    }
    this.lastStats={cells,emissive,lights};
    return this.lastStats;
  }
}

module.exports={MatterPixelRenderer,PALETTE};
