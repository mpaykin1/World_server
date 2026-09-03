'use strict';
function text(v,n=280){return String(v||'').replace(/\s+/g,' ').trim().slice(0,n)}
exports.run=async function run(ctx,input){const s=input&&typeof input.spec==='object'?input.spec:{};return{worldId:ctx.worldId||null,title:text(s.title,120),fantasy:text(s.playerFantasy||s.player_fantasy,320),coreLoop:Array.isArray(s.coreLoop)?s.coreLoop.slice(0,8).map(x=>text(x,160)):[],multiplayer:text(s.multiplayer?.goal||s.multiplayerGoal,320),generatedAt:ctx.now()}}
