'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const s=fs.readFileSync('apps/ai3d-voxel-city/client.js','utf8');
test('stream cache skips unchanged state',()=>{assert.ok(s.includes('origin.x===lastStreamOriginX'));assert.ok(s.includes('profileName===lastStreamProfile'));assert.ok(s.includes('if(!force&&origin.x===lastStreamOriginX'));});
test('stream hot path removes sqrt/temp vector',()=>{const a=s.indexOf('function streamingOrigin'),b=s.indexOf('function updatePerformanceLabel',a),x=s.slice(a,b);assert.ok(x.includes('if(playableMode) return player'));assert.ok(x.includes('dSq=dx*dx+dz*dz'));assert.ok(!x.includes('Math.hypot'));assert.ok(!x.includes('new THREE.Vector3'));});
test('collision lookup and input lifecycle are allocation-safe',()=>{assert.ok(s.includes('occupancySet=new Map()'));assert.ok(s.includes('occupancySet.get(ix)?.get(iy)?.has(iz)===true'));assert.ok(s.includes('function releasePlayableInputs'));assert.ok(s.includes('keysHeld.clear()'));});
