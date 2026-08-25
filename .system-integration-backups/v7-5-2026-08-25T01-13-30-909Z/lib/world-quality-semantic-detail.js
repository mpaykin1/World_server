'use strict';

function rgb(c){return[(c>>>16)&255,(c>>>8)&255,c&255]}
function luma(c){const[r,g,b]=rgb(c);return(.299*r+.587*g+.114*b)/255}
function chroma(c){const a=rgb(c);return(Math.max(...a)-Math.min(...a))/255}
function key2(x,y){return `${x},${y}`}

function buildCells(voxels){
  const cells=new Map();
  for(const v of voxels||[]){
    if(!Array.isArray(v)||v.length<4)continue;
    const x=Math.trunc(+v[0]),y=Math.trunc(+v[1]),z=Math.trunc(+v[2]),color=Math.trunc(+v[3])||0;
    if(![x,y,z].every(Number.isFinite))continue;
    const k=key2(x,y),q=cells.get(k);
    if(!q)cells.set(k,{x,y,front:z,back:z,color});
    else{if(z>q.front){q.front=z;q.color=color}if(z<q.back)q.back=z}
  }
  return cells;
}

function semanticDetailIndex(voxels,palette){
  const cells=buildCells(voxels), ys=[...cells.values()].map(c=>c.y).sort((a,b)=>a-b);
  const yMin=ys[0]??0,yMax=ys[ys.length-1]??1,ySpan=Math.max(1,yMax-yMin);
  const intents=new Map();
  const stats={cells:cells.size,roof:0,windowLike:0,verticalEdge:0,spireLike:0,groundBand:0,highSaliency:0};
  const pal=i=>+palette?.[i]||0,at=(x,y)=>cells.get(key2(x,y));
  for(const c of cells.values()){
    const here=luma(pal(c.color)), hereChroma=chroma(pal(c.color));
    const n4=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>at(c.x+dx,c.y+dy));
    let edge=0,depthEdge=0,missing=0;
    for(const n of n4){
      if(!n){missing++;edge=Math.max(edge,.42);continue}
      edge=Math.max(edge,Math.abs(here-luma(pal(n.color))));
      depthEdge=Math.max(depthEdge,Math.min(1,Math.abs(c.front-n.front)/5));
    }
    const roof=!at(c.x,c.y+1);
    const groundBand=(c.y-yMin)/ySpan<.16;
    const bright=here>.55 && hereChroma>.12;
    const left=at(c.x-1,c.y),right=at(c.x+1,c.y),up=at(c.x,c.y+1),down=at(c.x,c.y-1);
    const verticalEdge=missing>0||depthEdge>.2||(!left||!right);
    const windowLike=bright&&!roof&&!!up&&!!down&&(edge>.08||depthEdge>.08);
    let horizontalSupport=0;
    for(let dx=-3;dx<=3;dx++)if(at(c.x+dx,c.y))horizontalSupport++;
    const spireLike=roof&&!groundBand&&horizontalSupport<=4&&((c.y-yMin)/ySpan>.42);
    const saliency=Math.min(1,edge*.9+depthEdge*.7+(roof?.24:0)+(windowLike?.28:0)+(spireLike?.34:0)+hereChroma*.10);
    const intent={roof,windowLike,verticalEdge,spireLike,groundBand,saliency,depthEdge,missing,materialColor:pal(c.color)};
    intents.set(key2(c.x,c.y),intent);
    if(roof)stats.roof++;if(windowLike)stats.windowLike++;if(verticalEdge)stats.verticalEdge++;if(spireLike)stats.spireLike++;if(groundBand)stats.groundBand++;if(saliency>.55)stats.highSaliency++;
  }
  return{cells,intents,stats,yMin,yMax};
}

module.exports={semanticDetailIndex,buildCells,luma,chroma,rgb,key2};
