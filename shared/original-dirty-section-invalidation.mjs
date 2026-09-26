/** Original, engine-neutral section invalidation. No active game integration. */
export function originalDirtySections({x,y,z,minY=-64,maxY=320,chunkWidth=16,sectionHeight=16}){
 for(const n of [x,y,z,minY,maxY,chunkWidth,sectionHeight])if(!Number.isSafeInteger(n))throw new TypeError('integer coordinates required');
 if(chunkWidth<1||sectionHeight<1||maxY<=minY)throw new RangeError('dimensions');
 if(y<minY||y>=maxY)return [];
 const cx=Math.floor(x/chunkWidth),cz=Math.floor(z/chunkWidth),sy=Math.floor((y-minY)/sectionHeight);
 const lx=x-cx*chunkWidth,lz=z-cz*chunkWidth,ly=y-minY-sy*sectionHeight;
 const xs=[0],zs=[0],ys=[0];
 if(lx===0)xs.push(-1);if(lx===chunkWidth-1)xs.push(1);
 if(lz===0)zs.push(-1);if(lz===chunkWidth-1)zs.push(1);
 if(ly===0)ys.push(-1);if(ly===sectionHeight-1)ys.push(1);
 const sectionCount=Math.ceil((maxY-minY)/sectionHeight),out=[];
 for(const dy of ys)for(const dx of xs)for(const dz of zs){
  const section=sy+dy;if(section<0||section>=sectionCount)continue;
  out.push({cx:cx+dx,sy:section,cz:cz+dz});
 }
 return out;
}
export function originalDirtyQueue(){
 const pending=new Map();
 const key=({cx,sy,cz})=>cx+','+sy+','+cz;
 return {
  mark(section){if(![section.cx,section.sy,section.cz].every(Number.isSafeInteger))throw new TypeError('section');pending.set(key(section),{...section});},
  markBlock(block){for(const s of originalDirtySections(block))this.mark(s);},
  drain({cx=0,cz=0,limit=Infinity}={}){
   if(!(limit>=0))throw new RangeError('limit');
   const sorted=[...pending.values()].sort((a,b)=>((a.cx-cx)**2+(a.cz-cz)**2)-((b.cx-cx)**2+(b.cz-cz)**2)||a.sy-b.sy||a.cx-b.cx||a.cz-b.cz);
   const take=sorted.slice(0,limit);for(const s of take)pending.delete(key(s));return take;
  },
  get size(){return pending.size;}
 };
}
