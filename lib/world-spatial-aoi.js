'use strict';
function finite(n,d=0){n=Number(n);return Number.isFinite(n)?n:d}
function cellOf(pos,cellSize=32){cellSize=Math.max(1,finite(cellSize,32));return{x:Math.floor(finite(pos?.x)/cellSize),z:Math.floor(finite(pos?.z)/cellSize)}}
function key(c){return `${c.x}:${c.z}`}
function visibleCells(pos,{cellSize=32,radiusCells=2}={}){const c=cellOf(pos,cellSize),r=Math.max(0,Math.min(8,Math.floor(finite(radiusCells,2)))),out=[];for(let x=c.x-r;x<=c.x+r;x++)for(let z=c.z-r;z<=c.z+r;z++)out.push(`${x}:${z}`);return out}
function indexEntities(entities=[],opts={}){const m=new Map();for(const e of entities){const k=key(cellOf(e.position||e,opts.cellSize));if(!m.has(k))m.set(k,[]);m.get(k).push(e)}return m}
function selectVisible(entities=[],observer={},opts={}){const idx=indexEntities(entities,opts),out=[];for(const k of visibleCells(observer.position||observer,opts))for(const e of idx.get(k)||[])out.push(e);return out}
function recommendedHz({distance=0,roomSize=1,background=false}={}){if(background)return 2;if(distance>128)return 3;if(distance>64)return 6;if(roomSize>80)return 6;if(roomSize>30)return 12;return 20}
module.exports={cellOf,visibleCells,indexEntities,selectVisible,recommendedHz};
