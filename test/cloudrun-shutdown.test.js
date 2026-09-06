'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');

function fixture(){
 const source=fs.readFileSync(path.join(__dirname,'../google-ai-studio/cloudrun-entry.cjs'),'utf8');
 const child=new EventEmitter();child.exitCode=null;child.signalCode=null;child.killed=false;
 const signals=[],exits=[],timers=[];child.kill=s=>{signals.push(s);child.killed=true;return true;};
 let closed;
 const ctx=vm.createContext({child,console:{log(){}},server:{close:fn=>{closed=fn;},closeAllConnections(){}},
   process:{exit:code=>exits.push(code)},setTimeout:(fn,ms)=>{const t={fn,ms,unref(){return this;}};timers.push(t);return t;},clearTimeout:t=>{t.cleared=true;}});
 vm.runInContext('let shuttingDown=false;'+source.slice(source.indexOf('function shutdown(signal)'),source.indexOf("process.on('SIGTERM'")),ctx);
 return {ctx,child,signals,exits,timers,close:()=>closed()};
}
test('Cloud Run shutdown waits for child exit even after HTTP listener closes',()=>{
 const f=fixture();f.ctx.shutdown('SIGTERM');f.close();
 assert.deepEqual(f.signals,['SIGTERM']);assert.deepEqual(f.exits,[],'must not orphan a child that is still draining');
 f.child.exitCode=0;f.child.emit('exit',0,null);assert.deepEqual(f.exits,[0]);
});
test('Cloud Run shutdown escalates an unresponsive child and is idempotent',()=>{
 const f=fixture();f.ctx.shutdown('SIGTERM');f.ctx.shutdown('SIGINT');f.close();
 const deadline=f.timers.find(t=>t.ms===8000);assert.ok(deadline);deadline.fn();
 assert.deepEqual(f.signals,['SIGTERM','SIGKILL']);assert.deepEqual(f.exits,[1]);
});
