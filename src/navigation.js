import * as THREE from 'three';

export class NavigationGraph {
  constructor(data){
    this.nodes=(data?.nodes||[]).map(n=>({...n,position:new THREE.Vector3().fromArray(n.position)}));
    this.adj=new Map(this.nodes.map(n=>[n.id,[]]));
    for(const [a,b,cost] of data?.edges||[]){this.adj.get(a)?.push([b,cost]);this.adj.get(b)?.push([a,cost]);}
  }
  nearest(point,maxDistance=6){
    let best=null,bd=maxDistance*maxDistance;
    for(const n of this.nodes){const d=n.position.distanceToSquared(point);if(d<bd){bd=d;best=n.id;}}
    return best;
  }
  path(startPoint,endPoint){
    const start=this.nearest(startPoint),goal=this.nearest(endPoint);if(start==null||goal==null)return[];
    const open=new Set([start]),came=new Map(),g=new Map([[start,0]]),f=new Map([[start,this._h(start,goal)]]);
    while(open.size){let cur=[...open].reduce((a,b)=>(f.get(a)??Infinity)<=(f.get(b)??Infinity)?a:b);if(cur===goal)return this._reconstruct(came,cur);
      open.delete(cur);for(const [n,cost] of this.adj.get(cur)||[]){const t=(g.get(cur)??Infinity)+cost;if(t<(g.get(n)??Infinity)){came.set(n,cur);g.set(n,t);f.set(n,t+this._h(n,goal));open.add(n);}}}
    return[];
  }
  _h(a,b){return this.nodes[a].position.distanceTo(this.nodes[b].position);}
  _reconstruct(came,cur){const out=[this.nodes[cur].position.clone()];while(came.has(cur)){cur=came.get(cur);out.push(this.nodes[cur].position.clone());}return out.reverse();}
}
