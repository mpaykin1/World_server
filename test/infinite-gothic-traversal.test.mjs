import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDING_HALF,
  CELL_SIZE,
  CORRIDOR_HALF,
  DIRECTIONS,
  buildTraversalCell,
  buildTraversalEdge,
  buildTraversalWindow,
  cellCenter,
  edgeId,
  isWalkable,
  neighborCell,
  portalFor,
  traversalProof,
  worldToCell,
} from '../shared/infinite-gothic-traversal.mjs';

test('cell generation is deterministic and has four open traversal portals',()=>{
  const a=buildTraversalCell({cx:7,cz:-4,seed:'infinite-gothic'});
  const b=buildTraversalCell({cx:7,cz:-4,seed:'infinite-gothic'});
  assert.deepEqual(a,b);
  assert.deepEqual(Object.keys(a.portals).sort(),[...DIRECTIONS].sort());
  assert.ok(a.voxels.length>400);
  assert.equal(new Set(a.voxels.map(v=>`${v.x},${v.y},${v.z}`)).size,a.voxels.length);

  for(const direction of DIRECTIONS){
    const p=a.portals[direction];
    assert.equal(isWalkable(p.x,p.z),true);
    for(let y=0;y<=3;y++){
      const blocked=a.voxels.some(v=>v.x===p.x&&v.y===y&&v.z===p.z);
      assert.equal(blocked,false,`${direction} portal center must stay open at y=${y}`);
    }
  }
});

test('neighbor portals and bridge edges are symmetric with no seam gap',()=>{
  for(const direction of DIRECTIONS){
    const a={cx:3,cz:-2},b=neighborCell(a.cx,a.cz,direction);
    const edgeAB=buildTraversalEdge({a,b,seed:'symmetry'});
    const edgeBA=buildTraversalEdge({a:b,b:a,seed:'symmetry'});
    assert.equal(edgeAB.id,edgeBA.id);
    assert.deepEqual(edgeAB.voxels,edgeBA.voxels);
    assert.equal(edgeAB.id,edgeId(a,b));

    const opposite={north:'south',south:'north',east:'west',west:'east'}[direction];
    const p=portalFor(a.cx,a.cz,direction),q=portalFor(b.cx,b.cz,opposite);
    if(direction==='east'||direction==='west')assert.equal(p.z,q.z);
    else assert.equal(p.x,q.x);

    const deck=edgeAB.voxels.filter(v=>v.role==='bridge-deck');
    assert.ok(deck.length>0);
    const centerA=cellCenter(a.cx,a.cz),centerB=cellCenter(b.cx,b.cz);
    if(direction==='east'||direction==='west'){
      const xs=deck.map(v=>v.x);
      assert.equal(Math.min(...xs),Math.min(centerA.x,centerB.x)+BUILDING_HALF);
      assert.equal(Math.max(...xs),Math.max(centerA.x,centerB.x)-BUILDING_HALF);
    }else{
      const zs=deck.map(v=>v.z);
      assert.equal(Math.min(...zs),Math.min(centerA.z,centerB.z)+BUILDING_HALF);
      assert.equal(Math.max(...zs),Math.max(centerA.z,centerB.z)-BUILDING_HALF);
    }
  }
});

test('walkability forms an infinite Manhattan network through every building and bridge',()=>{
  const samples=80;
  for(let cell=-samples;cell<=samples;cell++){
    const x=cell*CELL_SIZE;
    const z=cell*CELL_SIZE;
    assert.equal(isWalkable(x,0),true);
    assert.equal(isWalkable(0,z),true);
    assert.equal(isWalkable(x+CORRIDOR_HALF-.1,0),true);
    assert.equal(isWalkable(0,z-CORRIDOR_HALF+.1),true);
    assert.equal(isWalkable(x+CELL_SIZE*.25,z+CELL_SIZE*.25),false);
  }
});

test('world-to-cell remains stable across negative and positive streamed coordinates',()=>{
  for(let cx=-60;cx<=60;cx++)for(const offset of [-13.9,0,13.9]){
    const x=cx*CELL_SIZE+offset;
    assert.equal(worldToCell(x,0).cx,cx);
  }
  for(let cz=-60;cz<=60;cz++)for(const offset of [-13.9,0,13.9]){
    const z=cz*CELL_SIZE+offset;
    assert.equal(worldToCell(0,z).cz,cz);
  }
});

test('bounded streaming window has deterministic cells and unique internal edges',()=>{
  const w=buildTraversalWindow({centerCx:12,centerCz:-9,radius:2,seed:'window'});
  assert.equal(w.cells.length,25);
  assert.equal(w.edges.length,40);
  assert.equal(new Set(w.cells.map(c=>c.id)).size,w.cells.length);
  assert.equal(new Set(w.edges.map(e=>e.id)).size,w.edges.length);

  const again=buildTraversalWindow({centerCx:12,centerCz:-9,radius:2,seed:'window'});
  assert.deepEqual(w,again);

  const moved=buildTraversalWindow({centerCx:13,centerCz:-9,radius:2,seed:'window'});
  assert.equal(moved.cells.length,25);
  assert.equal(moved.edges.length,40);
  assert.ok(moved.cells.some(c=>c.cx===15));
  assert.ok(!moved.cells.some(c=>c.cx===10));
});

test('formal traversal proof crosses 200 cells in every cardinal direction without dead ends',()=>{
  const proof=traversalProof({cells:200,seed:'proof'});
  assert.equal(proof.ok,true);
  assert.equal(proof.cellsPerDirection,200);
  assert.deepEqual(proof.failures,[]);
});
