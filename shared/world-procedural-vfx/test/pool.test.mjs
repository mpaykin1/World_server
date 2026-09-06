import test from 'node:test'; import assert from 'node:assert/strict'; import {ObjectPool} from '../runtime/pool.mjs';
test('pool bounds allocations and reuses',()=>{let n=0; const p=new ObjectPool({max:2,create:()=>({id:++n})}); const a=p.acquire(),b=p.acquire(),c=p.acquire(); assert.equal(c,null); p.release(a); const d=p.acquire(); assert.equal(d.id,a.id); assert.equal(n,2);});
