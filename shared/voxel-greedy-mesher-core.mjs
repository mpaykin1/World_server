const GROUP = Object.freeze({ solid: 0, translucent: 1, water: 2 });
const GROUP_NAMES = ['solid', 'translucent', 'water'];
const FACE_SHADE = { px: .90, nx: .82, py: 1.05, ny: .62, pz: .94, nz: .76 };

function idx3(x,y,z,sx,sy,sz){ return (y*sz+z)*sx+x; }
function kindOf(type,kinds){ return kinds[type] || 0; }
function groupOf(type,kinds){ const k=kindOf(type,kinds); return k===1?GROUP.solid:k===2?GROUP.translucent:k===3?GROUP.water:-1; }
function visibleFace(type,neighbor,kinds){
  if(!type) return false;
  const k=kindOf(type,kinds), n=kindOf(neighbor,kinds);
  if(k===3) return n===0;
  if(k===2) return n===0 || n===3;
  return n===0 || n===2 || n===3;
}
function color3(hex,shade){
  return [((hex>>16)&255)/255*shade,((hex>>8)&255)/255*shade,(hex&255)/255*shade];
}
function bucket(){return {pos:[],col:[],idx:[],quads:0};}
function pushQuad(b, verts, hex, shade){
  const base=b.pos.length/3, c=color3(hex,shade);
  for(const v of verts){ b.pos.push(v[0],v[1],v[2]); b.col.push(c[0],c[1],c[2]); }
  b.idx.push(base,base+1,base+2,base,base+2,base+3); b.quads++;
}
function mergeMask(mask,w,h,emit){
  for(let v=0;v<h;v++) for(let u=0;u<w;){
    const i=v*w+u, t=mask[i]; if(!t){u++;continue;}
    let rw=1; while(u+rw<w && mask[i+rw]===t)rw++;
    let rh=1, ok=true;
    while(v+rh<h&&ok){ for(let x=0;x<rw;x++) if(mask[(v+rh)*w+u+x]!==t){ok=false;break;} if(ok)rh++; }
    emit(u,v,rw,rh,t);
    for(let yy=0;yy<rh;yy++) for(let xx=0;xx<rw;xx++) mask[(v+yy)*w+u+xx]=0;
    u+=rw;
  }
}

export function meshPaddedVolume({blocks,dims,colors,kinds}){
  const [sx,sy,sz]=dims, px=sx+2, py=sy+2, pz=sz+2;
  if(blocks.length!==px*py*pz) throw new Error(`padded block length ${blocks.length} != ${px*py*pz}`);
  const get=(x,y,z)=>blocks[idx3(x+1,y+1,z+1,px,py,pz)]||0;
  const out=[bucket(),bucket(),bucket()];
  const emit=(type,verts,shade)=>{const g=groupOf(type,kinds);if(g>=0)pushQuad(out[g],verts,colors[type]||0xffffff,shade)};
  const faceSpecs=[
    ['px',0,1, sy,sz, (s,u,v,rw,rh)=>[[s+1,u,v],[s+1,u+rw,v],[s+1,u+rw,v+rh],[s+1,u,v+rh]], (s,u,v)=>[s,u,v],[1,0,0]],
    ['nx',0,-1,sy,sz, (s,u,v,rw,rh)=>[[s,u,v+rh],[s,u+rw,v+rh],[s,u+rw,v],[s,u,v]], (s,u,v)=>[s,u,v],[-1,0,0]],
    ['py',1,1, sx,sz, (s,u,v,rw,rh)=>[[u,s+1,v],[u,s+1,v+rh],[u+rw,s+1,v+rh],[u+rw,s+1,v]], (s,u,v)=>[u,s,v],[0,1,0]],
    ['ny',1,-1,sx,sz, (s,u,v,rw,rh)=>[[u,s,v+rh],[u,s,v],[u+rw,s,v],[u+rw,s,v+rh]], (s,u,v)=>[u,s,v],[0,-1,0]],
    ['pz',2,1, sx,sy, (s,u,v,rw,rh)=>[[u+rw,v,s+1],[u+rw,v+rh,s+1],[u,v+rh,s+1],[u,v,s+1]], (s,u,v)=>[u,v,s],[0,0,1]],
    ['nz',2,-1,sx,sy, (s,u,v,rw,rh)=>[[u,v,s],[u,v+rh,s],[u+rw,v+rh,s],[u+rw,v,s]], (s,u,v)=>[u,v,s],[0,0,-1]]
  ];
  for(const [name,axis,sign,mw,mh,verts,coord,delta] of faceSpecs){
    const slices=axis===0?sx:axis===1?sy:sz;
    for(let s=0;s<slices;s++){
      const mask=new Uint16Array(mw*mh);
      for(let v=0;v<mh;v++)for(let u=0;u<mw;u++){
        const [x,y,z]=coord(s,u,v), type=get(x,y,z); if(!type)continue;
        const nb=get(x+delta[0],y+delta[1],z+delta[2]);
        if(visibleFace(type,nb,kinds))mask[v*mw+u]=type;
      }
      mergeMask(mask,mw,mh,(u,v,rw,rh,type)=>emit(type,verts(s,u,v,rw,rh),FACE_SHADE[name]));
    }
  }
  const result={};
  for(let i=0;i<3;i++){
    const b=out[i]; result[GROUP_NAMES[i]]={positions:new Float32Array(b.pos),colors:new Float32Array(b.col),indices:new Uint32Array(b.idx),quads:b.quads};
  }
  result.stats={quads:out.reduce((n,b)=>n+b.quads,0),triangles:out.reduce((n,b)=>n+b.idx.length/3,0)};
  return result;
}
