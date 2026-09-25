/**
 * Actual two-finger RTS zoom, opt-in only. One finger still uses the existing
 * Three.js orbit controls; default playable mobile controls remain untouched.
 */
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
export function pinchDistance(a,b){
 if(!a||!b)return 0;
 return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
}
export function rtsPinchRadius(previousRadius,lastDistance,nextDistance){
 if(![previousRadius,lastDistance,nextDistance].every(Number.isFinite)||
    previousRadius<=0||lastDistance<5||nextDistance<5)
  return previousRadius;
 return clamp(previousRadius*lastDistance/nextDistance,85,600);
}
export function bindRtsPinch(canvas,{getRadius,setRadius,isEnabled}){
 if(!canvas?.addEventListener||typeof getRadius!=='function'||
    typeof setRadius!=='function'||typeof isEnabled!=='function')
  throw Error('canvas and live RTS camera required');
 const previousTouchAction=canvas.style.touchAction;
 canvas.style.touchAction='none';
 let prev=0,active=false,zoomEvents=0,lastRadius=getRadius();
 const tracking=event=>{
  if(!isEnabled())return;
  if(event.touches?.length===2){
   prev=pinchDistance(event.touches[0],event.touches[1]);
   active=prev>=5;
   window.__AI3D_RTS_PINCH_ACTIVE__=active;
  }else{active=false;prev=0;window.__AI3D_RTS_PINCH_ACTIVE__=false;}
 };
 const move=event=>{
  if(!isEnabled()||event.touches?.length!==2)return;
  const next=pinchDistance(event.touches[0],event.touches[1]);
  if(next<5)return;
  if(active&&prev>=5){
   const zoom=rtsPinchRadius(getRadius(),prev,next);
   if(zoom!==getRadius()){
    setRadius(zoom);lastRadius=zoom;zoomEvents++;
   }
  }
  prev=next;active=true;window.__AI3D_RTS_PINCH_ACTIVE__=true;
  if(event.cancelable)event.preventDefault();
 };
 const reset=event=>tracking(event);
 canvas.addEventListener('touchstart',tracking,{passive:false});
 canvas.addEventListener('touchmove',move,{passive:false});
 canvas.addEventListener('touchend',reset,{passive:false});
 canvas.addEventListener('touchcancel',reset,{passive:false});
 return{
  stats(){return{active,zoomEvents,lastRadius};},
  dispose(){
   canvas.removeEventListener('touchstart',tracking);
   canvas.removeEventListener('touchmove',move);
   canvas.removeEventListener('touchend',reset);
   canvas.removeEventListener('touchcancel',reset);
   canvas.style.touchAction=previousTouchAction;
   window.__AI3D_RTS_PINCH_ACTIVE__=false;
  }
 };
}
