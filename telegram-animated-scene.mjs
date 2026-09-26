// A tiny deterministic pixel-art diorama of the actual D1 game state.
// No remote images, credentials, Canvas, libraries or GPU are needed in Workers.
export const WIDTH = 256, HEIGHT = 160;
const COLORS = [
  '#182b45','#90cde8','#67b5df','#e0eff2','#9facb7','#647d91','#eef4f4','#a1d37c',
  '#609c5c','#326a48','#7c513a','#ad8452','#e9c188','#335b80','#62bce3','#f5e9a5',
  '#f2b953','#bb6740','#894a3d','#b9c5cf','#687987','#2e6591','#6adafa','#ffad42',
  '#de563a','#fff5e2','#767782','#e6d35b','#b7e27c','#943e31','#8d9aaf','#ffefcf'
];
export const PALETTE = Uint8Array.from(COLORS.flatMap(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16))));
export const PROJECT_SLOTS=[[108,126],[171,124],[43,124],[108,148],[171,148],[43,148],
  [211,107],[7,107],[211,133],[7,133],[207,154],[8,154]];
const I = Object.freeze({
  ink:0,sky:1,skyLow:2,cloud:3,peak:4,rock:5,snow:6,grass:7,shade:8,tree:9,
  trunk:10,soil:11,sand:12,deep:13,water:14,shine:15,scaffold:16,brick:17,
  roof:18,metal:19,shadow:20,panel:21,glint:22,lava:23,fire:24,steam:25,
  smoke:26,crop:27,leaf:28,burnt:29,roofSide:30,light:31
});
const hash = s => {let n=2166136261;for(const c of String(s))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export class Surface {
  constructor(w=WIDTH,h=HEIGHT){this.w=w;this.h=h;this.p=new Uint8Array(w*h);}
  rect(x,y,w,h,color){
    const x0=clamp(Math.floor(x),0,this.w),y0=clamp(Math.floor(y),0,this.h);
    const x1=clamp(Math.ceil(x+w),0,this.w),y1=clamp(Math.ceil(y+h),0,this.h);
    for(let yy=y0;yy<y1;yy++)this.p.fill(color,yy*this.w+x0,yy*this.w+x1);
  }
  line(x0,y0,x1,y1,color){
    x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
    const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;
    let e=dx+dy;
    for(let i=0;i<500;i++){
      if(x0>=0&&x0<this.w&&y0>=0&&y0<this.h)this.p[y0*this.w+x0]=color;
      if(x0===x1&&y0===y1)break;
      const doubled=2*e;
      if(doubled>=dy){e+=dy;x0+=sx;}
      if(doubled<=dx){e+=dx;y0+=sy;}
    }
  }
  poly(points,color){
    const ys=points.map(p=>p[1]),low=clamp(Math.floor(Math.min(...ys)),0,this.h);
    const high=clamp(Math.ceil(Math.max(...ys)),0,this.h);
    for(let y=low;y<high;y++){
      const crossings=[];
      for(let j=0;j<points.length;j++){
        const a=points[j],b=points[(j+1)%points.length],cy=y+0.5;
        if((a[1]<=cy&&b[1]>cy)||(b[1]<=cy&&a[1]>cy))
          crossings.push(a[0]+(cy-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      crossings.sort((a,b)=>a-b);
      for(let j=0;j+1<crossings.length;j+=2)
        this.rect(Math.ceil(crossings[j]),y,Math.floor(crossings[j+1])-Math.ceil(crossings[j])+1,1,color);
    }
  }
  disc(cx,cy,r,color){
    for(let y=-r;y<=r;y++)this.rect(cx-Math.sqrt(r*r-y*y),cy+y,2*Math.sqrt(r*r-y*y)+1,1,color);
  }
}
function mountain(s,x,top,wide,color,highlight){
  s.poly([[x-wide,80],[x,top],[x+wide,80]],color);
  s.poly([[x,top],[x+wide,80],[x+wide*.14,80]],highlight);
  s.poly([[x,top],[x-8,top+14],[x+7,top+13]],I.snow);
}
function tree(s,x,y,healthy=true){
  s.rect(x-1,y-4,3,9,I.trunk);
  s.poly([[x-8,y-3],[x,y-19],[x+8,y-3]],healthy?I.tree:I.burnt);
  s.poly([[x-5,y-10],[x,y-20],[x+4,y-10]],healthy?I.leaf:I.brick);
}
function house(s,x,y,floors){
  const h=7+floors*3;
  s.rect(x,y-h,14,h,I.metal);
  s.poly([[x,y-h],[x+4,y-h-5],[x+18,y-h-5],[x+14,y-h]],I.roof);
  s.poly([[x+14,y-h],[x+18,y-h-5],[x+18,y-4],[x+14,y]],I.roofSide);
  for(let a=3;a<h-2;a+=6){s.rect(x+3,y-h+a,3,3,I.panel);s.rect(x+9,y-h+a,3,3,I.panel);}
}
function structure(s,p,x,y,frame){
  const name=String(p.type||''),active=!!p.active;
  s.rect(x-2,y-2,29,3,I.soil);
  if(!active){
    s.rect(x,y-3,26,6,I.scaffold);
    for(let j=1;j<=3;j++){s.line(x+j*7,y-3,x+j*7,y+3,I.ink);}
    s.line(x+3,y-3,x+3,y-21,I.brick);
    s.line(x+3,y-21,x+20,y-21,I.brick);
    s.line(x+20,y-21,x+20+frame%2,y-13,I.ink);
    s.disc(x+20+frame%2,y-13,2,I.scaffold);
    return;
  }
  const farm=/farm|greenhouse|livestock|biofuel/.test(name);
  const water=/water|well|desalin|bottling/.test(name);
  const power=/solar|coal|geothermal/.test(name);
  if(farm){
    s.poly([[x,y-2],[x+19,y-8],[x+28,y-2],[x+9,y+4]],I.soil);
    for(let j=0;j<4;j++){
      s.line(x+2+j*6,y-2,x+11+j*4,y+1,I.crop);
      s.disc(x+6+j*5,y-4-frame%2,2,I.leaf);
    }
    if(name==='greenhouse')s.poly([[x,y-4],[x+12,y-15],[x+25,y-4]],I.glint);
    return;
  }
  if(water){
    s.rect(x,y-12,23,12,I.metal);
    s.rect(x+2,y-13,19,4,I.glint);
    s.disc(x+5+(frame*3)%18,y-3,3,I.water);
    s.line(x+4,y-3,x+20,y-3,I.deep);
    return;
  }
  if(name==='solar'){
    s.poly([[x,y-6],[x+19,y-17],[x+27,y-10],[x+8,y+1]],I.panel);
    for(let j=0;j<3;j++)s.line(x+j*7,y-6-j*4,x+j*7+8,y+1-j*4,I.glint);
    s.line(x+9,y-3,x+9,y+5,I.metal);
    if(frame%2===0)s.disc(x+24,y-19,2,I.shine);
    return;
  }
  const chimney=power&&name!=='solar';
  s.rect(x,y-14,24,14,name==='workshop'?I.brick:I.metal);
  s.poly([[x,y-14],[x+8,y-20],[x+30,y-20],[x+24,y-14]],I.roof);
  s.poly([[x+24,y-14],[x+30,y-20],[x+30,y-6],[x+24,y]],I.roofSide);
  s.rect(x+4,y-9,5,6,I.panel);
  s.rect(x+14,y-9,5,6,I.glint);
  if(chimney){
    s.rect(x+17,y-33,6,18,name==='coal'?I.brick:I.metal);
    s.rect(x+16,y-34,8,3,I.ink);
    for(let j=0;j<3;j++)s.disc(x+19+j*2,y-39-j*6-(frame*3)%6,2+j,name==='coal'?I.smoke:I.steam);
    if(name==='geothermal')s.rect(x+2,y-3,16,2,I.lava);
  }
  if(name==='festival'||name==='temple'){
    s.line(x+12,y-20,x+12,y-35,I.ink);
    s.poly([[x+12,y-34],[x+23,y-29],[x+12,y-27]],frame%2?I.fire:I.scaffold);
  }
}
function featured(s,p,frame){
  s.rect(151,54,105,106,I.ink);
  const background=p.active&&p.type==='coal'?I.smoke:p.active&&p.type==='geothermal'?I.rock:I.skyLow;
  s.rect(154,57,99,65,background);
  s.rect(154,122,99,34,p.active?I.shade:I.soil);
  s.rect(154,57,99,4,p.active?I.glint:I.scaffold);
  if(p.active&&p.type==='solar')s.disc(231,79,7,I.shine);
  const sprite=new Surface(36,50);
  const tall=p.active&&(p.type==='coal'||p.type==='geothermal');
  structure(sprite,p,4,tall?45:31,frame);
  for(let yy=0;yy<50;yy++)for(let xx=0;xx<36;xx++){
    const color=sprite.p[yy*36+xx];if(!color)continue;
    const at=(57+yy*2)*WIDTH+165+xx*2;
    if(at<0||at+WIDTH+1>=s.p.length)continue;
    s.p[at]=color;s.p[at+1]=color;s.p[at+WIDTH]=color;s.p[at+WIDTH+1]=color;
  }
  const duration=Math.max(1,Number(p.intent?.timeline)||2);
  const done=p.active?duration:Math.max(0,duration-(Number(p.remaining)||0));
  s.rect(164,149,80,7,I.ink);
  s.rect(166,151,Math.min(76,Math.round(76*done/duration)),3,p.active?I.glint:I.scaffold);
}
function ground(s,world,frame){
  const r=world.resources||{},ecology=Number(r.ecology??75);
  s.rect(0,76,WIDTH,84,ecology<25?I.soil:I.grass);
  s.poly([[0,82],[80,73],[150,84],[256,76],[256,99],[0,104]],I.shade);
  const seed=hash(world.seed||'world');
  for(let i=0;i<15;i++){
    const x=(seed+i*49)%WIDTH,y=81+(seed>>>i%12)%18;
    tree(s,x,y,ecology>=30);
  }
  s.rect(0,110,WIDTH,8,I.soil);s.rect(0,115,WIDTH,2,I.sand);
  for(let i=0;i<16;i++)s.rect(i*17+4,113,8,1,I.shine);
  s.rect(0,138,WIDTH,6,I.soil);s.rect(0,143,WIDTH,2,I.sand);
  if(world.land?.coast){
    const shallow=Number(r.water??65)<20;
    s.rect(0,150,WIDTH,10,shallow?I.sand:I.deep);
    if(!shallow){
      s.rect(0,153+(frame%2),WIDTH,5,I.water);
      for(let i=0;i<15;i++)s.rect((i*23+frame*5)%WIDTH,155+i%4,9,1,I.glint);
    }
  }
}
function scenery(s,world,frame){
  const r=world.resources||{},night=Number(world.tick||0)%8>=6,sky=night?I.deep:I.sky;
  s.rect(0,0,WIDTH,77,sky);
  s.rect(0,45,WIDTH,25,night?I.rock:I.skyLow);
  const n=hash(world.seed||'world');
  for(let i=0;i<3;i++){
    let x=(n+i*101+frame*3)%320-35;
    s.disc(x,12+i*12,7,I.cloud);
    s.disc(x+7,11+i*12,5,I.cloud);
  }
  mountain(s,30,29,57,I.peak,I.rock);
  mountain(s,190,14,91,I.rock,I.peak);
  if(world.land?.volcano){
    mountain(s,122,13,46,I.rock,I.peak);
    s.poly([[111,32],[121,16],[127,36]],I.lava);
    s.line(121,22,125,49,I.fire);
    for(let i=0;i<3;i++)s.disc(119+i*7,11-(frame*3+i*5)%20,3,I.smoke);
  }
  if(world.crisis||Number(r.health||75)<20){
    for(let i=0;i<9;i++)s.rect((n+i*29)%WIDTH,25+i%4*13,13,2,I.fire);
  }
}
export function renderWorldFrame(world,frame=0){
  const s=new Surface();
  scenery(s,world,frame);
  ground(s,world,frame);
  for(const h of world.houses||[])
    house(s,12+(Number(h.x)||0)*2.6,102+(Number(h.z)||0)/12,Number(h.floors)||2);
  const projects=Array.isArray(world.projects)?world.projects:[];
  const recent=projects.slice(-12);
  for(let i=0;i<recent.length;i++){
    const slot=(projects.length-recent.length+i)%PROJECT_SLOTS.length;
    const [x,y]=PROJECT_SLOTS[slot];
    structure(s,recent[i],x,y,frame);
    if(i===recent.length-1){
      const highlight=frame%2?I.shine:I.scaffold;
      s.rect(x-4,y-38,32,2,highlight);
      s.rect(x-4,y+5,32,2,highlight);
      s.rect(x-4,y-37,2,42,highlight);
      s.rect(x+26,y-37,2,42,highlight);
    }
  }
  if(projects.length)featured(s,projects.at(-1),frame);
  s.rect(0,0,WIDTH,3,world.crisis?I.fire:I.shine);
  return s.p;
}
export function animateWorldFrame(world,first){
  const s=new Surface();s.p=first.slice();
  s.rect(0,0,WIDTH,3,world.crisis?I.fire:I.glint);
  if(world.land?.coast&&Number(world.resources?.water??65)>=20){
    for(let j=0;j<14;j++)s.rect((j*19+11)%WIDTH,154+j%5,10,1,I.shine);
  }
  const shown=world.projects?.slice(-12)||[];
  if(shown.length){
    const p=shown.at(-1),slot=(world.projects.length-1)%PROJECT_SLOTS.length;
    featured(s,p,1);
    const [x,y]=PROJECT_SLOTS[slot];
    s.rect(x-4,y-38,32,2,I.shine);
    if(!p.active)s.disc(x+24,y-13,3,I.shine);
    else if(p.type==='solar')s.disc(x+20,y-17,3,I.shine);
    else if(p.type==='coal'||p.type==='geothermal')s.disc(x+23,y-43,4,p.type==='coal'?I.smoke:I.steam);
    else s.rect(x+5,y-10,12,2,I.shine);
  }
  return s.p;
}
