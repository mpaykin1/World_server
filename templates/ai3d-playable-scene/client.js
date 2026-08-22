import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x6f8496);
const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.05,500); camera.position.set(0,1.65,6);
const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setSize(innerWidth,innerHeight); document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x333333,1.5));
const floor=new THREE.Mesh(new THREE.BoxGeometry(30,.5,30),new THREE.MeshStandardMaterial({color:0x55585d})); floor.position.y=-.25; scene.add(floor);
const obstacles=[]; for(const [x,z] of [[0,-5],[-5,-2],[5,-2]]){const m=new THREE.Mesh(new THREE.BoxGeometry(3,4,3),new THREE.MeshStandardMaterial({color:0x493c3a}));m.position.set(x,2,z);scene.add(m);obstacles.push(m);}
const player={x:0,z:6,y:1.65,radius:.35,speed:4}; let yaw=0,pitch=0;
function collides(nx,nz){for(const o of obstacles){const b=new THREE.Box3().setFromObject(o);if(nx+player.radius>b.min.x&&nx-player.radius<b.max.x&&nz+player.radius>b.min.z&&nz-player.radius<b.max.z)return true;}return false;}
renderer.domElement.addEventListener('click',()=>window.__AI3D_PLAYABLE_SCENE__.requestMouseLook(renderer.domElement));
addEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer.domElement)return;yaw-=e.movementX*.0023;pitch=Math.max(-1.45,Math.min(1.45,pitch-e.movementY*.0023));});
window.__AI3D_PLAYABLE_SCENE__.reportReady({walkable:true,collisions:true,grounding:true,playerSpawn:true});
let last=performance.now(); function loop(now){requestAnimationFrame(loop);const dt=Math.min(.04,(now-last)/1000);last=now;const i=window.__AI3D_PLAYABLE_SCENE__.input();let f=(i.forward?1:0)-(i.back?1:0),s=(i.right?1:0)-(i.left?1:0);const l=Math.hypot(f,s)||1;f/=l;s/=l;const sp=player.speed*(i.run?1.8:1),sin=Math.sin(yaw),cos=Math.cos(yaw),dx=(s*cos+f*sin)*sp*dt,dz=(s*sin-f*cos)*sp*dt;const nx=player.x+dx,nz=player.z+dz;if(!collides(nx,player.z))player.x=nx;if(!collides(player.x,nz))player.z=nz;camera.position.set(player.x,player.y,player.z);camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;window.__AI3D_PLAYABLE_SCENE__.frame();renderer.render(scene,camera);}requestAnimationFrame(loop);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
