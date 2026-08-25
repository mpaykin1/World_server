import * as THREE from 'three';
import { NavigationGraph } from './navigation.js';

export class EventBus {
  constructor(){ this.map=new Map(); }
  on(name,fn){ if(!this.map.has(name))this.map.set(name,new Set()); this.map.get(name).add(fn); return()=>this.map.get(name)?.delete(fn); }
  emit(name,payload){ for(const fn of this.map.get(name)||[]) fn(payload); }
}

export class HealthComponent {
  constructor({max=100}={}){ this.max=max; this.value=max; this.alive=true; }
  damage(amount){ if(!this.alive)return 0; const d=Math.max(0,Math.min(this.value,amount)); this.value-=d; if(this.value<=0)this.alive=false; return d; }
  heal(amount){ if(!this.alive)return 0; const before=this.value; this.value=Math.min(this.max,this.value+Math.max(0,amount)); return this.value-before; }
}

export class InventoryComponent {
  constructor({capacity=24}={}){ this.capacity=capacity; this.items=[]; }
  add(item){ if(this.items.length>=this.capacity)return false; this.items.push(item); return true; }
  remove(id){ const i=this.items.findIndex(x=>x.id===id); return i<0?null:this.items.splice(i,1)[0]; }
}

export class CheckpointComponent {
  constructor(){ this.position=null; this.yaw=0; }
  set(position,yaw=0){ this.position=position.clone(); this.yaw=yaw; }
  apply(player){ if(!this.position)return false; player.position.copy(this.position); player.lastSafePosition.copy(this.position); player.yaw=this.yaw; player.velocity.set(0,0,0); return true; }
}

export class InteractionSystem {
  constructor({camera,maxDistance=2.4}={}){ this.camera=camera; this.maxDistance=maxDistance; this.raycaster=new THREE.Raycaster(); }
  find(root){ this.raycaster.setFromCamera(new THREE.Vector2(0,0),this.camera); this.raycaster.far=this.maxDistance; return this.raycaster.intersectObject(root,true).find(h=>h.object.userData?.interactable) || null; }
  interact(root,ctx){ const hit=this.find(root); if(!hit)return false; hit.object.userData.interact?.({hit,...ctx}); return true; }
}

export class CharacterActionContract {
  constructor(player){ this.player=player; }
  frame(){ return this.player.getActionFrame(); }
  weaponDirection(out=new THREE.Vector3()){ return out.copy(this.frame().feetForward); }
  validateWeapon({kind,heldHands,forward}){
    const feet=this.frame().feetForward;
    const dir=forward.clone().setY(0).normalize();
    const aligned=dir.dot(feet)>0.985;
    const handsOk=kind==='automatic' ? heldHands===2 : kind==='pistol' ? heldHands===1 : heldHands>=1;
    return {pass:aligned&&handsOk, aligned, handsOk, feetForward:feet.clone()};
  }
  shieldPose({threatPosition,torsoPosition,shieldPosition,shieldUp}){
    const toThreat=threatPosition.clone().sub(torsoPosition).setY(0).normalize();
    const torsoToShield=shieldPosition.clone().sub(torsoPosition).setY(0).normalize();
    const between=toThreat.dot(torsoToShield)>0.75;
    const vertical=Math.abs(shieldUp.clone().normalize().dot(new THREE.Vector3(0,1,0)))>0.96;
    return {pass:between&&vertical,between,vertical};
  }
}

export class GameplayCore {
  constructor(player, navigationData=null){
    this.events=new EventBus(); this.health=new HealthComponent(); this.inventory=new InventoryComponent(); this.checkpoint=new CheckpointComponent();
    this.actions=new CharacterActionContract(player); this.navigation=navigationData?new NavigationGraph(navigationData):null;
  }
}
