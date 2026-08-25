import * as THREE from 'three';
import { MeshBVH, ExtendedTriangle } from 'three-mesh-bvh';

const seg=new THREE.Line3(),box=new THREE.Box3(),tp=new THREE.Vector3(),cp=new THREE.Vector3(),n=new THREE.Vector3();
const inv=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3(),localFeet=new THREE.Vector3(),worldFeet=new THREE.Vector3();

export function buildDynamicMeshCollider(object){
  if(!object?.isMesh||!object.geometry?.getAttribute?.('position'))return null;
  const geometry=object.geometry.clone();geometry.computeBoundingBox();geometry.boundsTree=new MeshBVH(geometry,{maxLeafTris:10,indirect:true});
  object.updateMatrixWorld(true);return{kind:'mesh-bvh',id:object.name||object.uuid,object,geometry,delta:new THREE.Vector3(),lastWorldPosition:new THREE.Vector3().setFromMatrixPosition(object.matrixWorld),previousMatrixWorld:object.matrixWorld.clone(),matrixWorld:object.matrixWorld.clone(),inverseMatrix:object.matrixWorld.clone().invert()};
}

export function updateDynamicMeshCollider(c){
  c.object.updateMatrixWorld(true);const now=new THREE.Vector3().setFromMatrixPosition(c.object.matrixWorld);c.delta.subVectors(now,c.lastWorldPosition);c.lastWorldPosition.copy(now);c.previousMatrixWorld.copy(c.matrixWorld);c.matrixWorld.copy(c.object.matrixWorld);c.inverseMatrix.copy(c.matrixWorld).invert();return c;
}

function capsuleHitAtWorld(c,feet,player){
  localFeet.copy(feet).applyMatrix4(c.inverseMatrix);
  const sx=new THREE.Vector3().setFromMatrixColumn(c.matrixWorld,0).length(),sy=new THREE.Vector3().setFromMatrixColumn(c.matrixWorld,1).length(),sz=new THREE.Vector3().setFromMatrixColumn(c.matrixWorld,2).length();
  const s=Math.max(1e-6,Math.max(sx,sy,sz)),r=player.config.radius/s,h=player.config.height/s;
  seg.start.copy(localFeet).add(new THREE.Vector3(0,r,0));seg.end.copy(localFeet).add(new THREE.Vector3(0,h-r,0));box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end);box.min.addScalar(-r);box.max.addScalar(r);
  let hit=false,bestDepth=0;const bestNormal=new THREE.Vector3();
  c.geometry.boundsTree.shapecast({intersectsBounds:b=>b.intersectsBox(box),intersectsTriangle:tri=>{const d=tri.closestPointToSegment(seg,tp,cp);if(d>=r)return false;const depth=r-d;n.subVectors(cp,tp);if(n.lengthSq()<1e-12&&tri instanceof ExtendedTriangle)tri.getNormal(n);if(n.lengthSq()<1e-12)n.set(0,1,0);n.normalize();if(depth>bestDepth){bestDepth=depth;bestNormal.copy(n);}hit=true;return false;}});
  if(!hit)return null;normalMatrix.getNormalMatrix(c.matrixWorld);bestNormal.applyMatrix3(normalMatrix).normalize();return{depth:bestDepth*s,normal:bestNormal};
}

/** Continuous translation sweep against an exact cloned dynamic mesh BVH. Rotation between frames is
 * conservatively handled by using current orientation; unsupported/non-mesh bodies keep the older AABB fallback. */
export function sweepPlayerAgainstDynamicMesh(c,before,current,player){
  if(c?.kind!=='mesh-bvh'||!c.geometry?.boundsTree)return null;
  const playerDelta=new THREE.Vector3().subVectors(current,before),relative=playerDelta.clone().sub(c.delta||new THREE.Vector3());
  const distance=relative.length(),step=Math.max(0.05,player.config.radius*0.35),steps=Math.max(1,Math.min(32,Math.ceil(distance/step)));
  let lastFree=before.clone();
  for(let i=1;i<=steps;i++){
    const t=i/steps;
    // Transform player path into the current body's translated frame: body(t)=bodyNow-delta*(1-t).
    worldFeet.copy(before).lerp(current,t).addScaledVector(c.delta||new THREE.Vector3(),1-t);
    const hit=capsuleHitAtWorld(c,worldFeet,player);
    if(hit)return{hit:true,position:lastFree.clone(),normal:hit.normal,depth:hit.depth,steps,testedAt:t};
    lastFree.copy(before).lerp(current,t);
  }
  return{hit:false,steps};
}
