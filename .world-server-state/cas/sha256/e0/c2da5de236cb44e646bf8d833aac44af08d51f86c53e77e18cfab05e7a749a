import * as THREE from 'three';
const TMP=new THREE.Vector3();
export class PortalVisibilitySystem{
  constructor({rooms=[],portals=[],nearBypassRadius=42}={}){this.rooms=new Map(rooms.map(r=>[r.id,r]));this.portals=portals;this.nearBypassRadius=nearBypassRadius;this.currentRoom=null;this.visibleRooms=new Set(this.rooms.keys());}
  setCurrentRoom(roomId){this.currentRoom=this.rooms.has(roomId)?roomId:null;this.visibleRooms=this._reachable(this.currentRoom);return this.visibleRooms;}
  _reachable(start){if(!start)return new Set(this.rooms.keys());const seen=new Set([start]),q=[start];while(q.length){const r=q.shift();for(const p of this.portals){if(p.open===false)continue;let n=null;if(p.a===r)n=p.b;else if(p.b===r)n=p.a;if(n&&this.rooms.has(n)&&!seen.has(n)){seen.add(n);q.push(n);}}}return seen;}
  apply(root,playerPosition){let hidden=0,shown=0;root?.traverse?.(o=>{const room=o.userData?.roomId;if(!room)return;let near=false;if(playerPosition&&o.getWorldPosition){o.getWorldPosition(TMP);near=TMP.distanceTo(playerPosition)<=this.nearBypassRadius;}const visible=near||!this.currentRoom||this.visibleRooms.has(room);o.visible=visible;if(visible)shown++;else hidden++;});return{hidden,shown};}
  report(){return{mode:'conservative-portal-room-visibility-v1',rooms:this.rooms.size,portals:this.portals.length,currentRoom:this.currentRoom,nearBypassRadius:this.nearBypassRadius,unknownRoomFailVisible:true,nearFieldNeverPortalCulled:true};}
}
