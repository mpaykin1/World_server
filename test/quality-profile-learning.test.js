'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {recommend}=require('../api/quality-profile.js');
function rows(n,values){return Array.from({length:n},()=>({fps:values.fps,frame_p95_ms:values.frame,jank_rate:values.jank,input_latency_p95_ms:values.input,stutter_score:values.stutter,message:null}));}
test('profile learning protects weak devices',()=>{assert.equal(recommend(rows(40,{fps:24,frame:70,jank:.3,input:150,stutter:.7})).profile,'performance');});
test('profile learning permits ultra only with strong evidence',()=>{const r=recommend(rows(40,{fps:60,frame:17,jank:.02,input:30,stutter:.08}));assert.equal(r.profile,'ultra');assert.equal(r.confidence,'medium');});
test('profile learning defaults conservatively with little evidence',()=>{assert.equal(recommend(rows(3,{fps:58,frame:18,jank:.02,input:20,stutter:.04})).profile,'high');});
