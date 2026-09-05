import test from 'node:test';import assert from 'node:assert/strict';import {createTerrainResolver} from '../runtime/terrain-resolver.mjs';
test('terrain resolver reuses first valid existing source',()=>{const r=createTerrainResolver(()=>null,()=>({y:7,normal:[0,1,0]}));assert.equal(r([1,2,3]).y,7);});
