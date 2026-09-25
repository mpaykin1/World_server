/**
 * Cinematic RTS camera for geothermal scenes.
 * Keeps the geometrical horizon outside the vertical frustum at every orbit
 * angle, including mobile portrait and touch rotation. Pure math / unit-testable.
 */
const RAD=Math.PI/180;
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export function minimumPitch(fovDegrees,clearanceDegrees=14){
  if(!Number.isFinite(fovDegrees)||fovDegrees<20||fovDegrees>95)throw Error('invalid camera fov');
  return (fovDegrees*.5+clearanceDegrees)*RAD;
}
export function horizonMarginDegrees(pitchRadians,fovDegrees){
  return pitchRadians/RAD-fovDegrees*.5;
}
export function limitStrategyPitch(nextPitch,fovDegrees=50){
  if(!Number.isFinite(nextPitch))throw Error('invalid camera pitch');
  return clamp(nextPitch,minimumPitch(fovDegrees),1.26);
}
export function strategyFraming({width=1280,height=720,tier='balanced'}={}){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<240||height<240)throw Error('invalid viewport');
  const aspect=width/height,portrait=aspect<.82;
  const fov=portrait?56:50;
  const pitch=limitStrategyPitch(portrait?.81:.745,fov);
  const distance=portrait?225:170;
  return {
    mode:'fixed-horizon-free-rts',aspect,portrait,tier,
    fov,pitch,yaw:.46,distance,
    // Plant at (-72, 0, -42); mountain behind it at (-107,-13,-167).
    target:[portrait?-80:-79,portrait?19:17,portrait?-74:-69],
    horizonClearanceDeg:horizonMarginDegrees(pitch,fov),
    cameraHeightOverTarget:Math.sin(pitch)*distance,
    targetVisible:true
  };
}
export function applyStrategyFraming(camera,frame,THREE){
  if(!camera?.isPerspectiveCamera||!THREE?.Vector3)throw Error('existing THREE perspective camera required');
  const [x,y,z]=frame.target;
  const cp=Math.cos(frame.pitch),sp=Math.sin(frame.pitch);
  const sy=Math.sin(frame.yaw),cy=Math.cos(frame.yaw);
  camera.fov=frame.fov;camera.aspect=frame.aspect;
  camera.far=Math.min(camera.far,700);
  camera.updateProjectionMatrix();
  camera.position.set(x+frame.distance*sy*cp,y+frame.distance*sp,z+frame.distance*cy*cp);
  camera.lookAt(new THREE.Vector3(x,y,z));
  camera.updateMatrixWorld(true);
  return {
    viewPitchRadians:frame.pitch,
    horizonMarginDegrees:horizonMarginDegrees(frame.pitch,frame.fov),
    cameraPosition:camera.position.toArray(),
    target:frame.target.slice(),fov:frame.fov,portrait:frame.portrait
  };
}
