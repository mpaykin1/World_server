class Vec3{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}clone(){return new Vec3(this.x,this.y,this.z);}copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}length(){return Math.hypot(this.x,this.y,this.z);}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}normalize(){const l=this.length()||1;return this.multiplyScalar(1/l);}}
class Attr{constructor(a,itemSize){this.array=a;this.itemSize=itemSize;this.needsUpdate=false;}setXYZ(i,x,y,z){const o=i*this.itemSize;this.array[o]=x;this.array[o+1]=y;this.array[o+2]=z;}setX(i,x){this.array[i*this.itemSize]=x;}}
class Geo{constructor(){this.attrs={};this.drawRange={start:0,count:Infinity};}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}setDrawRange(start,count){this.drawRange={start,count};}dispose(){this.disposed=true;}}
class PlaneGeometry extends Geo{constructor(...a){super();this.args=a;}}
class BufferGeometry extends Geo{}
class Mat{constructor(o={}){Object.assign(this,o);this.uniforms=o.uniforms||{};}dispose(){this.disposed=true;}}
class Object3D{constructor(){this.position=new Vec3();this.scale={x:1,y:1,z:1,set:(x,y,z)=>{this.scale.x=x;this.scale.y=y;this.scale.z=z;},setScalar:s=>{this.scale.x=this.scale.y=this.scale.z=s;}};this.rotation={x:0,y:0,z:0,set:(x,y,z)=>{this.rotation.x=x;this.rotation.y=y;this.rotation.z=z;}};this.quaternion={setFromUnitVectors:()=>this.quaternion};this.visible=true;this.parent=null;}}
class Mesh extends Object3D{constructor(g,m){super();this.geometry=g;this.material=m;}}
class Points extends Mesh{}
class PointLight extends Object3D{constructor(c,i,d,decay){super();this.color={set:()=>{}};this.intensity=i;this.distance=d;this.decay=decay;}}
export const THREE={Vector3:Vec3,BufferAttribute:Attr,BufferGeometry,PlaneGeometry,ShaderMaterial:Mat,Mesh,Points,PointLight,DoubleSide:2,AdditiveBlending:2};
export function fakeScene(){return {children:[],add(o){if(!this.children.includes(o))this.children.push(o);o.parent=this;},remove(o){this.children=this.children.filter(x=>x!==o);o.parent=null;}};}
export function fakeRenderer(){return {capabilities:{isWebGL2:true},info:{render:{calls:1}},domElement:{addEventListener(){},removeEventListener(){}},getContext(){return {getExtension(){return null;}}},compile(){}};}
