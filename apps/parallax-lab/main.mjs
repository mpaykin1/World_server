import {createPixelParallax} from '../../shared/graphics/pixel-parallax.mjs';
const staticFrame=new URLSearchParams(location.search).has('static');
const canvas=document.getElementById('world'),snowButton=document.getElementById('snow'),pauseButton=document.getElementById('pause');
const scene=createPixelParallax(canvas,{reducedMotion:staticFrame||window.matchMedia('(prefers-reduced-motion: reduce)').matches});
let dragging=false,lastX=0,paused=false,snow=true;
const keys=new Set();
canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{
 if(!dragging)return;
 const scale=Math.max(canvas.clientWidth/480,canvas.clientHeight/270);
 scene.pan((lastX-e.clientX)/scale);lastX=e.clientX;
});
function release(){dragging=false}
canvas.addEventListener('pointerup',release);
canvas.addEventListener('pointercancel',release);
window.addEventListener('resize',()=>scene.resize());
window.addEventListener('keydown',e=>{
 if(['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)){e.preventDefault();keys.add(e.code)}
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>keys.clear());
let previous=performance.now();
function controls(now){
 const dt=Math.min((now-previous)/1000,0.05);previous=now;
 const direction=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);
 if(direction)scene.pan(direction*95*dt);
 requestAnimationFrame(controls);
}
if(!staticFrame)requestAnimationFrame(controls);
snowButton.addEventListener('click',()=>{
 snow=!snow;scene.setSnow(snow);snowButton.setAttribute('aria-pressed',String(snow));
 snowButton.textContent='❄ Снег: '+(snow?'вкл':'выкл');
});
pauseButton.addEventListener('click',()=>{
 paused=!paused;scene.setPaused(paused);pauseButton.setAttribute('aria-pressed',String(paused));
 pauseButton.textContent=paused?'▶ Продолжить':'Ⅱ Пауза';
});
window.addEventListener('pagehide',()=>scene.dispose(),{once:true});