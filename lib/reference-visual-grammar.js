'use strict';

const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));
const round=value=>Number((Number(value)||0).toFixed(4));
const includes=(tags,...needles)=>needles.some(n=>tags.some(t=>t.includes(n)));

function normalizeHints(hints={}){
  const tags=[...(hints.tags||[]),hints.style,hints.medium,hints.scene,hints.camera]
    .filter(Boolean).map(v=>String(v).trim().toLowerCase());
  return{...hints,tags};
}

function rankStyles(stats,hints){
  const tags=hints.tags;
  const scores={
    voxel:(includes(tags,'voxel','blocky','cube')?0.72:0)+stats.pixelArtSignal*0.28,
    sprite:(includes(tags,'sprite','pixel art','pixel-art','2d')?0.72:0)+stats.pixelArtSignal*0.28,
    luminous:(includes(tags,'glow','luminous','light line','neon')?0.66:0)+stats.glowSignal*0.34,
    watercolor:(includes(tags,'watercolor','ink','painted')?0.88:0)+((hints.paperLike===true)?0.12:0),
    realistic3d:(includes(tags,'3d','realistic','cinematic')?0.62:0)+(1-stats.pixelArtSignal)*0.22+stats.contrast*0.16
  };
  return Object.entries(scores).map(([id,score])=>({id,score:round(clamp01(score))})).sort((a,b)=>b.score-a.score);
}

function density(value){
  if(value>=0.28)return'high';
  if(value>=0.14)return'medium';
  return'low';
}

function compileVisualGrammar(stats,hintsInput={}){
  if(!stats||!Number.isFinite(stats.meanLuma))throw new TypeError('Reference frame statistics required');
  const hints=normalizeHints(hintsInput),styles=rankStyles(stats,hints);
  const tags=hints.tags;
  const dimensionality=includes(tags,'2d','sprite','pixel art','pixel-art')?'2d':
    includes(tags,'3d','voxel','isometric','fps')?'3d':'unknown';
  const lowKey=stats.meanLuma<0.46&&stats.contrast>0.12;
  const localEmitters=stats.glowSignal>0.11||includes(tags,'emissive','warm windows','lamps','neon');
  const paletteMode=stats.quantizedColors<=16?'restricted':stats.quantizedColors<=40?'controlled':'broad';
  const materialTags=['stone','metal','wood','glass','wet','rust','cloth','vegetation','plaster']
    .filter(m=>includes(tags,m));
  const cameraType=includes(tags,'isometric')?'isometric':includes(tags,'orthographic')?'orthographic':
    includes(tags,'fps','first person')?'perspective-fps':includes(tags,'side view','platformer')?'side-view':'perspective-unspecified';
  const architectureTags=['gothic','cathedral','arch','bridge','tower','city','industrial','forest','organic']
    .filter(x=>includes(tags,x));
  const semanticConfidence=clamp01((tags.length?0.45:0)+(architectureTags.length?0.30:0)+(materialTags.length?0.15:0));

  return{
    schemaVersion:'1.0.0',
    primaryStyle:styles[0],styleCandidates:styles,
    dimensionality,
    palette:{mode:paletteMode,estimatedColors:stats.quantizedColors,saturation:stats.meanSaturation,
      warmBias:round(stats.warmRatio-stats.coolRatio)},
    lighting:{mode:lowKey?'low-key':'balanced',localEmitters,glowStrength:stats.glowSignal,
      contrast:stats.contrast,darkRatio:stats.darkRatio,highlightRatio:stats.highlightRatio,
      temperature:stats.warmRatio>stats.coolRatio*1.25?'warm':stats.coolRatio>stats.warmRatio*1.25?'cool':'mixed'},
    materials:{semantic:materialTags,proceduralPbr:true,wetSurface:includes(tags,'wet','rain-soaked')},
    geometry:{architecture:architectureTags,edgeDensity:stats.edgeDensity,detailDensity:density(stats.edgeDensity),
      blockiness:stats.pixelArtSignal,volumetric:dimensionality==='3d'},
    camera:{type:cameraType,aspect:stats.aspect,framing:hints.framing||'reference-driven'},
    motion:{energy:stats.motionEnergy,flicker:stats.temporalLumaFlicker,
      cadence:stats.motionEnergy>0.16?'active':stats.motionEnergy>0.04?'moderate':'subtle'},
    semantic:{tags,confidence:round(semanticConfidence),requiresExternalSemanticPass:semanticConfidence<0.55},
    evidence:{frameCount:stats.frameCount,pixelArtSignal:stats.pixelArtSignal,glowSignal:stats.glowSignal}
  };
}

module.exports={compileVisualGrammar};
