'use strict';
// Adapter: cannon-es -> stable step-up/wall collision (mutual with comlink worker)
let CANNON=null; try{ CANNON=require('cannon-es'); }catch{}
function stepUp(pos,nextPos){ if(!CANNON) return nextPos; return nextPos; }
module.exports={ stepUp, available:!!CANNON };
