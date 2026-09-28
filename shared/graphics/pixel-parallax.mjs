/** Original procedural pixel-art parallax for World Server. No external images or dependencies. */
export const DEPTH = Object.freeze({sky:0,clouds:0.12,skyline:0.27,city:0.55,foreground:1});
export const PALETTE = Object.freeze({sky:'#344c56',haze:'#79939a',cloud:'#9baab0',distant:'#536b74',skyline:'#354751',city:'#24353f',front:'#172b34',wall:'#698087',window:'#ffc47b',windowDim:'#dc9262',ink:'#152932'});
const W=480,H=270,TILE=960;
export function wrapOffset(position,period){
 if(!Number.isFinite(position)||!Number.isFinite(period)||period<=0)throw new RangeError('finite position and positive period required');
 return ((position%period)+period)%period;
}
export function layerOffset(cameraX,depth,period=TILE){
 if(!Number.isFinite(depth)||depth<0)throw new RangeError('depth must be non-negative');
 return wrapOffset(cameraX*depth,period);
}
export function seededRandom(seed=7319){
 let state=(seed>>>0)||1;
 return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296};
}
function rect(ctx,color,x,y,w,h){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}
function stroke(ctx,color,width,points){
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...points[0]);
 for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.stroke();
}
function layerCanvas(){
 const c=document.createElement('canvas');c.width=TILE;c.height=H;
 const ctx=c.getContext('2d',{alpha:true});ctx.imageSmoothingEnabled=false;
 return {canvas:c,ctx};
}
function makeClouds(ctx,rng){
 for(let i=0;i<36;i++){
  const x=Math.floor(rng()*TILE),y=24+Math.floor(rng()*70),width=20+Math.floor(rng()*54);
  rect(ctx,'#7e969e',x+4,y+5,width,4);
  rect(ctx,'#b5c0bc',x+10,y+1,width-18,5);
  rect(ctx,'#98aeb0',x,y+5,width+9,6);
  rect(ctx,'#6c8994',x+7,y+11,width-5,2);
 }
}
function makeSkyline(ctx,rng){
 rect(ctx,'#607880',0,170,TILE,50);
 for(let x=0;x<TILE;){
  const width=24+Math.floor(rng()*48),height=30+Math.floor(rng()*65),y=203-height;
  rect(ctx,'#506972',x,y,width-3,height);
  rect(ctx,'#3b535d',x,y,width-3,2);
  for(let wx=x+5;wx<x+width-5;wx+=9)for(let wy=y+9;wy<196;wy+=12)
   if(rng()<0.4)rect(ctx,rng()<0.3?'#a6a09a':'#81939a',wx,wy,3,5);
  x+=width;
 }
}
function makeCity(ctx,rng){
 for(let x=0;x<TILE;){
  const width=43+Math.floor(rng()*48),floors=2+Math.floor(rng()*4),height=floors*24+10,y=217-height;
  const base=['#253741','#293f49','#334650','#2b3a45'][Math.floor(rng()*4)];
  rect(ctx,'#172c36',x-2,y+3,width,height);rect(ctx,base,x,y,width-4,height);
  rect(ctx,'#43535a',x-2,y,width,4);
  for(let row=0;row<floors;row++)for(let col=0;col<Math.floor((width-10)/17);col++){
   const wx=x+8+col*17,wy=y+11+row*23,lit=rng()>0.29;
   rect(ctx,'#122a34',wx-1,wy-1,10,14);
   rect(ctx,lit?(rng()>.35?'#f5b36f':'#d88c60'):'#50606a',wx,wy,8,11);
   if(lit)rect(ctx,'#ffe0a1',wx+1,wy+1,2,8);
   rect(ctx,'#263d45',wx+4,wy,1,11);
  }
  if(rng()>.52){rect(ctx,'#1b3038',x+width/2,y-14,2,14);rect(ctx,'#2b434c',x+width/2-5,y-12,12,2);}
  x+=width-3;
 }
}
function makeForeground(ctx,rng){
 for(let x=14;x<TILE;x+=125){
  rect(ctx,'#172b32',x,123,3,88);rect(ctx,'#172b32',x-8,130,20,3);rect(ctx,'#172b32',x-5,139,15,2);
 }
 for(let x=16;x<TILE-120;x+=125){
  stroke(ctx,'#1a3038',1,[[x,132],[x+33,145],[x+75,151],[x+125,130]]);
  stroke(ctx,'#172a32',1,[[x,139],[x+50,157],[x+92,156],[x+125,138]]);
 }
 rect(ctx,'#223942',0,204,TILE,4);rect(ctx,'#738e95',0,208,TILE,62);
 for(let x=0;x<TILE;x+=42)for(let y=208;y<H;y+=36){
  rect(ctx,'#3d5963',x,y,1,34);
  rect(ctx,'#a0b5b9',x+2,y+1,38,33);
  rect(ctx,'#839ca5',x+2,y+1,19,33);
  ctx.fillStyle='#b6c7c7';ctx.beginPath();ctx.moveTo(x+2,y+1);ctx.lineTo(x+40,y+1);ctx.lineTo(x+21,y+17);ctx.closePath();ctx.fill();
  ctx.fillStyle='#577780';ctx.beginPath();ctx.moveTo(x+2,y+33);ctx.lineTo(x+40,y+33);ctx.lineTo(x+21,y+17);ctx.closePath();ctx.fill();
 }
 rect(ctx,'#101e27',0,200,TILE,3);
 for(let x=0;x<TILE;x+=18){
  stroke(ctx,'#152832',2,[[x,200],[x+3,189],[x+9,188],[x+14,195],[x+18,201]]);
  stroke(ctx,'#14242d',1,[[x+2,190],[x+8,186],[x+13,192],[x+18,197]]);
  stroke(ctx,'#172b33',1,[[x+5,201],[x+15,186]]);
 }
 for(let i=0;i<90;i++)rect(ctx,'#58757c',Math.floor(rng()*TILE),230+Math.floor(rng()*40),1,1);
}
function makeLayers(seed){
 const r=seededRandom(seed),entries=[];
 for(const [name,painter]of [['clouds',makeClouds],['skyline',makeSkyline],['city',makeCity],['foreground',makeForeground]]){
  const l=layerCanvas();painter(l.ctx,r);entries.push({name,texture:l.canvas,depth:DEPTH[name]});
 }
 return entries;
}
function paintSky(ctx,t){
 rect(ctx,PALETTE.sky,0,0,W,H);rect(ctx,'#3c5660',0,79,W,129);rect(ctx,'#4e6970',0,155,W,52);
 const r=seededRandom(777);
 for(let i=0;i<93;i++){
  const x=Math.floor(r()*W),y=Math.floor(r()*151),alpha=0.45+r()*0.45;
  ctx.globalAlpha=alpha*(0.8+0.2*Math.sin(t*1.4+i));rect(ctx,'#e1ece7',x,y,1,1);
 }
 ctx.globalAlpha=1;
}
function paintWalker(ctx,x,y,t,scale=1){
 const step=Math.sin(t*7),leg=Math.round(3*step);
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);
 rect(ctx,'#0e252f',-3,-17,7,10);rect(ctx,'#263e49',-2,-16,6,7);
 rect(ctx,'#c1a58c',-1,-21,4,4);rect(ctx,'#172d38',-3,-22,6,2);
 stroke(ctx,'#0e222c',2,[[-1,-7],[-3+leg,0]]);
 stroke(ctx,'#0e222c',2,[[2,-7],[4-leg,0]]);
 stroke(ctx,'#152933',2,[[-2,-14],[-5-leg/2,-7]]);
 ctx.restore();
}
function drawRepeat(ctx,texture,offset){
 const sx=Math.round(offset);
 for(let x=-sx;x<W;x+=TILE)ctx.drawImage(texture,x,0);
}
/** Browser adapter. setCamera controls the same horizontal camera as Godot Parallax2D. */
export function createPixelParallax(canvas,{seed=7319,reducedMotion=false}={}){
 if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('canvas required');
 const ctx=canvas.getContext('2d',{alpha:false}),stage=document.createElement('canvas');
 stage.width=W;stage.height=H;
 const g=stage.getContext('2d',{alpha:false});g.imageSmoothingEnabled=false;
 const layers=makeLayers(seed),snow=Array.from({length:45},(_,i)=>({x:(i*113)%W,y:(i*53)%H,s:1+(i%3)}));
 let cameraX=0,running=true,last=0,frame=0,snowEnabled=true,raf=0;
 const stopMotion=!!reducedMotion;
 function resize(){
  const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.max(1,Math.round(canvas.clientWidth*dpr));
  canvas.height=Math.max(1,Math.round(canvas.clientHeight*dpr));
  ctx.imageSmoothingEnabled=false;
 }
 function render(now=0){
  const delta=last?Math.min((now-last)/1000,0.05):0;last=now;
  if(running&&!stopMotion)frame+=delta;
  paintSky(g,frame);
  for(const {name,texture,depth}of layers){
   const wind=name==='clouds'?frame*2:0;
   drawRepeat(g,texture,layerOffset(cameraX+wind,depth));
  }
  for(let i=0;i<3;i++){
   const base=i*178+42,x=wrapOffset(base+frame*(i%2?7:11)-cameraX*1.08,W+25)-12;
   paintWalker(g,x,243+(i%2)*8,frame+i,i%2?0.8:1);
  }
  if(snowEnabled)for(const p of snow){
   const sx=wrapOffset(p.x+frame*(p.s*2)-cameraX*0.04,W);
   const sy=wrapOffset(p.y+frame*(p.s*5),H);
   rect(g,'#d8e5e4',sx,sy,1,1);
  }
  const zoom=Math.max(canvas.width/W,canvas.height/H),outW=Math.ceil(W*zoom),outH=Math.ceil(H*zoom);
  ctx.drawImage(stage,Math.floor((canvas.width-outW)/2),Math.floor((canvas.height-outH)/2),outW,outH);
  if(!stopMotion)raf=requestAnimationFrame(render);
 }
 resize();render(0);
 return{
  setCamera(x){if(!Number.isFinite(x))throw new RangeError('camera must be finite');cameraX=x;if(stopMotion)render(0);},
  getCamera(){return cameraX;},
  pan(delta){if(Number.isFinite(delta))cameraX+=delta;if(stopMotion)render(0);},
  setSnow(enabled){snowEnabled=Boolean(enabled);if(stopMotion)render(0);},
  setPaused(paused){running=!paused;last=0;},
  resize,
  dispose(){cancelAnimationFrame(raf);}
 };
}