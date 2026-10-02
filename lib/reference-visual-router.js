'use strict';
const lanes=require('../data/reference-visual-lanes.json').lanes;
function styleScore(l,g){if(l.styles.includes(g.style))return 5;if(g.style==='gothic-voxel'&&l.styles.includes('voxel'))return 4;
  if(g.style==='luminous-outline'&&l.id==='mesh-3d')return 2;if(g.style==='watercolor'&&l.id==='mesh-3d')return 2;
  if(g.dimension==='2d'&&l.id==='sprite-2d')return 3;if(g.dimension==='3d'&&l.id==='mesh-3d')return 1;return 0;}
function scoreLane(l,g){if(!l.dimensions.includes(g.dimension))return-100;let s=styleScore(l,g);s+=l.available?2:-6;if(l.auxiliary)s-=1;return s;}
function rankedLanes(g){return lanes.map(l=>({...l,score:scoreLane(l,g)})).filter(l=>l.score>-100).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));}
function choosePrimary(g){const r=rankedLanes(g);return r.find(l=>l.available&&!l.auxiliary)||r.find(l=>l.available)||null;}
function chooseAuxiliary(g){const ids=[];if(g.style==='luminous-outline')ids.push('light-contour-3d','silhouette-3d');
  if(g.lighting.emissive&&g.dimension==='3d')ids.push('light-contour-3d');return[...new Set(ids)].map(id=>lanes.find(l=>l.id===id)).filter(l=>l?.available);}
function routeVisualGrammar(g){
  const primary=choosePrimary(g),exact=lanes.find(l=>l.styles.includes(g.style)),blockers=[];
  if(exact&&!exact.available)blockers.push(...(exact.limitations||[exact.id+' unavailable']));
  if(g.dimension==='2d'&&g.style!=='pixel-art'&&primary?.id==='sprite-2d')blockers.push('2D reference-shaped synthesis needs explicit silhouette/region evidence for high fidelity');
  return{primary,auxiliary:chooseAuxiliary(g),ranked:rankedLanes(g).map(({id,available,maturity,score})=>({id,available,maturity,score})),blockers};
}
module.exports={routeVisualGrammar,rankedLanes};
