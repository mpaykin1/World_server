'use strict';
// Adapter: comlink -> typed worker RPC (mutual with physics + atlas)
let comlink=null; try{ comlink=require('comlink'); }catch{}
module.exports={ expose:(obj)=>comlink?comlink.expose(obj):null, wrap:(p)=>comlink?comlink.wrap(p):p, available:!!comlink };
