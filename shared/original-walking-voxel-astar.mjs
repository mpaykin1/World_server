/** Original standalone walking A*: caller classifies cells; no game/runtime dependency. */
export function findOriginalWalkingPath({start,goal,cell,maxNodes=300,maxDrop=3,height=2}={}){
 const valid=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isInteger);
 if(!valid(start)||!valid(goal)||typeof cell!=='function'||!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>100000||!Number.isInteger(maxDrop)||maxDrop<0||maxDrop>32||!Number.isInteger(height)||height<1||height>16)throw new RangeError('path arguments');
 const key=p=>p.join(','),distance=p=>Math.abs(p[0]-goal[0])+1.2*Math.abs(p[1]-goal[1])+Math.abs(p[2]-goal[2]);
 const classify=(x,y,z)=>{const c=cell(x,y,z)??{};return {solid:!!c.solid,hazard:!!c.hazard,water:!!c.water};};
 const pass=(x,y,z)=>{const c=classify(x,y,z);return !c.solid&&!c.hazard;};
 const walk=(x,y,z)=>{for(let k=0;k<height;k++)if(!pass(x,y+k,z))return false;const floor=classify(x,y-1,z);return (floor.solid&&!floor.hazard)||classify(x,y,z).water;};
 const open=[start],score=new Map([[key(start),0]]),previous=new Map(),closed=new Set();let best=start,bestDistance=distance(start),expanded=0,reached=false;
 while(open.length&&expanded<maxNodes){
  let bi=0,bf=Infinity;for(let i=0;i<open.length;i++){const f=score.get(key(open[i]))+distance(open[i]);if(f<bf){bf=f;bi=i;}}
  const current=open.splice(bi,1)[0],ck=key(current);if(closed.has(ck))continue;
  if(ck===key(goal)){best=current;reached=true;break;}
  closed.add(ck);expanded++;
  const h=distance(current);if(h<bestDistance){best=current;bestDistance=h;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const nx=current[0]+dx,nz=current[2]+dz,cy=current[1];let ny=cy,cost=1;
   if(!walk(nx,ny,nz)){
    if(walk(nx,cy+1,nz)&&pass(current[0],cy+height,current[2])){ny=cy+1;cost=1.5;}
    else{
     if(!pass(nx,cy,nz)||!pass(nx,cy+1,nz))continue;
     let found=false;for(let drop=1;drop<=maxDrop;drop++)if(walk(nx,cy-drop,nz)){ny=cy-drop;cost=1+drop*.3;found=true;break;}
     if(!found)continue;
    }
   }
   if(classify(nx,ny,nz).water)cost++;
   const next=[nx,ny,nz],nk=key(next),ng=score.get(ck)+cost;
   if(closed.has(nk)||ng>= (score.get(nk)??Infinity))continue;
   previous.set(nk,current);score.set(nk,ng);open.push(next);
  }
 }
 const path=[];let cursor=best,guard=0;while(previous.has(key(cursor))&&guard++<=maxNodes){path.push(cursor);cursor=previous.get(key(cursor));}
 path.reverse();return {path,reached,expanded,partial:!reached&&path.length>0};
}
