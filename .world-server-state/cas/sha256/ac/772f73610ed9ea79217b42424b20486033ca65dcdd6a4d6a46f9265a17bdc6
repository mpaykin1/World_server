import { NetworkInterestManager } from './network-interest-manager.js';
import { DistantPoseSharing } from './distant-pose-sharing.js';
export class OptimizationOrchestrator{
 constructor({manifest}){const o=manifest.graphics?.fpsOptimization||{};this.network=new NetworkInterestManager({near:o.networkNearRadius??45,mid:o.networkMidRadius??120,far:o.networkFarRadius??260});this.poses=new DistantPoseSharing({nearRadius:o.poseNearRadius??50,shareRadius:o.poseShareRadius??110});}
 update(playerPos,now,fogFar){this.poses.update(playerPos);return this.network.plan(playerPos,now,fogFar)}
 report(){return{network:this.network.report(),poses:this.poses.report(),nearFieldQualityReduced:false};}
}
