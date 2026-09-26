/** Original deterministic bounded A* for voxel-grid agents, engine-independent. */
export function findOriginalVoxelPath({start,goal,isWalkable,bounds,maxVisited=20000}){
 if(!Array.isArray(start)||!Array.isArray(goal)||start.length!==3||goal.length!==3||![...start,...goal].every(Number.isSafeInteger)||typeof isWalkable!=='function'||!Array.isArray(bounds)||bounds.length!==3||bounds.some(v=>!Number.isInteger(v)||v<1||v>512)||!Number.isInteger(maxVisited)||maxVisited<1)throw new TypeError('path arguments');
 const inside=p=>p.every((v,i)=>v>=0&&v<bounds[i]);
 if(!inside(start)||!inside(goal)||!isWalkable(...start)||!isWalkable(...goal))return null;
 const id=p=>p.join(','),distance=p=>Math.abs(p[0]-goal[0])+Math.abs(p[1]-goal[1])+Math.abs(p[2]-goal[2]);
 const origin=id(start),target=id(goal),open=[{p:[...start],g:0,f:distance(start)}],best=new Map([[origin,0]]),parent=new Map(),closed=new Set();
 const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
 let visited=0;
 while(open.length&&visited<maxVisited){
  open.sort((a,b)=>a.f-b.f||a.g-b.g||id(a.p).localeCompare(id(b.p)));
  const cur=open.shift(),k=id(cur.p);if(closed.has(k))continue;
  closed.add(k);visited++;
  if(k===target){
   const path=[cur.p];let step=k;
   while(step!==origin){step=parent.get(step);path.push(step.split(',').map(Number));}
   return {path:path.reverse(),visited};
  }
  for(const d of dirs){
   const next=cur.p.map((v,i)=>v+d[i]);if(!inside(next)||!isWalkable(...next))continue;
   const nk=id(next),g=cur.g+1;if(closed.has(nk)||g>=(best.get(nk)??Infinity))continue;
   best.set(nk,g);parent.set(nk,k);open.push({p:next,g,f:g+distance(next)});
  }
 }
 return null;
}
