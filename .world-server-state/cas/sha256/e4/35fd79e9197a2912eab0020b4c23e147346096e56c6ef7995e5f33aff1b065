'use strict';
// Adapter: idb-keyval -> offline evidence cache (mutual with worker + atlas)
let idb=null; try{ idb=require('idb-keyval'); }catch{}
async function cacheEvidence(k,v){ if(!idb) return; await idb.set(k,v); }
module.exports={ cacheEvidence, available:!!idb };
