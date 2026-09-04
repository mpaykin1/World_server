'use strict';
const fs=require('fs');const path=require('path');
const DEFAULT_POLICY={schemaVersion:'1.0.0',tiers:{full:{maxDistance:30,tickRate:1.0,animDetail:'full',aiEnabled:true,physicsDetail:'full',despawn:false},high:{maxDistance:60,tickRate:0.5,animDetail:'reduced',aiEnabled:true,physicsDetail:'reduced',despawn:false},medium:{maxDistance:100,tickRate:0.25,animDetail:'minimal',aiEnabled:false,physicsDetail:'bbox',despawn:false},low:{maxDistance:160,tickRate:0,animDetail:'none',aiEnabled:false,physicsDetail:'none',despawn:true}},tierOrder:['full','high','medium','low']};
function loadPolicy(policyPath){if(!policyPath)return DEFAULT_POLICY;try{const parsed=JSON.parse(fs.readFileSync(path.resolve(policyPath),'utf8'));if(parsed&&parsed.tiers)return parsed;}catch(_){}return DEFAULT_POLICY;}
function getLodTier(distance,policy){const p=policy||DEFAULT_POLICY,tiers=p.tiers,order=p.tierOrder||Object.keys(tiers),d=Math.max(0,Number(distance)||0);for(const name of order){const t=tiers[name];if(t&&d<=t.maxDistance)return name;}return order[order.length-1]||'low';}
function getTierConfig(name,policy){return (policy||DEFAULT_POLICY).tiers[name]||null;}
function shouldTick(dt,name,policy){const t=getTierConfig(name,policy);return !!t&&t.tickRate>0&&dt>=1/t.tickRate;}
function computeUpdateInterval(name,policy){const t=getTierConfig(name,policy);return !t||t.tickRate<=0?Infinity:1/t.tickRate;}
module.exports={DEFAULT_POLICY,loadPolicy,getLodTier,getTierConfig,shouldTick,computeUpdateInterval};
