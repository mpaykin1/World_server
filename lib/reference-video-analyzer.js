'use strict';

function list(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [value];
}
function lowerList(value) { return list(value).map(v => String(v).trim().toLowerCase()).filter(Boolean); }
function mode(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a,b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || null;
}
function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? Number((nums.reduce((a,b) => a + b, 0) / nums.length).toFixed(4)) : null;
}
function unique(values, limit = 24) { return [...new Set(values.filter(Boolean))].slice(0, limit); }

function analyzeVideoFrames(frames = []) {
  const valid = frames.filter(frame => frame && typeof frame === 'object');
  const styles=[],tags=[],objects=[],palette=[],dimensions=[],cameras=[],motions=[],contrasts=[],fog=[],emissive=[],motionAmounts=[];
  for (const frame of valid) {
    styles.push(...lowerList(frame.style || frame.styles)); tags.push(...lowerList(frame.tags));
    objects.push(...lowerList(frame.objects || frame.objectKinds)); palette.push(...list(frame.palette));
    dimensions.push(String(frame.dimension || '').toLowerCase()); cameras.push(String(frame.camera?.mode || frame.cameraMode || '').toLowerCase());
    motions.push(...lowerList(frame.motion?.types || frame.motionTypes)); contrasts.push(frame.lighting?.contrast);
    fog.push(frame.lighting?.fog); emissive.push(frame.lighting?.emissive); motionAmounts.push(frame.motion?.amount);
  }
  const stableStyle=mode(styles), styleShare=stableStyle&&styles.length ? styles.filter(x => x===stableStyle).length/styles.length : 0;
  return {frameCount:valid.length,styles:unique(styles),dominantStyle:stableStyle,styleStability:Number(styleShare.toFixed(4)),
    tags:unique(tags),objects:unique(objects),palette:unique(palette,32),dimension:mode(dimensions.filter(Boolean)),cameraMode:mode(cameras.filter(Boolean)),
    motionTypes:unique(motions),lighting:{contrast:average(contrasts),fog:average(fog),emissive:average(emissive)},motionAmount:average(motionAmounts)};
}

function analyzeReference(reference = {}) {
  const temporal=analyzeVideoFrames(reference.frames || []);
  return {sourceType:String(reference.sourceType || (temporal.frameCount>1?'video':'image')).toLowerCase(),
    frameCount:temporal.frameCount || Number(reference.frameCount) || 1,
    styles:unique([...lowerList(reference.style || reference.styles),...temporal.styles]),
    tags:unique([...lowerList(reference.tags),...temporal.tags]),objects:unique([...lowerList(reference.objects || reference.objectKinds),...temporal.objects]),
    palette:unique([...list(reference.palette),...temporal.palette],32),dimension:String(reference.dimension || temporal.dimension || '').toLowerCase() || null,
    cameraMode:String(reference.camera?.mode || reference.cameraMode || temporal.cameraMode || '').toLowerCase() || null,
    lighting:{...temporal.lighting,...(reference.lighting || {})},motionTypes:unique([...lowerList(reference.motion?.types || reference.motionTypes),...temporal.motionTypes]),
    motionAmount:Number.isFinite(Number(reference.motion?.amount))?Number(reference.motion.amount):temporal.motionAmount,temporal};
}
module.exports={analyzeVideoFrames,analyzeReference};
