(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.LivingInkCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TAU=Math.PI*2;
  const DEFAULT_STYLE={
    paper:'#f5f0e8', paperWarm:'#eadfce', ink:'#21384f', inkSoft:'#5d7185',
    wash:'#8d9cab', plant:'#7e9284', glass:'#dfe8ec', warm:'#b8a58f', screen:'#eef2f3'
  };
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function lerp(a,b,t){return a+(b-a)*t;}
  function hash(seed,a=0,b=0,c=0){
    let x=(Number(seed)||1)>>>0;
    x^=((a*374761393)>>>0); x=Math.imul(x^(x>>>13),1274126177);
    x^=((b*668265263)>>>0); x=Math.imul(x^(x>>>16),2246822519);
    x^=((c*3266489917)>>>0); x=Math.imul(x^(x>>>13),3266489917);
    return ((x^(x>>>16))>>>0)/4294967296;
  }
  function seededRange(seed,a,b,c,min,max){return lerp(min,max,hash(seed,a,b,c));}
  function v(x,y,z){return {x,y,z};}
  function selectArtisticLod(distance,near=11,far=24){
    if(distance<=near) return 0;
    if(distance<=far) return 1;
    return 2;
  }
  class LivingInkRenderer{
    constructor(canvas,{seed=1,style={}}={}){
      this.canvas=canvas; this.ctx=canvas.getContext('2d',{alpha:false});
      this.seed=Number(seed)||1; this.style={...DEFAULT_STYLE,...style};
      this.camera={x:0,y:1.58,z:-1.8,yaw:0,pitch:0.02};
      this.W=0; this.H=0; this.DPR=1; this.F=700; this.queue=[]; this.paper=null;
      this.stats={drawCalls:0,primitives:0,near:0,medium:0,far:0};
      this.resize();
    }
    resize(){
      const w=this.canvas.clientWidth||innerWidth||1280, h=this.canvas.clientHeight||innerHeight||720;
      this.DPR=Math.min((typeof devicePixelRatio!=='undefined'?devicePixelRatio:1)||1,2);
      this.W=w; this.H=h; this.canvas.width=Math.round(w*this.DPR); this.canvas.height=Math.round(h*this.DPR);
      this.ctx.setTransform(this.DPR,0,0,this.DPR,0,0); this.F=Math.min(w,h)*1.06;
      this.buildPaper();
    }
    buildPaper(){
      const c=document.createElement('canvas'),x=c.getContext('2d');
      c.width=Math.round(this.W*this.DPR); c.height=Math.round(this.H*this.DPR); x.setTransform(this.DPR,0,0,this.DPR,0,0);
      x.fillStyle=this.style.paper; x.fillRect(0,0,this.W,this.H);
      const g=x.createLinearGradient(0,0,0,this.H); g.addColorStop(0,'rgba(255,255,255,.50)'); g.addColorStop(1,'rgba(155,124,86,.06)');
      x.fillStyle=g; x.fillRect(0,0,this.W,this.H);
      const count=Math.ceil(this.W*this.H/7200);
      for(let i=0;i<count;i++){
        const px=hash(this.seed,101,i)*this.W, py=hash(this.seed,102,i)*this.H, len=8+hash(this.seed,103,i)*54;
        x.globalAlpha=.025+hash(this.seed,104,i)*.045; x.strokeStyle=hash(this.seed,105,i)>.5?'#ffffff':'#a99a83';
        x.lineWidth=.25+hash(this.seed,106,i)*.45; x.beginPath(); x.moveTo(px,py);
        x.quadraticCurveTo(px+len*.5,py+(hash(this.seed,107,i)-.5)*3,px+len,py+(hash(this.seed,108,i)-.5)*2); x.stroke();
      }
      x.globalAlpha=1; this.paper=c;
    }
    begin(){
      this.queue.length=0; this.stats={drawCalls:0,primitives:0,near:0,medium:0,far:0};
      this.ctx.drawImage(this.paper,0,0,this.W,this.H);
      const g=this.ctx.createRadialGradient(this.W*.48,this.H*.42,0,this.W*.48,this.H*.42,Math.max(this.W,this.H)*.72);
      g.addColorStop(0,'rgba(255,255,255,.32)'); g.addColorStop(1,'rgba(255,255,255,0)'); this.ctx.fillStyle=g; this.ctx.fillRect(0,0,this.W,this.H);
    }
    project(p){
      const dx=p.x-this.camera.x,dy=p.y-this.camera.y,dz=p.z-this.camera.z;
      const cy=Math.cos(this.camera.yaw),sy=Math.sin(this.camera.yaw),cp=Math.cos(this.camera.pitch),sp=Math.sin(this.camera.pitch);
      const x1=dx*cy-dz*sy,z1=dx*sy+dz*cy,y2=dy*cp-z1*sp,z2=dy*sp+z1*cp;
      if(z2<.08) return null;
      return {x:this.W*.5+(x1/z2)*this.F,y:this.H*.55-(y2/z2)*this.F,z:z2};
    }
    line(a,b,{width=.018,color=this.style.ink,alpha=.55,priority=1,seed=0}={}){
      const A=this.project(a),B=this.project(b); if(!A||!B) return;
      const z=(A.z+B.z)*.5,lod=selectArtisticLod(z); if(priority<lod) return;
      this.queue.push({type:'line',A,B,z,lod,width:Math.max(.28,width*this.F/z),color,alpha,seed});
    }
    poly(points,{color=this.style.ink,alpha=.12,priority=1,seed=0}={}){
      const pts=[];let z=0; for(const p of points){const q=this.project(p);if(!q)return;pts.push(q);z+=q.z;}
      z/=pts.length; const lod=selectArtisticLod(z); if(priority<lod) return;
      this.queue.push({type:'poly',pts,z,lod,color,alpha,seed});
    }
    blob(p,{radius=.1,stretch=1,color=this.style.ink,alpha=.32,priority=1,seed=0}={}){
      const P=this.project(p); if(!P)return; const lod=selectArtisticLod(P.z); if(priority<lod)return;
      const rr=radius*this.F/P.z; if(rr<.22)return; this.queue.push({type:'blob',x:P.x,y:P.y,rx:rr,ry:rr*stretch,z:P.z,lod,color,alpha,seed});
    }
    shadow(p,{rx=.32,ry=.08,alpha=.08,seed=0}={}){
      const P=this.project(p); if(!P)return; const scale=this.F/P.z;
      this.queue.push({type:'shadow',x:P.x,y:P.y,rx:rx*scale,ry:ry*scale,z:P.z+.01,lod:selectArtisticLod(P.z),color:this.style.ink,alpha,seed});
    }
    text(p,text,{size=.11,color=this.style.ink,alpha=.6,weight=700,priority=0}={}){
      const P=this.project(p);if(!P)return;const lod=selectArtisticLod(P.z);if(priority<lod)return;
      this.queue.push({type:'text',x:P.x,y:P.y,z:P.z,lod,text,size:clamp(size*this.F/P.z,5,72),color,alpha,weight});
    }
    glass(points,{seed=0}={}){
      this.poly(points,{color:this.style.glass,alpha:.13,priority:1,seed});
      for(let i=0;i<points.length;i++) this.line(points[i],points[(i+1)%points.length],{width:.009,color:this.style.inkSoft,alpha:.2,priority:1,seed:seed+i});
    }
    end(){
      this.queue.sort((a,b)=>b.z-a.z); this.stats.primitives=this.queue.length;
      for(const d of this.queue){
        const fade=clamp(1-(d.z-8)/58,.08,1); this.stats[d.lod===0?'near':d.lod===1?'medium':'far']++;
        if(d.type==='line') this._inkLine(d,fade); else if(d.type==='poly') this._inkPoly(d,fade);
        else if(d.type==='blob'||d.type==='shadow') this._inkBlob(d,fade); else this._text(d,fade);
      }
      const vg=this.ctx.createRadialGradient(this.W*.5,this.H*.46,Math.min(this.W,this.H)*.16,this.W*.5,this.H*.46,Math.max(this.W,this.H)*.8);
      vg.addColorStop(0,'rgba(255,255,255,0)'); vg.addColorStop(1,'rgba(64,54,43,.055)'); this.ctx.fillStyle=vg; this.ctx.fillRect(0,0,this.W,this.H);
      return {...this.stats};
    }
    _inkLine(d,fade){
      const c=this.ctx;c.save();c.lineCap='round'; const passes=d.lod===0?3:2;
      for(let i=0;i<passes;i++){
        const jx=(hash(this.seed,d.seed,i,1)-.5)*(d.lod===0?.9:.55),jy=(hash(this.seed,d.seed,i,2)-.5)*(d.lod===0?.9:.55);
        c.globalAlpha=d.alpha*fade*(.24+hash(this.seed,d.seed,i,3)*.11); c.strokeStyle=d.color;
        c.lineWidth=Math.max(.28,d.width*(.84+hash(this.seed,d.seed,i,4)*.24)); c.beginPath(); c.moveTo(d.A.x+jx,d.A.y+jy); c.lineTo(d.B.x-jx*.35,d.B.y-jy*.35); c.stroke(); this.stats.drawCalls++;
      } c.restore();
    }
    _inkPoly(d,fade){
      const c=this.ctx;c.save(); const passes=d.lod===0?4:2;
      for(let i=0;i<passes;i++){
        c.globalAlpha=d.alpha*fade*(.18+hash(this.seed,d.seed,i,9)*.08);c.fillStyle=d.color;c.beginPath();
        d.pts.forEach((p,k)=>{const j=(hash(this.seed,d.seed+i,k,10)-.5)*(d.lod===0?.7:.35);if(k===0)c.moveTo(p.x+j,p.y-j);else c.lineTo(p.x+j,p.y-j);});
        c.closePath();c.fill();this.stats.drawCalls++;
      } c.restore();
    }
    _inkBlob(d,fade){
      const c=this.ctx;c.save();const passes=d.type==='shadow'?4:(d.lod===0?7:4);
      for(let i=0;i<passes;i++){
        c.globalAlpha=d.alpha*fade*(d.type==='shadow'?.12:.07+hash(this.seed,d.seed,i,12)*.045);c.fillStyle=d.color;c.beginPath();
        const ox=(hash(this.seed,d.seed,i,13)-.5)*d.rx*.11,oy=(hash(this.seed,d.seed,i,14)-.5)*d.ry*.11;
        c.ellipse(d.x+ox,d.y+oy,d.rx*(.86+hash(this.seed,d.seed,i,15)*.15),d.ry*(.86+hash(this.seed,d.seed,i,16)*.15),0,0,TAU);c.fill();this.stats.drawCalls++;
      } c.restore();
    }
    _text(d,fade){const c=this.ctx;c.save();c.globalAlpha=d.alpha*fade;c.fillStyle=d.color;c.font=`${d.weight} ${d.size}px system-ui,-apple-system,Segoe UI,Arial,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(d.text,d.x,d.y);c.restore();this.stats.drawCalls++;}
  }
  return {TAU,DEFAULT_STYLE,clamp,lerp,hash,seededRange,v,selectArtisticLod,LivingInkRenderer};
});
