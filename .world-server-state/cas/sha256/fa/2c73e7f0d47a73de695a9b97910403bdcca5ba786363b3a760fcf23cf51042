/*
 * Parallel-safe BVH prepass: computes immutable triangle bounds/centroids in workers so the
 * authoritative MeshBVH build has less main-thread preprocessing. The final BVH remains exact.
 */
export class BvhParallelPrepass{
  constructor({maxWorkers=Math.max(1,Math.min(6,(navigator?.hardwareConcurrency||4)-1)),minTriangles=50000}={}){this.maxWorkers=maxWorkers;this.minTriangles=minTriangles;this.mode='parallel-exact-triangle-bounds-v1';}
  async compute(position,index){
    const tris=Math.floor(index.length/3);if(typeof Worker==='undefined'||tris<this.minTriangles)return this._local(position,index);
    const k=Math.min(this.maxWorkers,Math.ceil(tris/this.minTriangles)),jobs=[];let t0=0;
    for(let i=0;i<k;i++){const t1=Math.round((i+1)*tris/k),idx=index.slice(t0*3,t1*3),pos=position.slice();const w=new Worker(new URL('./workers/bvh-prepass-worker.js',import.meta.url),{type:'module'});
      jobs.push(new Promise((resolve,reject)=>{w.onmessage=e=>{w.terminate();e.data?.ok?resolve(e.data):reject(new Error(e.data?.error||'bvh prepass worker failed'));};w.onerror=e=>{w.terminate();reject(e.error||new Error(e.message));};w.postMessage({position:pos.buffer,index:idx.buffer,triangleOffset:t0},[pos.buffer,idx.buffer]);}));t0=t1;}
    const parts=await Promise.all(jobs),bounds=new Float32Array(tris*6),centroids=new Float32Array(tris*3);for(const p of parts){bounds.set(new Float32Array(p.bounds),p.triangleOffset*6);centroids.set(new Float32Array(p.centroids),p.triangleOffset*3);}return {mode:this.mode,triangleCount:tris,bounds,centroids,exact:true,sourceGeometryChanged:false,sourceGeometryModified:false,parallelWorkers:k};
  }
  _local(position,index){const tris=Math.floor(index.length/3),bounds=new Float32Array(tris*6),centroids=new Float32Array(tris*3);for(let t=0;t<tris;t++){let minx=Infinity,miny=Infinity,minz=Infinity,maxx=-Infinity,maxy=-Infinity,maxz=-Infinity;for(let j=0;j<3;j++){const vi=index[t*3+j]*3,x=position[vi],y=position[vi+1],z=position[vi+2];minx=Math.min(minx,x);miny=Math.min(miny,y);minz=Math.min(minz,z);maxx=Math.max(maxx,x);maxy=Math.max(maxy,y);maxz=Math.max(maxz,z);}bounds.set([minx,miny,minz,maxx,maxy,maxz],t*6);centroids.set([(minx+maxx)/2,(miny+maxy)/2,(minz+maxz)/2],t*3);}return {mode:this.mode,triangleCount:tris,bounds,centroids,exact:true,sourceGeometryChanged:false,sourceGeometryModified:false,parallelWorkers:0};}
}
