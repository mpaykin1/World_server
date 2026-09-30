#!/usr/bin/env node
/**
 * Deterministic World Server Graphics Quality Governor scene-metrics collector.
 * Input: JSON scene manifest. Output: machine-readable KRIEGER_CLASS gate report.
 * This deliberately measures semantic evidence, not polycount.
 */
import fs from "node:fs";

const file=process.argv[2];
if(!file){ console.error("usage: node scripts/graphics-quality-metrics.mjs <scene.json>"); process.exit(2); }
const scene=JSON.parse(fs.readFileSync(file,"utf8"));
const objects=Array.isArray(scene.objects)?scene.objects:[];
const important=objects.filter(o=>o.important!==false);
const primitive=o=>["box","plane","cube"].includes(String(o.geometry||"").toLowerCase());
const layers=["macro","meso","micro","surface","state"];
const layerCoverage=o=>layers.filter(k=>o.semantic?.[k]===true).length/layers.length;
const ratio=(n,d)=>d? n/d:0;
const primitiveRatio=ratio(important.filter(primitive).length,important.length);
const secondaryCoverage=ratio(important.filter(o=>o.semantic?.meso||o.semantic?.micro).length,important.length);
const semanticCoverage=important.length?important.reduce((s,o)=>s+layerCoverage(o),0)/important.length:0;
const near=important.filter(o=>o.nearCamera);
const nearPrimitiveRatio=ratio(near.filter(primitive).length,near.length);
const materialRichness=ratio(important.filter(o=>o.material?.variation||o.material?.microrelief||o.material?.zones>1).length,important.length);
const lightingEvidence=scene.lighting?.geometryResponse===true;
const styleJustifies=scene.styleProfile?.intentionalPrimitiveMinimalism===true;

const metrics={primitiveRatio,secondaryCoverage,semanticCoverage,nearPrimitiveRatio,materialRichness,lightingEvidence};
const gates={
  NEAR_OBJECT_GATE: styleJustifies || near.length===0 || nearPrimitiveRatio<0.5,
  MATERIAL_GATE: styleJustifies || materialRichness>=0.5,
  LIGHTING_GATE: scene.styleProfile?.requiresDynamicLighting===false || lightingEvidence,
  ENVIRONMENT_GATE: styleJustifies || (primitiveRatio<0.7 && secondaryCoverage>=0.5)
};
const failed=Object.entries(gates).filter(([,v])=>!v).map(([k])=>k);
const report={schemaVersion:1,tier:"KRIEGER_CLASS",sceneId:scene.id||file,metrics,gates,failed,status:failed.length?"PROTOTYPE_OR_BLOCKED":"PUBLISH_CANDIDATE_NOT_LIVE_VERIFIED"};
process.stdout.write(JSON.stringify(report,null,2)+"\n");
process.exit(failed.length?1:0);
