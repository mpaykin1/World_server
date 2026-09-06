export class DistanceRecipeStreamer{
  constructor({manifestation,eye,maxResidentChunks=8,hideDistance=95,showDistance=75}={}){
    this.manifestation=manifestation;this.eye=eye;this.maxResidentChunks=maxResidentChunks;this.hideDistance=hideDistance;this.showDistance=showDistance;this.archived=new Map();
  }
  #chunkCenter(c){const b=c?.bounds;if(b&&Number.isFinite(b.minX)&&Number.isFinite(b.maxX)&&Number.isFinite(b.minY)&&Number.isFinite(b.maxY)&&Number.isFinite(b.minZ)&&Number.isFinite(b.maxZ)){const x=(b.minX+b.maxX)/2,y=(b.minY+b.maxY)/2,z=(b.minZ+b.maxZ)/2,dx=b.maxX-b.minX,dy=b.maxY-b.minY,dz=b.maxZ-b.minZ;return{x,y,z,r:Math.hypot(dx,dy,dz)/2}}const s=c?.mesh?.geometry?.boundingSphere;if(!s)c?.mesh?.geometry?.computeBoundingSphere?.();const bs=c?.mesh?.geometry?.boundingSphere,p=c?.mesh?.position;return{x:p?.x||0,y:p?.y||0,z:p?.z||0,r:bs?.radius||1}}
  update(){
    const m=this.manifestation,e=this.eye?.position;if(!m?._chunks||!e)return{resident:0,archived:0};
    const rows=m._chunks.map((c,i)=>{const q=this.#chunkCenter(c),dx=q.x-e.x,dy=q.y-e.y,dz=q.z-e.z;return{i,c,d:Math.max(0,Math.hypot(dx,dy,dz)-q.r)}}).sort((a,b)=>a.d-b.d);
    let keep=0;
    for(const r of rows){
      const shouldShow=r.d<=this.showDistance||keep<this.maxResidentChunks;
      if(shouldShow){r.c.mesh.visible=true;this.archived.delete(r.i);keep++;continue}
      if(r.d>=this.hideDistance){r.c.mesh.visible=false;if(!this.archived.has(r.i))this.archived.set(r.i,{chunk:r.i,hiddenAt:Date.now(),recipeCount:m._creationIndex})}
    }
    return{resident:rows.filter(r=>r.c.mesh.visible).length,archived:this.archived.size,total:rows.length};
  }
  rematerializeAll(){for(const[i]of this.archived){const c=this.manifestation?._chunks?.[i];if(c?.mesh)c.mesh.visible=true}this.archived.clear()}
}
