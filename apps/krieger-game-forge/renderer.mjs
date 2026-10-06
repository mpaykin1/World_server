function shade(hex,factor){
  const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  const f=v=>Math.max(0,Math.min(255,Math.round(v*factor)));
  return "rgb("+f(r)+","+f(g)+","+f(b)+")";
}
function polygon(ctx,pts,fill,stroke="rgba(255,255,255,.06)",lw=1){
  ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
  ctx.closePath();ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke()}
}
function line(ctx,a,b,color,lw=1){
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
  ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.stroke();
}
function glow(ctx,x,y,r,color){
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,color);g.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
}
export class ForgeRenderer{
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext("2d",{alpha:false});
    this.dpr=Math.min(2,devicePixelRatio||1);this.recipe=null;this.runtime=null;
    this.resize=()=>this.doResize();addEventListener("resize",this.resize);this.doResize();
  }
  doResize(){
    this.w=innerWidth;this.h=innerHeight;
    this.canvas.width=this.w*this.dpr;this.canvas.height=this.h*this.dpr;
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    this.unit=Math.max(7,Math.min(13,Math.min(this.w,this.h)/60));
  }
  setRecipe(recipe){this.recipe=recipe}
  setRuntime(runtime){this.runtime=runtime}
  project(x,y,z){
    const p=this.runtime?.player||{x:0,z:0};
    const dx=x-p.x,dz=z-p.z,u=this.unit;
    return{x:this.w*.53+(dx-dz)*u*.72,y:this.h*.56+(dx+dz)*u*.34-y*u*.82};
  }
  aimFromScreen(x,y){
    const p=this.runtime?.player||{x:0,z:0},u=this.unit||10;
    const sx=(x-this.w*.53)/(u*.72),sy=(y-this.h*.56)/(u*.34);
    const dx=(sx+sy)/2,dz=(sy-sx)/2;
    const l=Math.hypot(dx,dz)||1;return{x:dx/l,z:dz/l,worldX:p.x+dx,worldZ:p.z+dz};
  }
  drawGrid(){
    const c=this.ctx,u=this.unit,p=this.runtime.player,range=45,step=5;
    c.fillStyle=this.recipe?.metadata?.preset==="reactor"?"#071015":"#080b10";c.fillRect(0,0,this.w,this.h);
    const horizon=c.createLinearGradient(0,0,0,this.h);horizon.addColorStop(0,"rgba(52,73,92,.18)");horizon.addColorStop(.7,"rgba(0,0,0,0)");
    c.fillStyle=horizon;c.fillRect(0,0,this.w,this.h);
    c.lineWidth=1;c.strokeStyle="rgba(140,166,190,.075)";
    const bx=Math.floor(p.x/step)*step,bz=Math.floor(p.z/step)*step;
    for(let i=-range;i<=range;i+=step){
      line(c,this.project(bx+i,0,bz-range),this.project(bx+i,0,bz+range),"rgba(140,166,190,.06)");
      line(c,this.project(bx-range,0,bz+i),this.project(bx+range,0,bz+i),"rgba(140,166,190,.06)");
    }
    const center=this.project(0,0,0);glow(c,center.x,center.y,8*u,"rgba(58,135,180,.035)");
  }
  drawCube(obj,color){
    const [x,y,z]=obj.position,[sx,sy,sz]=obj.scale;
    const p=(dx,dy,dz)=>this.project(x+dx,y+dy,z+dz);
    const a=p(-sx,0,-sz),b=p(sx,0,-sz),d=p(-sx,0,sz),e=p(sx,0,sz);
    const at=p(-sx,sy,-sz),bt=p(sx,sy,-sz),dt=p(-sx,sy,sz),et=p(sx,sy,sz);
    polygon(this.ctx,[d,e,et,dt],shade(color,.62));
    polygon(this.ctx,[b,e,et,bt],shade(color,.78));
    const bevel=Number(obj.modifiers?.find(m=>m.kind==="bevel")?.params?.amount||0);
    polygon(this.ctx,[at,bt,et,dt],shade(color,1.12),bevel>.08?"rgba(255,220,184,.55)":"rgba(255,255,255,.1)",bevel>.08?2:1);
    if(obj.params?.role==="objective"){const q=this.project(x,y+sy+.4,z);glow(this.ctx,q.x,q.y,38,"rgba(103,216,255,.14)")}
  }
  drawCylinder(obj,color){
    const [x,y,z]=obj.position,[rx,hy,rz]=obj.scale,q=this.project(x,y,z),top=this.project(x,y+hy,z),u=this.unit;
    const rw=Math.max(rx,rz)*u*.86,rh=Math.max(rx,rz)*u*.34;
    this.ctx.fillStyle=shade(color,.68);this.ctx.fillRect(q.x-rw,top.y,rw*2,q.y-top.y);
    this.ctx.beginPath();this.ctx.ellipse(top.x,top.y,rw,rh,0,0,Math.PI*2);this.ctx.fillStyle=shade(color,1.18);this.ctx.fill();
    this.ctx.strokeStyle="rgba(255,255,255,.12)";this.ctx.stroke();
    glow(this.ctx,top.x,top.y,rw*2.4,"rgba(103,216,255,.13)");
  }
  drawObject(obj){
    if(this.runtime.destroyed.has(obj.id))return;
    const colors=this.recipe.metadata.colors,color=colors[obj.material]||"#7e8791";
    if(obj.primitive==="cylinder")this.drawCylinder(obj,color);else this.drawCube(obj,color);
    const hits=this.runtime.objectHits.get(obj.id)||0;
    if(hits>0&&obj.params?.role==="destructible"){
      const q=this.project(obj.position[0],obj.position[1]+obj.scale[1],obj.position[2]);
      this.ctx.fillStyle="rgba(255,90,50,.8)";this.ctx.fillRect(q.x-10,q.y-12,20*(1-hits/3),2);
    }
  }
  drawPlayer(){
    const c=this.ctx,p=this.runtime.player,q=this.project(p.x,1.2,p.z),a=this.runtime.aim,u=this.unit;
    glow(c,q.x,q.y,28,"rgba(103,216,255,.2)");
    c.save();c.translate(q.x,q.y);c.rotate(Math.atan2(a.z-a.x,a.x+a.z));
    polygon(c,[{x:0,y:-10},{x:7,y:8},{x:0,y:5},{x:-7,y:8}],"#e8f7ff","rgba(103,216,255,.8)",1.5);c.restore();
    const tip=this.project(p.x+a.x*3,1.1,p.z+a.z*3);line(c,q,tip,"rgba(103,216,255,.55)",2);
  }
  drawEnemy(enemy,time){
    if(enemy.dead)return;
    const c=this.ctx,q=this.project(enemy.x,1.7+Math.sin(time*.004+enemy.phase)*.25,enemy.z);
    glow(c,q.x,q.y,24,"rgba(255,65,65,.12)");
    polygon(c,[{x:q.x,y:q.y-9},{x:q.x+11,y:q.y},{x:q.x,y:q.y+7},{x:q.x-11,y:q.y}],"#ff5c5c","#ffaaa2",1);
    c.fillStyle="rgba(0,0,0,.65)";c.fillRect(q.x-12,q.y-16,24,3);c.fillStyle="#ff8b75";c.fillRect(q.x-12,q.y-16,24*Math.max(0,enemy.hp/enemy.maxHp),3);
  }
  drawBullets(){
    for(const b of this.runtime.bullets){
      const a=this.project(b.x,1.15,b.z),tail=this.project(b.x-b.dx*.9,1.15,b.z-b.dz*.9);
      line(this.ctx,tail,a,b.weapon==="rail"?"#fff0c2":"#6ee7ff",b.weapon==="rail"?4:2);
      glow(this.ctx,a.x,a.y,b.weapon==="rail"?12:7,b.weapon==="rail"?"rgba(255,190,80,.5)":"rgba(80,210,255,.45)");
    }
  }
  drawParticles(){
    const c=this.ctx;
    for(const p of this.runtime.particles){
      const q=this.project(p.x,p.y,p.z);c.globalAlpha=Math.max(0,p.life);
      c.fillStyle=p.color;c.fillRect(q.x-2,q.y-2,4,4);
    }
    c.globalAlpha=1;
  }
  drawAimMarker(){
    const a=this.runtime.aim,q=this.project(this.runtime.player.x+a.x*8,.1,this.runtime.player.z+a.z*8),c=this.ctx;
    c.beginPath();c.arc(q.x,q.y,7,0,Math.PI*2);c.strokeStyle="rgba(255,255,255,.28)";c.stroke();
  }
  render(time){
    if(!this.recipe||!this.runtime)return;
    this.drawGrid();
    const items=this.recipe.objects.filter(o=>!this.runtime.destroyed.has(o.id)).slice();
    items.sort((a,b)=>(a.position[0]+a.position[2])-(b.position[0]+b.position[2]));
    for(const o of items)this.drawObject(o);
    for(const e of this.runtime.enemies)this.drawEnemy(e,time);
    this.drawBullets();this.drawParticles();this.drawPlayer();this.drawAimMarker();
    const vignette=this.ctx.createRadialGradient(this.w/2,this.h/2,this.h*.1,this.w/2,this.h/2,this.h*.72);
    vignette.addColorStop(.5,"rgba(0,0,0,0)");vignette.addColorStop(1,"rgba(0,0,0,.52)");
    this.ctx.fillStyle=vignette;this.ctx.fillRect(0,0,this.w,this.h);
  }
}
